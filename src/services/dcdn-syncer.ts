import { credentialStore } from './credential-store';
import { domainService } from './domain-service';
import { taskQueue } from './task-queue';
import { sseController } from '../controllers/sse-controller';
import { logDCDNSync } from './audit-logger';
import { buildSignedUrl } from '../utils/aliyun-signature';
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

export interface SyncResult {
  success: boolean;
  message: string;
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
   * Sync certificate to DCDN domain
   */
  async syncCertificate(
    domainId: number,
    certificate: string,
    privateKey: string
  ): Promise<SyncResult> {
    const domain = domainService.get(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    if (!domain.dcdn_enabled) {
      throw new Error('DCDN not enabled for this domain');
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.request('SetDcdnDomainSSLCertificate', {
          DomainName: domain.domain,
          SSLProtocol: 'on',
          SSLPub: certificate,
          SSLPri: privateKey,
          CertType: 'upload',
          CertName: `cert-${domain.domain}-${Date.now()}`
        });

        logDCDNSync(domainId, domain.domain, 'success', {
          dcdnDomain: domain.domain
        });

        sseController.broadcastDomainUpdate(domainId, domain.domain, {
          action: 'dcdn_synced',
          dcdnDomain: domain.domain
        });

        return {
          success: true,
          message: 'Certificate synced to DCDN successfully'
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < MAX_RETRIES) {
          await this.delay(RETRY_DELAY_MS * attempt);
        }
      }
    }

    logDCDNSync(domainId, domain.domain, 'failure', {
      error: lastError?.message
    });

    return {
      success: false,
      message: `Sync failed after ${MAX_RETRIES} attempts: ${lastError?.message}`
    };
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
   * Execute sync task (called by task queue)
   */
  async executeSyncTask(
    task: TaskStatus,
    certificate: string,
    privateKey: string
  ): Promise<void> {
    taskQueue.updateProgress(task.id, 10, 'Connecting to Aliyun DCDN...');

    try {
      taskQueue.updateProgress(task.id, 30, 'Uploading certificate...');
      const result = await this.syncCertificate(task.domainId, certificate, privateKey);

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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const dcdnSyncer = new DCDNSyncer();
