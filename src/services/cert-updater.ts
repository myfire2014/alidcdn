import * as acme from 'acme-client';
import { domainService, getCertNames } from './domain-service';
import { cloudflareClient } from './cloudflare-client';
import { dcdnSyncer } from './dcdn-syncer';
import { taskQueue } from './task-queue';
import { sseController } from '../controllers/sse-controller';
import { logCertUpdate } from './audit-logger';
import { certMonitor } from './cert-monitor';
import { getBaseDomain } from '../utils/validators';
import type { TaskStatus } from '../types';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

// DNS propagation check (DoH polling)
const DNS_POLL_INTERVAL_MS = 3000;
const DNS_POLL_TIMEOUT_MS = 60000;
const DNS_FALLBACK_WAIT_MS = 10000;

export interface UpdateResult {
  success: boolean;
  message: string;
  certificate?: string;
  privateKey?: string;
  expiresOn?: string;
  names?: string[];
  dcdnResult?: {
    success: boolean;
    message: string;
    results?: Array<{ domainName: string; success: boolean; error?: string }>;
  };
}

export type ProgressCallback = (step: string, message: string, progress: number) => void;

export class CertUpdater {
  private useStaging = false; // Set to true for testing

  /**
   * Update certificate for a domain entry - 申请 Let's Encrypt 多域名/泛域名证书并上传到 DCDN
   */
  async updateCertificate(domainId: number, onProgress?: ProgressCallback): Promise<UpdateResult> {
    const domain = domainService.get(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    const names = getCertNames(domain);

    const log = (step: string, message: string, progress: number) => {
      console.log(`[${step}] ${message}`);
      onProgress?.(step, message, progress);
    };

    log('init', `开始申请证书 (共 ${names.length} 个域名: ${names.join(', ')})`, 5);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log('init', `开始签发 (尝试 ${attempt}/${MAX_RETRIES})`, 5);
        const result = await this.performUpdate(domainId, names, domain.dcdn_enabled, log);

        logCertUpdate(domainId, domain.domain, 'success', {
          expiresOn: result.expiresOn,
          names
        });

        sseController.broadcastDomainUpdate(domainId, domain.domain, {
          action: 'cert_updated'
        });

        log('check', '重新检测证书状态...', 95);
        await certMonitor.checkDomain(domain.domain);

        log('done', '证书更新完成', 100);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        log('error', `尝试 ${attempt} 失败: ${lastError.message}`, attempt * 30);

        if (attempt < MAX_RETRIES) {
          log('retry', `等待 ${RETRY_DELAY_MS * attempt / 1000} 秒后重试...`, attempt * 30 + 5);
          await this.delay(RETRY_DELAY_MS * attempt);
        }
      }
    }

    logCertUpdate(domainId, domain.domain, 'failure', {
      error: lastError?.message
    });

    return {
      success: false,
      message: `Failed after ${MAX_RETRIES} attempts: ${lastError?.message}`
    };
  }

  /**
   * Perform the actual certificate update via Let's Encrypt
   * 所有域名 (主域名 + 附加域名/泛域名) 签发在同一张证书中
   */
  private async performUpdate(
    domainId: number,
    names: string[],
    syncToDcdn: boolean,
    log: (step: string, message: string, progress: number) => void
  ): Promise<UpdateResult> {
    // Step 1: Create account key
    log('account', '生成账户密钥...', 8);
    const accountKey = await acme.crypto.createPrivateRsaKey();

    // Step 2: Create ACME client
    log('client', `连接 Let's Encrypt ${this.useStaging ? '(测试环境)' : '(生产环境)'}...`, 12);
    const client = new acme.Client({
      directoryUrl: this.useStaging
        ? acme.directory.letsencrypt.staging
        : acme.directory.letsencrypt.production,
      accountKey
    });

    // Step 3: Create CSR covering all names (wildcards included)
    log('csr', `生成 CSR (${names.length} 个域名)...`, 16);
    const [certificateKey, certificateCsr] = await acme.crypto.createCsr({
      altNames: names
    });

    // Step 4: Resolve Cloudflare zone for each name (wildcards use base domain)
    log('zone', '查找 Cloudflare Zones...', 20);
    const zoneIds = new Map<string, string>();
    for (const name of names) {
      const base = getBaseDomain(name);
      if (zoneIds.has(base)) continue;
      const zoneId = await this.getCloudflareZoneId(base);
      if (!zoneId) {
        throw new Error(`Cloudflare zone not found for ${base}. DNS must be managed by Cloudflare.`);
      }
      zoneIds.set(base, zoneId);
    }
    log('zone', `已找到 ${zoneIds.size} 个 Zone`, 24);

    // Track created DNS records for cleanup
    const createdRecords: Array<{ zoneId: string; recordId: string }> = [];
    let dcdnResult: UpdateResult['dcdnResult'];

    try {
      // Step 5: Order certificate with dns-01 challenge for every name
      log('order', `创建证书订单 (${names.length} 个域名)...`, 30);

      const dnsChallengesDone = { count: 0 };
      const totalChallenges = names.length;

      const certificate = await client.auto({
        csr: certificateCsr,
        termsOfServiceAgreed: true,
        challengePriority: ['dns-01'],
        challengeCreateFn: async (authz, challenge, keyAuthorization) => {
          if (challenge.type !== 'dns-01') {
            throw new Error(`Unsupported challenge type: ${challenge.type}`);
          }

          const identifier = getBaseDomain(authz.identifier.value);
          const recordName = `_acme-challenge.${identifier}`;
          const zoneId = zoneIds.get(identifier);
          if (!zoneId) {
            throw new Error(`No Cloudflare zone resolved for ${identifier}`);
          }

          log('dns', `创建 DNS TXT 记录: ${recordName}`, this.challengeProgress(dnsChallengesDone.count, totalChallenges, 40));

          const record = await cloudflareClient.createDnsRecord(zoneId, {
            type: 'TXT',
            name: recordName,
            content: keyAuthorization,
            ttl: 60
          });

          createdRecords.push({ zoneId, recordId: record.id });
          dnsChallengesDone.count++;

          // Wait for DNS propagation (DoH polling, falls back to a fixed wait)
          await this.waitForDnsTxt(recordName, keyAuthorization);
          log('dns', `DNS 验证记录就绪 (${dnsChallengesDone.count}/${totalChallenges})`, this.challengeProgress(dnsChallengesDone.count, totalChallenges, 40));
        },
        challengeRemoveFn: async (authz) => {
          log('verify', `验证完成: ${authz.identifier.value}`, this.challengeProgress(dnsChallengesDone.count, totalChallenges, 40));
        }
      });

      log('cert', '证书已签发', 72);

      // Read real expiry from the issued certificate
      let expiresOn = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      try {
        const info = acme.crypto.readCertificateInfo(certificate);
        if (info.notAfter) {
          expiresOn = info.notAfter.toISOString();
        }
      } catch {
        // Keep the 90-day estimate
      }

      // Step 6: Store certificate for later manual DCDN sync
      log('store', '保存证书到本地...', 76);
      await dcdnSyncer.storeIssuedCertificate(domainId, certificate, certificateKey.toString(), names, expiresOn);

      // Step 7: Sync to DCDN if enabled (applies to all related DCDN domains)
      if (syncToDcdn) {
        log('dcdn', '同步证书到阿里云 DCDN...', 80);
        const sync = await dcdnSyncer.syncCertificate(domainId, certificate, certificateKey.toString());
        dcdnResult = { success: sync.success, message: sync.message, results: sync.results };
        log('dcdn', sync.success ? `DCDN 同步完成: ${sync.message}` : `DCDN 同步未完全成功: ${sync.message}`, 90);
      }

      return {
        success: true,
        message: syncToDcdn
          ? `证书已签发 (${names.length} 个域名) 并同步到 DCDN`
          : `证书已签发 (${names.length} 个域名)`,
        certificate,
        privateKey: certificateKey.toString(),
        expiresOn,
        names,
        dcdnResult
      };
    } finally {
      // Cleanup DNS records
      log('cleanup', `清理 ${createdRecords.length} 条 DNS 记录...`, 92);
      for (const record of createdRecords) {
        try {
          await cloudflareClient.deleteDnsRecord(record.zoneId, record.recordId);
        } catch (error) {
          console.error(`Failed to cleanup DNS record ${record.recordId}:`, error);
        }
      }
    }
  }

  /**
   * Progress inside the challenge phase (from to)
   */
  private challengeProgress(done: number, total: number, from: number): number {
    if (total <= 0) return from;
    return Math.min(from + 28, Math.round(from + 28 * (done / total)));
  }

  /**
   * Get Cloudflare Zone ID for domain
   */
  private async getCloudflareZoneId(domain: string): Promise<string | null> {
    try {
      const zones = await cloudflareClient.listZones();

      // Try exact match
      let zone = zones.find(z => z.name === domain);

      // Try parent domain (for subdomains)
      if (!zone) {
        const parts = domain.split('.');
        for (let i = 1; i < parts.length - 1; i++) {
          const parent = parts.slice(i).join('.');
          zone = zones.find(z => z.name === parent);
          if (zone) break;
        }
      }

      return zone?.id ?? null;
    } catch (error) {
      console.error('Failed to get Cloudflare zone:', error);
      return null;
    }
  }

  /**
   * Wait until a TXT record is resolvable via DNS-over-HTTPS.
   * Falls back to a fixed wait if the DoH query itself is unavailable.
   */
  private async waitForDnsTxt(recordName: string, expectedValue: string): Promise<void> {
    const deadline = Date.now() + DNS_POLL_TIMEOUT_MS;
    let dohAvailable = true;

    while (Date.now() < deadline) {
      try {
        const found = await this.queryTxtViaDoh(recordName);
        if (found.some(value => value === expectedValue)) {
          return;
        }
      } catch (error) {
        // DoH unavailable - fall back to a fixed propagation wait
        dohAvailable = false;
        console.warn('DoH query failed, falling back to fixed wait:', error);
        break;
      }
      await this.delay(DNS_POLL_INTERVAL_MS);
    }

    if (!dohAvailable) {
      await this.delay(DNS_FALLBACK_WAIT_MS);
    }
  }

  /**
   * Query TXT records via DNS-over-HTTPS (Cloudflare)
   */
  private async queryTxtViaDoh(recordName: string): Promise<string[]> {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(recordName)}&type=TXT`;
    const response = await fetch(url, { headers: { accept: 'application/dns-json' } });
    if (!response.ok) {
      throw new Error(`DoH query failed: ${response.status}`);
    }

    const data = await response.json() as {
      Answer?: Array<{ type: number; data: string }>;
    };

    return (data.Answer || [])
      .filter(answer => answer.type === 16)
      .map(answer => answer.data.replace(/^"|"$/g, '').replace(/"\s+"/g, ''));
  }

  /**
   * Enqueue certificate update task
   */
  enqueueUpdate(domainId: number): string {
    const domain = domainService.get(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    return taskQueue.enqueue(
      { type: 'update', domainId },
      domain.domain
    );
  }

  /**
   * Execute update task (called by task queue)
   */
  async executeUpdateTask(task: TaskStatus): Promise<void> {
    taskQueue.updateProgress(task.id, 10, 'Starting certificate request...');

    try {
      taskQueue.updateProgress(task.id, 20, 'Creating ACME order...');
      const result = await this.updateCertificate(task.domainId);

      if (result.success) {
        taskQueue.completeTask(task.id, true, result.message);
      } else {
        taskQueue.completeTask(task.id, false, result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      taskQueue.completeTask(task.id, false, `Update failed: ${message}`, message);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const certUpdater = new CertUpdater();
