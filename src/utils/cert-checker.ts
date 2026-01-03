import * as tls from 'tls';
import type { CertInfo } from '../types';

const DEFAULT_PORT = 443;
const DEFAULT_TIMEOUT = 10000; // 10 seconds

export interface CertCheckOptions {
  port?: number;
  timeout?: number;
}

/**
 * Get SSL certificate information for a hostname
 */
export function getCertInfo(hostname: string, options: CertCheckOptions = {}): Promise<CertInfo> {
  const port = options.port ?? DEFAULT_PORT;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: false, // Allow self-signed certs for checking
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          
          if (!cert || Object.keys(cert).length === 0) {
            socket.destroy();
            reject(new Error('No certificate found'));
            return;
          }

          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const now = new Date();
          const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          const issuer = cert.issuer?.O || cert.issuer?.CN || 'Unknown';

          socket.destroy();
          resolve({
            issuer,
            validFrom,
            validTo,
            daysRemaining
          });
        } catch (error) {
          socket.destroy();
          reject(error);
        }
      }
    );

    socket.setTimeout(timeout, () => {
      socket.destroy();
      reject(new Error(`Connection timeout after ${timeout}ms`));
    });

    socket.on('error', (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

/**
 * Check if a certificate is valid (not expired and not yet valid)
 */
export function isCertValid(certInfo: CertInfo): boolean {
  const now = new Date();
  return certInfo.validFrom <= now && certInfo.validTo >= now;
}

/**
 * Check if a certificate is expiring soon
 */
export function isCertExpiring(certInfo: CertInfo, thresholdDays: number): boolean {
  return certInfo.daysRemaining > 0 && certInfo.daysRemaining <= thresholdDays;
}

/**
 * Check if a certificate is expired
 */
export function isCertExpired(certInfo: CertInfo): boolean {
  return certInfo.daysRemaining <= 0;
}

/**
 * Format certificate info for display
 */
export function formatCertInfo(certInfo: CertInfo): string {
  return `Issuer: ${certInfo.issuer}, Valid: ${certInfo.validFrom.toISOString()} - ${certInfo.validTo.toISOString()}, Days remaining: ${certInfo.daysRemaining}`;
}
