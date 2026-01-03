import { domainService } from './domain-service';
import { taskQueue } from './task-queue';
import { sseController } from '../controllers/sse-controller';
import { logCertCheck } from './audit-logger';
import { getCertInfo } from '../utils/cert-checker';
import { getCertStatusFromInfo, DEFAULT_EXPIRY_THRESHOLD } from '../utils/cert-status';
import type { CertCheckResult, Domain, TaskStatus } from '../types';

export class CertMonitor {
  private expiryThreshold: number = DEFAULT_EXPIRY_THRESHOLD;

  /**
   * Set expiry threshold
   */
  setExpiryThreshold(days: number): void {
    this.expiryThreshold = days;
  }

  /**
   * Get expiry threshold
   */
  getExpiryThreshold(): number {
    return this.expiryThreshold;
  }

  /**
   * Check certificate for a single domain by domain name
   */
  async checkDomain(domainName: string): Promise<CertCheckResult> {
    const domainData = domainService.getByDomain(domainName);
    if (!domainData) {
      throw new Error('Domain not found');
    }

    const result = await this.performCheck(domainData);
    
    // Map status to new format
    const statusMap: Record<string, 'valid' | 'expiring_soon' | 'expired' | 'unknown' | 'error'> = {
      'valid': 'valid',
      'expiring': 'expiring_soon',
      'expired': 'expired',
      'error': 'error'
    };

    // Update domain certificate status
    domainService.updateCertStatus(domainData.id, {
      status: statusMap[result.status] || 'error',
      expiry: result.validTo?.toISOString(),
      issuer: result.issuer
    });

    // Log the check
    logCertCheck(domainData.id, domainData.domain, result.status === 'error' ? 'failure' : 'success', {
      status: result.status,
      daysRemaining: result.daysRemaining,
      error: result.error
    });

    // Broadcast update
    sseController.broadcastDomainUpdate(domainData.id, domainData.domain, {
      certStatus: result.status,
      daysRemaining: result.daysRemaining
    });

    return result;
  }

  /**
   * Check certificate by domain ID
   */
  async checkDomainById(domainId: number): Promise<CertCheckResult> {
    const domainData = domainService.get(domainId);
    if (!domainData) {
      throw new Error('Domain not found');
    }
    return this.checkDomain(domainData.domain);
  }

  /**
   * Perform the actual certificate check
   */
  private async performCheck(domainData: Domain): Promise<CertCheckResult> {
    try {
      const certInfo = await getCertInfo(domainData.domain);
      const status = getCertStatusFromInfo(certInfo, this.expiryThreshold);

      return {
        domainId: domainData.id,
        domain: domainData.domain,
        status,
        issuer: certInfo.issuer,
        validFrom: certInfo.validFrom,
        validTo: certInfo.validTo,
        daysRemaining: certInfo.daysRemaining
      };
    } catch (error) {
      return {
        domainId: domainData.id,
        domain: domainData.domain,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check all domains
   */
  async checkAllDomains(): Promise<void> {
    const domains = domainService.list();
    
    for (const domain of domains) {
      taskQueue.enqueue(
        { type: 'check', domainId: domain.id },
        domain.domain
      );
    }
  }

  /**
   * Enqueue a single domain check
   */
  enqueueCheck(domainId: number): string {
    const domain = domainService.get(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    return taskQueue.enqueue(
      { type: 'check', domainId },
      domain.domain
    );
  }

  /**
   * Execute a check task (called by task queue)
   */
  async executeCheckTask(task: TaskStatus): Promise<void> {
    taskQueue.updateProgress(task.id, 10, 'Connecting to server...');
    
    try {
      const result = await this.checkDomainById(task.domainId);
      
      if (result.status === 'error') {
        taskQueue.completeTask(task.id, false, `Check failed: ${result.error}`, result.error);
      } else {
        taskQueue.completeTask(
          task.id, 
          true, 
          `Certificate ${result.status}, ${result.daysRemaining} days remaining`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      taskQueue.completeTask(task.id, false, `Check failed: ${message}`, message);
    }
  }

  /**
   * Get domains that need renewal
   */
  getDomainsNeedingRenewal(): Domain[] {
    const domains = domainService.list();
    return domains.filter(d => 
      d.cert_status === 'expiring_soon' || 
      d.cert_status === 'expired'
    );
  }
}

// Singleton instance
export const certMonitor = new CertMonitor();
