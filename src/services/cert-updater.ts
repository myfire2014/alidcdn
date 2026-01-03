import * as acme from 'acme-client';
import { domainService } from './domain-service';
import { cloudflareClient } from './cloudflare-client';
import { dcdnSyncer } from './dcdn-syncer';
import { taskQueue } from './task-queue';
import { sseController } from '../controllers/sse-controller';
import { logCertUpdate } from './audit-logger';
import { certMonitor } from './cert-monitor';
import type { TaskStatus } from '../types';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export interface UpdateResult {
  success: boolean;
  message: string;
  certificate?: string;
  privateKey?: string;
  expiresOn?: string;
}

export type ProgressCallback = (step: string, message: string, progress: number) => void;

export class CertUpdater {
  private useStaging = false; // Set to true for testing

  /**
   * Update certificate for a domain - 申请 Let's Encrypt 证书并上传到 DCDN
   */
  async updateCertificate(domainId: number, onProgress?: ProgressCallback): Promise<UpdateResult> {
    const domain = domainService.get(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    const log = (step: string, message: string, progress: number) => {
      console.log(`[${step}] ${message}`);
      onProgress?.(step, message, progress);
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log('init', `开始申请证书 (尝试 ${attempt}/${MAX_RETRIES})`, 5);
        const result = await this.performUpdate(domain.domain, domain.dcdn_enabled, log);
        
        logCertUpdate(domainId, domain.domain, 'success', {
          expiresOn: result.expiresOn
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
   */
  private async performUpdate(
    domain: string, 
    syncToDcdn: boolean,
    log: (step: string, message: string, progress: number) => void
  ): Promise<UpdateResult> {
    // Step 1: Create account key
    log('account', '生成账户密钥...', 10);
    const accountKey = await acme.crypto.createPrivateRsaKey();
    
    // Step 2: Create ACME client
    log('client', `连接 Let's Encrypt ${this.useStaging ? '(测试环境)' : '(生产环境)'}...`, 15);
    const client = new acme.Client({
      directoryUrl: this.useStaging 
        ? acme.directory.letsencrypt.staging 
        : acme.directory.letsencrypt.production,
      accountKey
    });

    // Step 3: Create CSR
    log('csr', '生成证书签名请求 (CSR)...', 20);
    const [certificateKey, certificateCsr] = await acme.crypto.createCsr({
      altNames: [domain]
    });

    // Step 4: Get Cloudflare zone ID for DNS challenge
    log('zone', '查找 Cloudflare Zone...', 25);
    const zoneId = await this.getCloudflareZoneId(domain);
    if (!zoneId) {
      throw new Error(`Cloudflare zone not found for ${domain}. DNS must be managed by Cloudflare.`);
    }
    log('zone', `找到 Zone ID: ${zoneId.substring(0, 8)}...`, 30);

    // Track created DNS records for cleanup
    const createdRecords: Array<{ zoneId: string; recordId: string }> = [];

    try {
      // Step 5: Use auto mode to get certificate
      log('order', '创建证书订单...', 35);
      
      const certificate = await client.auto({
        csr: certificateCsr,
        termsOfServiceAgreed: true,
        challengePriority: ['dns-01'],
        challengeCreateFn: async (authz, challenge, keyAuthorization) => {
          if (challenge.type !== 'dns-01') {
            throw new Error(`Unsupported challenge type: ${challenge.type}`);
          }

          const recordName = `_acme-challenge.${authz.identifier.value}`;
          log('dns', `创建 DNS TXT 记录: ${recordName}`, 45);

          const record = await cloudflareClient.createDnsRecord(zoneId, {
            type: 'TXT',
            name: recordName,
            content: keyAuthorization,
            ttl: 60
          });

          createdRecords.push({ zoneId, recordId: record.id });
          log('dns', `DNS 记录已创建，等待传播...`, 50);

          // Wait for DNS propagation
          await this.delay(10000);
          log('dns', 'DNS 传播等待完成', 55);
        },
        challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
          log('verify', `验证完成: ${authz.identifier.value}`, 65);
        }
      });

      log('cert', '证书已签发', 75);

      // Step 6: Sync to DCDN if enabled
      if (syncToDcdn) {
        log('dcdn', '同步证书到阿里云 DCDN...', 80);
        const domainData = domainService.getByDomain(domain);
        if (domainData) {
          await dcdnSyncer.syncCertificate(
            domainData.id, 
            certificate, 
            certificateKey.toString()
          );
          log('dcdn', 'DCDN 同步完成', 90);
        }
      }

      // Calculate expiry (Let's Encrypt certs are valid for 90 days)
      const expiresOn = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      return {
        success: true,
        message: syncToDcdn 
          ? 'Certificate issued and synced to DCDN successfully' 
          : 'Certificate issued successfully',
        certificate,
        privateKey: certificateKey.toString(),
        expiresOn
      };
    } finally {
      // Cleanup DNS records
      log('cleanup', '清理 DNS 记录...', 92);
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
