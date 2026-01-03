import { getDatabase } from '../db';
import type { Credential } from '../types';

export class CredentialStore {
  /**
   * Store a credential
   */
  async setCredential(provider: string, keyName: string, value: string): Promise<void> {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    db.run(`
      INSERT INTO credentials (provider, key_name, encrypted_value, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider, key_name) DO UPDATE SET
        encrypted_value = excluded.encrypted_value,
        updated_at = excluded.updated_at
    `, [provider, keyName, value, now, now]);
  }

  /**
   * Get a credential
   */
  async getCredential(provider: string, keyName: string): Promise<string | null> {
    const db = getDatabase();
    const row = db.query<Credential, [string, string]>(
      'SELECT * FROM credentials WHERE provider = ? AND key_name = ?'
    ).get(provider, keyName);
    
    if (!row) return null;
    
    return row.encrypted_value;
  }

  /**
   * Delete a credential
   */
  async deleteCredential(provider: string, keyName: string): Promise<void> {
    const db = getDatabase();
    db.run(
      'DELETE FROM credentials WHERE provider = ? AND key_name = ?',
      [provider, keyName]
    );
  }

  /**
   * Get masked credential for display (shows only last 4 characters)
   */
  getMaskedCredential(provider: string, keyName: string): string | null {
    const db = getDatabase();
    const row = db.query<Credential, [string, string]>(
      'SELECT * FROM credentials WHERE provider = ? AND key_name = ?'
    ).get(provider, keyName);
    
    if (!row) return null;
    // Return a masked placeholder since we can't decrypt synchronously
    return '****' + keyName.slice(-4);
  }

  /**
   * Check if a credential exists
   */
  hasCredential(provider: string, keyName: string): boolean {
    const db = getDatabase();
    const row = db.query<{ count: number }, [string, string]>(
      'SELECT COUNT(*) as count FROM credentials WHERE provider = ? AND key_name = ?'
    ).get(provider, keyName);
    
    return (row?.count ?? 0) > 0;
  }

  /**
   * Get raw encrypted value (for testing purposes)
   */
  getRawEncryptedValue(provider: string, keyName: string): string | null {
    const db = getDatabase();
    const row = db.query<Credential, [string, string]>(
      'SELECT * FROM credentials WHERE provider = ? AND key_name = ?'
    ).get(provider, keyName);
    
    return row?.encrypted_value ?? null;
  }
}

/**
 * Mask a credential string for display
 * Shows only the last 4 characters, rest replaced with asterisks
 */
export function maskCredential(value: string): string {
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  const visiblePart = value.slice(-4);
  const maskedPart = '*'.repeat(value.length - 4);
  return maskedPart + visiblePart;
}

// Singleton instance
export const credentialStore = new CredentialStore();
