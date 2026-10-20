import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';

let db: Database | null = null;

const DB_PATH = process.env.DB_PATH || 'data/cert-manager.db';

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(dbPath: string = DB_PATH): Database {
  // Ensure data directory exists
  const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
  if (dir) {
    try {
      Bun.spawnSync(['mkdir', '-p', dir]);
    } catch {
      // Directory might already exist
    }
  }

  db = new Database(dbPath, { create: true });
  
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');
  
  // Read and execute schema
  const schemaPath = join(import.meta.dir, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  // Execute the entire schema as a single transaction
  db.exec(schema);

  // Migrate existing databases (CREATE TABLE IF NOT EXISTS won't add new columns)
  migrate(db);

  return db;
}

/**
 * Add a column to a table if it doesn't exist yet
 */
function ensureColumn(database: Database, table: string, column: string, ddl: string): void {
  const columns = database.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some(col => col.name === column)) {
    database.run(ddl);
  }
}

function migrate(database: Database): void {
  ensureColumn(
    database,
    'domains',
    'alt_domains',
    'ALTER TABLE domains ADD COLUMN alt_domains TEXT'
  );
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Helper function to check if all tables exist
export function checkTablesExist(): { 
  domains: boolean; 
  certificate_status: boolean; 
  credentials: boolean; 
  audit_logs: boolean; 
  scheduler_config: boolean;
} {
  const database = getDatabase();
  
  const tables = ['domains', 'certificate_status', 'credentials', 'audit_logs', 'scheduler_config'];
  const result: Record<string, boolean> = {};
  
  for (const table of tables) {
    const row = database.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table) as { name: string } | null;
    result[table] = row !== null;
  }
  
  return result as {
    domains: boolean;
    certificate_status: boolean;
    credentials: boolean;
    audit_logs: boolean;
    scheduler_config: boolean;
  };
}

// Helper function to check if all indexes exist
export function checkIndexesExist(): {
  idx_domains_domain: boolean;
  idx_cert_status_domain_id: boolean;
  idx_audit_logs_created_at: boolean;
  idx_audit_logs_action: boolean;
} {
  const database = getDatabase();
  
  const indexes = [
    'idx_domains_domain',
    'idx_cert_status_domain_id', 
    'idx_audit_logs_created_at',
    'idx_audit_logs_action'
  ];
  const result: Record<string, boolean> = {};
  
  for (const index of indexes) {
    const row = database.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND name=?"
    ).get(index) as { name: string } | null;
    result[index] = row !== null;
  }
  
  return result as {
    idx_domains_domain: boolean;
    idx_cert_status_domain_id: boolean;
    idx_audit_logs_created_at: boolean;
    idx_audit_logs_action: boolean;
  };
}
