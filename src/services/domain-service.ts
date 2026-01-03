import { getDatabase } from '../db';
import { validateDomain, normalizeDomain } from '../utils/validators';
import type { 
  Domain, 
  CertificateStatus, 
  CreateDomainInput, 
  UpdateDomainInput, 
  DomainWithStatus,
  CertStatusInput 
} from '../types';

export class DomainService {
  /**
   * Create a new domain
   */
  create(data: CreateDomainInput): DomainWithStatus {
    const validation = validateDomain(data.domain);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid domain');
    }

    const normalizedDomain = normalizeDomain(data.domain);
    const db = getDatabase();
    const now = new Date().toISOString();

    try {
      const result = db.run(`
        INSERT INTO domains (domain, description, cloudflare_zone_id, aliyun_dcdn_domain, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        normalizedDomain,
        data.description || null,
        data.cloudflare_zone_id || null,
        data.aliyun_dcdn_domain || null,
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
   * Get all domains with their certificate status
   */
  list(): DomainWithStatus[] {
    const db = getDatabase();
    const rows = db.query<Domain & { cert_id: number | null } & Partial<CertificateStatus>, []>(`
      SELECT 
        d.*,
        cs.id as cert_id,
        cs.issuer,
        cs.valid_from,
        cs.valid_to,
        cs.days_remaining,
        cs.last_checked,
        cs.status as cert_status,
        cs.error_message
      FROM domains d
      LEFT JOIN certificate_status cs ON d.id = cs.domain_id
      ORDER BY d.created_at DESC
    `).all();

    return rows.map(row => this.mapRowToDomainWithStatus(row));
  }

  /**
   * Get a single domain with its certificate status
   */
  get(id: number): DomainWithStatus | null {
    const db = getDatabase();
    const row = db.query<Domain & { cert_id: number | null } & Partial<CertificateStatus>, [number]>(`
      SELECT 
        d.*,
        cs.id as cert_id,
        cs.issuer,
        cs.valid_from,
        cs.valid_to,
        cs.days_remaining,
        cs.last_checked,
        cs.status as cert_status,
        cs.error_message
      FROM domains d
      LEFT JOIN certificate_status cs ON d.id = cs.domain_id
      WHERE d.id = ?
    `).get(id);

    if (!row) return null;
    return this.mapRowToDomainWithStatus(row);
  }

  /**
   * Get domain by domain name
   */
  getByDomain(domain: string): DomainWithStatus | null {
    const db = getDatabase();
    const normalizedDomain = normalizeDomain(domain);
    const row = db.query<Domain & { cert_id: number | null } & Partial<CertificateStatus>, [string]>(`
      SELECT 
        d.*,
        cs.id as cert_id,
        cs.issuer,
        cs.valid_from,
        cs.valid_to,
        cs.days_remaining,
        cs.last_checked,
        cs.status as cert_status,
        cs.error_message
      FROM domains d
      LEFT JOIN certificate_status cs ON d.id = cs.domain_id
      WHERE d.domain = ?
    `).get(normalizedDomain);

    if (!row) return null;
    return this.mapRowToDomainWithStatus(row);
  }

  /**
   * Update a domain
   */
  update(id: number, data: UpdateDomainInput): DomainWithStatus {
    const db = getDatabase();
    const existing = this.get(id);
    if (!existing) {
      throw new Error('Domain not found');
    }

    // Validate domain if being updated
    if (data.domain) {
      const validation = validateDomain(data.domain);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid domain');
      }
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (data.domain !== undefined) {
      updates.push('domain = ?');
      values.push(normalizeDomain(data.domain));
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description || null);
    }
    if (data.cloudflare_zone_id !== undefined) {
      updates.push('cloudflare_zone_id = ?');
      values.push(data.cloudflare_zone_id || null);
    }
    if (data.aliyun_dcdn_domain !== undefined) {
      updates.push('aliyun_dcdn_domain = ?');
      values.push(data.aliyun_dcdn_domain || null);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(now);
      values.push(String(id));

      try {
        db.run(`UPDATE domains SET ${updates.join(', ')} WHERE id = ?`, values);
      } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
          throw new Error('Domain already exists');
        }
        throw error;
      }
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
  updateCertStatus(domainId: number, status: CertStatusInput): void {
    const db = getDatabase();
    const existing = this.get(domainId);
    if (!existing) {
      throw new Error('Domain not found');
    }

    const now = new Date().toISOString();

    db.run(`
      INSERT INTO certificate_status (domain_id, issuer, valid_from, valid_to, days_remaining, last_checked, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(domain_id) DO UPDATE SET
        issuer = excluded.issuer,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        days_remaining = excluded.days_remaining,
        last_checked = excluded.last_checked,
        status = excluded.status,
        error_message = excluded.error_message
    `, [
      domainId,
      status.issuer || null,
      status.validFrom || null,
      status.validTo || null,
      status.daysRemaining ?? null,
      now,
      status.status,
      status.errorMessage || null
    ]);
  }

  /**
   * Get count of domains by status
   */
  getStatusCounts(): { total: number; valid: number; expiring: number; expired: number; error: number } {
    const db = getDatabase();
    const total = db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM domains').get()?.count ?? 0;
    
    const statusCounts = db.query<{ status: string; count: number }, []>(`
      SELECT cs.status, COUNT(*) as count
      FROM domains d
      LEFT JOIN certificate_status cs ON d.id = cs.domain_id
      GROUP BY cs.status
    `).all();

    const counts = { total, valid: 0, expiring: 0, expired: 0, error: 0 };
    for (const row of statusCounts) {
      if (row.status === 'valid') counts.valid = row.count;
      else if (row.status === 'expiring') counts.expiring = row.count;
      else if (row.status === 'expired') counts.expired = row.count;
      else if (row.status === 'error' || row.status === null) counts.error += row.count;
    }

    return counts;
  }

  private mapRowToDomainWithStatus(row: Domain & { cert_id: number | null } & Partial<CertificateStatus>): DomainWithStatus {
    const domain: Domain = {
      id: row.id,
      domain: row.domain,
      description: row.description,
      cloudflare_zone_id: row.cloudflare_zone_id,
      aliyun_dcdn_domain: row.aliyun_dcdn_domain,
      created_at: row.created_at,
      updated_at: row.updated_at
    };

    const cert_status: CertificateStatus | null = row.cert_id ? {
      id: row.cert_id,
      domain_id: row.id,
      issuer: row.issuer ?? null,
      valid_from: row.valid_from ?? null,
      valid_to: row.valid_to ?? null,
      days_remaining: row.days_remaining ?? null,
      last_checked: row.last_checked ?? new Date().toISOString(),
      status: (row as { cert_status?: string }).cert_status as 'valid' | 'expiring' | 'expired' | 'error' ?? 'error',
      error_message: row.error_message ?? null
    } : null;

    return { ...domain, cert_status };
  }
}

// Singleton instance
export const domainService = new DomainService();
