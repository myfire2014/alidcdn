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

export class CertUpdater {
  private useStaging = false; // Set to true for testing

  /**
   * Update certificate for a domain - 申请 Let's Encrypt 证书并上传到 DCDN
   */
  async updateCertificate(domainId: number): Promise<UpdateResult> {
    const domain = domainService.get(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.performUpdate(domain.domain, domain.dcdn_enabled);
        
        logCertUpdate(domainId, domain.domain, 'success', {
          expiresOn: result.expiresOn
        });

        sseController.broadcastDomainUpdate(domainId, domain.domain, {
          action: 'cert_updated'
        });

        // Re-check certificate status after update
        await certMonitor.checkDomain(domain.domain);

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.error(`Certificate update attempt ${attempt} failed:`, lastError.message);
        
        if (attempt < MAX_RETRIES) {
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
  private async performUpdate(domain: string, syncToDcdn: boolean): Promise<UpdateResult> {
    // Step 1: Create account key
    const accountKey = await acme.crypto.createPrivateRsaKey();
    
    // Step 2: Create ACME client
    const client = new acme.Client({
      directoryUrl: this.useStaging 
        ? acme.directory.letsencrypt.staging 
        : acme.directory.letsencrypt.production,
      accountKey
    });

    // Step 3: Create CSR
    const [certificateKey, certificateCsr] = await acme.crypto.createCsr({
      altNames: [domain]
    });

    // Step 4: Get Cloudflare zone ID for DNS challenge
    const zoneId = await this.getCloudflareZoneId(domain);
    if (!zoneId) {
      throw new Error(`Cloudflare zone not found for ${domain}. DNS must be managed by Cloudflare.`);
    }

    // Track created DNS records for cleanup
    const createdRecords: Array<{ zoneId: string; recordId: string }> = [];

    try {
      // Step 5: Use auto mode to get certificate
      const certificate = await client.auto({
        csr: certificateCsr,
        termsOfServiceAgreed: true,
        challengePriority: ['dns-01'],
        challengeCreateFn: async (authz, challenge, keyAuthorization) => {
          if (challenge.type !== 'dns-01') {
            throw new Error(`Unsupported challenge type: ${challenge.type}`);
          }

          const recordName = `_acme-challenge.${authz.identifier.value}`;
          console.log(`Creating DNS TXT record: ${recordName} = ${keyAuthorization}`);

          const record = await cloudflareClient.createDnsRecord(zoneId, {
            type: 'TXT',
            name: recordName,
            content: keyAuthorization,
            ttl: 60
          });

          createdRecords.push({ zoneId, recordId: record.id });

          // Wait for DNS propagation
          console.log('Waiting for DNS propagation...');
          await this.delay(10000);
        },
        challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
          // Cleanup will be done in finally block
          console.log(`Challenge completed for ${authz.identifier.value}`);
        }
      });

      // Step 6: Sync to DCDN if enabled
      if (syncToDcdn) {
        const domainData = domainService.getByDomain(domain);
        if (domainData) {
          console.log('Syncing certificate to DCDN...');
          await dcdnSyncer.syncCertificate(
            domainData.id, 
            certificate, 
            certificateKey.toString()
          );
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
      for (const record of createdRecords) {
        try {
          await cloudflareClient.deleteDnsRecord(record.zoneId, record.recordId);
          console.log(`Cleaned up DNS record: ${record.recordId}`);
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
