import { credentialStore } from './credential-store';
import { domainService, getCertNames } from './domain-service';
import { taskQueue } from './task-queue';
import { sseController } from '../controllers/sse-controller';
import { logDCDNSync } from './audit-logger';
import { buildSignedUrl } from '../utils/aliyun-signature';
import { certCoversName } from '../utils/validators';
import type { TaskStatus } from '../types';

const DCDN_ENDPOINT = 'https://dcdn.aliyuncs.com';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export interface DCDNCertStatus {
  certName: string;
  certExpireTime: string;
  sslProtocol: string;
  certType: string;
}

export interface DCDNDomainInfo {
  domainName: string;
  domainStatus: string;
  sslProtocol: string;
  gmtCreated: string;
  gmtModified: string;
  cname: string;
}

export interface DCDNSyncItemResult {
  domainName: string;
  success: boolean;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  results?: DCDNSyncItemResult[];
}

export interface StoredCertificate {
  certificate: string;
  privateKey: string;
  names: string[];
  expiresOn: string | null;
}

export class DCDNSyncer {
  /**
   * Get Aliyun credentials
   */
  private async getCredentials(): Promise<{ accessKeyId: string; accessKeySecret: string }> {
    const accessKeyId = await credentialStore.getCredential('aliyun', 'access_key_id');
    const accessKeySecret = await credentialStore.getCredential('aliyun', 'access_key_secret');

    if (!accessKeyId || !accessKeySecret) {
      throw new Error('Aliyun credentials not configured');
    }

    return { accessKeyId, accessKeySecret };
  }

  /**
   * Make DCDN API request
   */
  private async request<T>(action: string, params: Record<string, string> = {}): Promise<T> {
    const { accessKeyId, accessKeySecret } = await this.getCredentials();

    const url = await buildSignedUrl(DCDN_ENDPOINT, accessKeyId, accessKeySecret, {
      Action: action,
      ...params
    });

    const response = await fetch(url);
    const data = await response.json() as T & { Code?: string; Message?: string };

    if (data.Code && data.Code !== '200' && data.Code !== 'OK') {
      throw new Error(`DCDN API error: ${data.Message || data.Code}`);
    }

    return data;
  }

  /**
   * 找出与域名条目证书相关的所有 DCDN 域名。
   * 证书覆盖规则: 精确匹配,或泛域名 *.base 覆盖其单级子域/泛域名自身。
   */
  async getMatchingDCDNDomains(domainId: number): Promise<DCDNDomainInfo[]> {
    const domain = domainService.get(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    const names = getCertNames(domain);
    const dcdnDomains = await this.listDCDNDomains();

    return dcdnDomains.filter(item => certCoversName(names, item.domainName));
  }

  /**
   * Store an issued certificate (called after issuance) so it can be
   * re-synced to DCDN without re-issuing
   */
  async storeIssuedCertificate(
    domainId: number,
    certificate: string,
    privateKey: string,
    names: string[],
    expiresOn: string
  ): Promise<void> {
    await credentialStore.setCredential('certificate', `cert:${domainId}`, certificate);
    await credentialStore.setCredential('certificate', `key:${domainId}`, privateKey);
    await credentialStore.setCredential('certificate', `names:${domainId}`, JSON.stringify(names));
    await credentialStore.setCredential('certificate', `expires:${domainId}`, expiresOn);
  }

  /**
   * Load the last issued certificate for a domain entry
   */
  async getStoredCertificate(domainId: number): Promise<StoredCertificate | null> {
    const certificate = await credentialStore.getCredential('certificate', `cert:${domainId}`);
    const privateKey = await credentialStore.getCredential('certificate', `key:${domainId}`);
    if (!certificate || !privateKey) {
      return null;
    }

    const namesRaw = await credentialStore.getCredential('certificate', `names:${domainId}`);
    const expiresOn = await credentialStore.getCredential('certificate', `expires:${domainId}`);

    let names: string[] = [];
    try {
      const parsed = namesRaw ? JSON.parse(namesRaw) : null;
      if (Array.isArray(parsed)) names = parsed.map(String);
    } catch {
      names = [];
    }

    return {
      certificate,
      privateKey,
      names,
      expiresOn: expiresOn || null
    };
  }

  /**
   * Sync certificate to all related DCDN domains (or an explicit selection).
   * 多域名/泛域名证书会应用到每一个相关联的 DCDN 域名上。
   */
  async syncCertificate(
    domainId: number,
    certificate: string,
    privateKey: string,
    options: { domains?: string[]; certName?: string } = {}
  ): Promise<SyncResult> {
    const domain = domainService.get(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    // Determine target DCDN domains
    let targets: string[];
    if (options.domains && options.domains.length > 0) {
      targets = [...new Set(options.domains.map(d => d.trim().replace(/\.$/, '').toLowerCase()))].filter(Boolean);
    } else {
      const matched = await this.getMatchingDCDNDomains(domainId);
      targets = matched.map(item => item.domainName);
    }

    if (targets.length === 0) {
      logDCDNSync(domainId, domain.domain, 'failure', { error: '没有匹配的 DCDN 域名' });
      return {
        success: false,
        message: '没有找到与该证书相关的 DCDN 域名,请确认域名已添加到 DCDN',
        results: []
      };
    }

    // Aliyun rejects re-uploading under an existing CertName ("The CertName already exists."),
    // so every target domain gets its own fresh, timestamped cert name per upload.
    const makeCertName = (target: string) =>
      `le-${target}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;

    const results: DCDNSyncItemResult[] = [];
    const pending = new Set(targets);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES && pending.size > 0; attempt++) {
      for (const target of [...pending]) {
        try {
          await this.request('SetDcdnDomainSSLCertificate', {
            DomainName: target,
            SSLProtocol: 'on',
            SSLPub: certificate,
            SSLPri: privateKey,
            CertType: 'upload',
            CertName: makeCertName(target)
          });
          pending.delete(target);
          results.push({ domainName: target, success: true });
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');
        }
      }

      if (pending.size > 0 && attempt < MAX_RETRIES) {
        await this.delay(RETRY_DELAY_MS * attempt);
      }
    }

    for (const target of pending) {
      results.push({ domainName: target, success: false, error: lastError?.message });
    }

    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const success = failed.length === 0;

    logDCDNSync(domainId, domain.domain, success ? 'success' : 'failure', {
      targets,
      domains: succeeded.map(r => r.domainName),
      failed: failed.map(r => ({ domain: r.domainName, error: r.error }))
    });

    sseController.broadcastDomainUpdate(domainId, domain.domain, {
      action: 'dcdn_synced',
      dcdnDomains: succeeded.map(r => r.domainName)
    });

    const message = success
      ? `已同步证书到 ${succeeded.length} 个 DCDN 域名`
      : `${succeeded.length} 个成功, ${failed.length} 个失败: ${failed.map(f => `${f.domainName}(${f.error})`).join(', ')}`;

    return { success, message, results };
  }

  /**
   * Sync the stored certificate of a domain entry to DCDN
   */
  async syncStoredCertificate(
    domainId: number,
    options: { domains?: string[] } = {}
  ): Promise<SyncResult> {
    const stored = await this.getStoredCertificate(domainId);
    if (!stored) {
      return {
        success: false,
        message: '尚未签发证书,请先执行"更新证书"后再同步'
      };
    }

    return this.syncCertificate(domainId, stored.certificate, stored.privateKey, options);
  }

  /**
   * Get DCDN domain certificate status
   */
  async getDCDNCertStatus(dcdnDomain: string): Promise<DCDNCertStatus | null> {
    try {
      const result = await this.request<{
        CertInfos?: {
          CertInfo?: Array<{
            CertName: string;
            CertExpireTime: string;
            SSLProtocol: string;
            CertType: string;
          }>;
        };
      }>('DescribeDcdnDomainCertificateInfo', {
        DomainName: dcdnDomain
      });

      const certInfo = result.CertInfos?.CertInfo?.[0];
      if (!certInfo) {
        return null;
      }

      return {
        certName: certInfo.CertName,
        certExpireTime: certInfo.CertExpireTime,
        sslProtocol: certInfo.SSLProtocol,
        certType: certInfo.CertType
      };
    } catch {
      return null;
    }
  }

  /**
   * Enqueue DCDN sync task
   */
  enqueueSync(domainId: number): string {
    const domain = domainService.get(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    return taskQueue.enqueue(
      { type: 'sync', domainId },
      domain.domain
    );
  }

  /**
   * Execute sync task (called by task queue) - uploads the stored certificate
   * to all related DCDN domains
   */
  async executeSyncTask(task: TaskStatus): Promise<void> {
    taskQueue.updateProgress(task.id, 10, 'Connecting to Aliyun DCDN...');

    try {
      taskQueue.updateProgress(task.id, 30, 'Uploading certificate...');
      const result = await this.syncStoredCertificate(task.domainId);

      if (result.success) {
        taskQueue.completeTask(task.id, true, result.message);
      } else {
        taskQueue.completeTask(task.id, false, result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      taskQueue.completeTask(task.id, false, `Sync failed: ${message}`, message);
    }
  }

  /**
   * Verify Aliyun credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.request('DescribeUserDcdnStatus');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all DCDN domains from Aliyun
   */
  async listDCDNDomains(): Promise<DCDNDomainInfo[]> {
    const domains: DCDNDomainInfo[] = [];
    let pageNumber = 1;
    const pageSize = 50;

    while (true) {
      const result = await this.request<{
        Domains?: {
          PageData?: Array<{
            DomainName: string;
            DomainStatus: string;
            SSLProtocol: string;
            GmtCreated: string;
            GmtModified: string;
            Cname: string;
          }>;
        };
        TotalCount?: number;
      }>('DescribeDcdnUserDomains', {
        PageSize: pageSize.toString(),
        PageNumber: pageNumber.toString()
      });

      const pageData = result.Domains?.PageData || [];
      for (const item of pageData) {
        domains.push({
          domainName: item.DomainName.replace(/\.$/, ''), // Remove trailing dot (FQDN format)
          domainStatus: item.DomainStatus,
          sslProtocol: item.SSLProtocol,
          gmtCreated: item.GmtCreated,
          gmtModified: item.GmtModified,
          cname: item.Cname
        });
      }

      if (pageData.length < pageSize || domains.length >= (result.TotalCount || 0)) {
        break;
      }
      pageNumber++;
    }

    return domains;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const dcdnSyncer = new DCDNSyncer();
