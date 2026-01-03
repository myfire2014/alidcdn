import { getDatabase } from '../db';
import { validateDomain, normalizeDomain } from '../utils/validators';
import type { Domain, CreateDomainInput, UpdateDomainInput } from '../types';

export interface CertStatusUpdate {
  status: 'valid' | 'expiring_soon' | 'expired' | 'unknown' | 'error';
  expiry?: string;
  issuer?: string;
}

export class DomainService {
  /**
   * Create a new domain
   */
  create(data: CreateDomainInput): Domain {
    const validation = validateDomain(data.domain);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid domain');
    }

    const normalizedDomain = normalizeDomain(data.domain);
    const db = getDatabase();
    const now = new Date().toISOString();

    try {
      const result = db.run(`
        INSERT INTO domains (domain, notes, auto_renew, dcdn_enabled, cert_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'unknown', ?, ?)
      `, [
        normalizedDomain,
        data.notes || null,
        data.auto_renew !== false ? 1 : 0,
        data.dcdn_enabled ? 1 : 0,
        now,
        now
      ]);

      return this.get(Number(result.lastInsertRowid))!;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        throw new Error('Domain already exists');
      }
      throw error;
    }
  }

  /**
   * Get all domains
   */
  list(): Domain[] {
    const db = getDatabase();
    const rows = db.query<Domain, []>(`
      SELECT * FROM domains ORDER BY created_at DESC
    `).all();

    return rows.map(row => this.mapRow(row));
  }

  /**
   * Get a single domain
   */
  get(id: number): Domain | null {
    const db = getDatabase();
    const row = db.query<Domain, [number]>(`
      SELECT * FROM domains WHERE id = ?
    `).get(id);

    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * Get domain by domain name
   */
  getByDomain(domain: string): Domain | null {
    const db = getDatabase();
    const normalizedDomain = normalizeDomain(domain);
    const row = db.query<Domain, [string]>(`
      SELECT * FROM domains WHERE domain = ?
    `).get(normalizedDomain);

    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * Update a domain
   */
  update(id: number, data: UpdateDomainInput): Domain {
    const db = getDatabase();
    const existing = this.get(id);
    if (!existing) {
      throw new Error('Domain not found');
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.notes !== undefined) {
      updates.push('notes = ?');
      values.push(data.notes || null);
    }
    if (data.auto_renew !== undefined) {
      updates.push('auto_renew = ?');
      values.push(data.auto_renew ? 1 : 0);
    }
    if (data.dcdn_enabled !== undefined) {
      updates.push('dcdn_enabled = ?');
      values.push(data.dcdn_enabled ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(now);
      values.push(id);

      db.run(`UPDATE domains SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    return this.get(id)!;
  }

  /**
   * Delete a domain
   */
  delete(id: number): void {
    const db = getDatabase();
    const existing = this.get(id);
    if (!existing) {
      throw new Error('Domain not found');
    }
    db.run('DELETE FROM domains WHERE id = ?', [id]);
  }

  /**
   * Update certificate status for a domain
   */
  updateCertStatus(domainId: number, status: CertStatusUpdate): void {
    const db = getDatabase();
    const existing = this.get(domainId);
    if (!existing) {
      throw new Error('Domain not found');
    }

    const now = new Date().toISOString();

    db.run(`
      UPDATE domains SET
        cert_status = ?,
        cert_expiry = ?,
        cert_issuer = ?,
        last_checked = ?,
        updated_at = ?
      WHERE id = ?
    `, [
      status.status,
      status.expiry || null,
      status.issuer || null,
      now,
      now,
      domainId
    ]);
  }

  /**
   * Get count of domains by status
   */
  getStatusCounts(): { total: number; valid: number; expiring_soon: number; expired: number; error: number } {
    const db = getDatabase();
    const total = db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM domains').get()?.count ?? 0;
    
    const statusCounts = db.query<{ cert_status: string | null; count: number }, []>(`
      SELECT cert_status, COUNT(*) as count FROM domains GROUP BY cert_status
    `).all();

    const counts = { total, valid: 0, expiring_soon: 0, expired: 0, error: 0 };
    for (const row of statusCounts) {
      if (row.cert_status === 'valid') counts.valid = row.count;
      else if (row.cert_status === 'expiring_soon') counts.expiring_soon = row.count;
      else if (row.cert_status === 'expired') counts.expired = row.count;
      else counts.error += row.count;
    }

    return counts;
  }

  private mapRow(row: Domain): Domain {
    return {
      ...row,
      auto_renew: Boolean(row.auto_renew),
      dcdn_enabled: Boolean(row.dcdn_enabled)
    };
  }
}

// Singleton instance
export const domainService = new DomainService();
