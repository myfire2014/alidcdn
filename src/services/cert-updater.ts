import { domainService } from './domain-service';
import { cloudflareClient } from './cloudflare-client';
import { taskQueue } from './task-queue';
import { sseController } from '../controllers/sse-controller';
import { logCertUpdate } from './audit-logger';
import type { TaskStatus } from '../types';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export interface UpdateResult {
  success: boolean;
  message: string;
  certificateId?: string;
  expiresOn?: string;
}

export class CertUpdater {
  /**
   * Update certificate for a domain via Cloudflare
   */
  async updateCertificate(domainId: number): Promise<UpdateResult> {
    const domain = domainService.get(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    if (!domain.cloudflare_zone_id) {
      throw new Error('Cloudflare zone ID not configured for this domain');
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.performUpdate(domain.cloudflare_zone_id, domain.domain);
        
        logCertUpdate(domainId, domain.domain, 'success', {
          certificateId: result.certificateId,
          expiresOn: result.expiresOn
        });

        sseController.broadcastDomainUpdate(domainId, domain.domain, {
          action: 'cert_updated',
          certificateId: result.certificateId
        });

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
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
   * Perform the actual certificate update
   */
  private async performUpdate(zoneId: string, domain: string): Promise<UpdateResult> {
    // Get current certificates
    const certs = await cloudflareClient.getZoneCertificates(zoneId);
    
    // Find certificate for this domain
    const existingCert = certs.find(c => 
      c.hosts.some(h => h === domain || h === `*.${domain}` || domain.endsWith(h.replace('*.', '.')))
    );

    if (existingCert && existingCert.status === 'active') {
      // Check if renewal is needed
      const expiresOn = new Date(existingCert.expires_on);
      const daysUntilExpiry = Math.floor((expiresOn.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiry > 30) {
        return {
          success: true,
          message: `Certificate is still valid for ${daysUntilExpiry} days`,
          certificateId: existingCert.id,
          expiresOn: existingCert.expires_on
        };
      }

      // Restart validation to trigger renewal
      const renewed = await cloudflareClient.restartValidation(zoneId, existingCert.id);
      return {
        success: true,
        message: 'Certificate renewal initiated',
        certificateId: renewed.id,
        expiresOn: renewed.expires_on
      };
    }

    // Order new certificate
    const newCert = await cloudflareClient.orderAdvancedCertificate(zoneId, [domain, `*.${domain}`]);
    
    return {
      success: true,
      message: 'New certificate ordered',
      certificateId: newCert.id,
      expiresOn: newCert.expires_on
    };
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
    taskQueue.updateProgress(task.id, 10, 'Connecting to Cloudflare...');

    try {
      taskQueue.updateProgress(task.id, 30, 'Checking certificate status...');
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

  /**
   * Get Cloudflare certificate status for a zone
   */
  async getCloudflareStatus(zoneId: string): Promise<{
    status: string;
    certificates: Array<{
      id: string;
      hosts: string[];
      expiration: string;
      status: string;
    }>;
  }> {
    const certs = await cloudflareClient.getZoneCertificates(zoneId);
    
    return {
      status: certs.length > 0 ? 'active' : 'none',
      certificates: certs.map(c => ({
        id: c.id,
        hosts: c.hosts,
        expiration: c.expires_on,
        status: c.status
      }))
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const certUpdater = new CertUpdater();
