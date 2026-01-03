import type { CertInfo, CertificateStatus } from '../types';

// Default expiry threshold in days
export const DEFAULT_EXPIRY_THRESHOLD = 30;

export type CertStatusType = 'valid' | 'expiring' | 'expired' | 'error';

/**
 * Classify certificate status based on days remaining
 */
export function classifyCertStatus(daysRemaining: number, threshold: number = DEFAULT_EXPIRY_THRESHOLD): CertStatusType {
  if (daysRemaining <= 0) {
    return 'expired';
  }
  if (daysRemaining <= threshold) {
    return 'expiring';
  }
  return 'valid';
}

/**
 * Get status from CertInfo
 */
export function getCertStatusFromInfo(certInfo: CertInfo, threshold: number = DEFAULT_EXPIRY_THRESHOLD): CertStatusType {
  return classifyCertStatus(certInfo.daysRemaining, threshold);
}

/**
 * Check if certificate needs renewal
 */
export function needsRenewal(status: CertStatusType): boolean {
  return status === 'expiring' || status === 'expired';
}

/**
 * Get status color for UI
 */
export function getStatusColor(status: CertStatusType): string {
  switch (status) {
    case 'valid':
      return 'green';
    case 'expiring':
      return 'yellow';
    case 'expired':
      return 'red';
    case 'error':
      return 'gray';
    default:
      return 'gray';
  }
}

/**
 * Get status label for UI
 */
export function getStatusLabel(status: CertStatusType): string {
  switch (status) {
    case 'valid':
      return '有效';
    case 'expiring':
      return '即将过期';
    case 'expired':
      return '已过期';
    case 'error':
      return '检测失败';
    default:
      return '未知';
  }
}

/**
 * Get status badge CSS classes
 */
export function getStatusBadgeClass(status: CertStatusType): string {
  switch (status) {
    case 'valid':
      return 'bg-green-100 text-green-800';
    case 'expiring':
      return 'bg-yellow-100 text-yellow-800';
    case 'expired':
      return 'bg-red-100 text-red-800';
    case 'error':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
