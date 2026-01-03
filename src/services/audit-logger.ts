import { getDatabase } from '../db';
import type { AuditLog, LogEntry, LogFilter, PaginatedLogs } from '../types';

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_RETENTION_DAYS = 90;

export class AuditLogger {
  /**
   * Log an audit entry
   */
  log(entry: LogEntry): void {
    const db = getDatabase();
    const now = new Date().toISOString();

    db.run(`
      INSERT INTO audit_logs (action, target_type, target_id, details, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      entry.action,
      entry.targetType,
      entry.targetId ?? null,
      JSON.stringify(entry.details),
      entry.status,
      now
    ]);
  }

  /**
   * Query audit logs with filtering and pagination
   */
  query(filter: LogFilter = {}): PaginatedLogs {
    const db = getDatabase();
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.action) {
      conditions.push('action = ?');
      params.push(filter.action);
    }
    if (filter.targetType) {
      conditions.push('target_type = ?');
      params.push(filter.targetType);
    }
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter.startDate) {
      conditions.push('created_at >= ?');
      params.push(filter.startDate.toISOString());
    }
    if (filter.endDate) {
      conditions.push('created_at <= ?');
      params.push(filter.endDate.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`;
    const countResult = db.query<{ count: number }, (string | number)[]>(countQuery).get(...params);
    const total = countResult?.count ?? 0;

    // Get paginated results
    const dataQuery = `
      SELECT * FROM audit_logs 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, pageSize, offset];
    const logs = db.query<AuditLog, (string | number)[]>(dataQuery).all(...dataParams);

    return {
      logs,
      total,
      page,
      pageSize
    };
  }

  /**
   * Get recent logs (shortcut for common use case)
   */
  getRecent(limit: number = 10): AuditLog[] {
    const db = getDatabase();
    return db.query<AuditLog, [number]>(`
      SELECT * FROM audit_logs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Cleanup logs older than retention period
   */
  cleanup(retentionDays: number = DEFAULT_RETENTION_DAYS): number {
    const db = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = db.run(
      'DELETE FROM audit_logs WHERE created_at < ?',
      [cutoffDate.toISOString()]
    );

    return result.changes;
  }

  /**
   * Get log by ID
   */
  getById(id: number): AuditLog | null {
    const db = getDatabase();
    return db.query<AuditLog, [number]>(
      'SELECT * FROM audit_logs WHERE id = ?'
    ).get(id) ?? null;
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();

// Convenience functions for common log actions
export function logCertCheck(domainId: number, domain: string, status: 'success' | 'failure', details: Record<string, unknown> = {}): void {
  auditLogger.log({
    action: 'cert_check',
    targetType: 'domain',
    targetId: domainId,
    details: { domain, ...details },
    status
  });
}

export function logCertUpdate(domainId: number, domain: string, status: 'success' | 'failure', details: Record<string, unknown> = {}): void {
  auditLogger.log({
    action: 'cert_update',
    targetType: 'domain',
    targetId: domainId,
    details: { domain, ...details },
    status
  });
}

export function logDCDNSync(domainId: number, domain: string, status: 'success' | 'failure', details: Record<string, unknown> = {}): void {
  auditLogger.log({
    action: 'dcdn_sync',
    targetType: 'domain',
    targetId: domainId,
    details: { domain, ...details },
    status
  });
}

export function logCredentialChange(provider: string, status: 'success' | 'failure', details: Record<string, unknown> = {}): void {
  auditLogger.log({
    action: 'credential_change',
    targetType: 'credential',
    details: { provider, ...details },
    status
  });
}

export function logSystemError(error: Error, context: Record<string, unknown> = {}): void {
  auditLogger.log({
    action: 'system_error',
    targetType: 'system',
    details: {
      error: error.message,
      stack: error.stack,
      ...context
    },
    status: 'failure'
  });
}
