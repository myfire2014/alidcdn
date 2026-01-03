-- 域名表（简化版，包含证书状态）
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  notes TEXT,
  auto_renew INTEGER DEFAULT 1,
  dcdn_enabled INTEGER DEFAULT 0,
  cert_status TEXT CHECK(cert_status IN ('valid', 'expiring_soon', 'expired', 'unknown', 'error')),
  cert_expiry TEXT,
  cert_issuer TEXT,
  last_checked TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 凭证表
CREATE TABLE IF NOT EXISTS credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  key_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(provider, key_name)
);

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  details TEXT,
  status TEXT CHECK(status IN ('success', 'failure')) NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 调度配置表
CREATE TABLE IF NOT EXISTS scheduler_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL UNIQUE,
  cron_expression TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  last_run TEXT,
  next_run TEXT
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
CREATE INDEX IF NOT EXISTS idx_domains_cert_status ON domains(cert_status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);

-- 插入默认调度配置
INSERT OR IGNORE INTO scheduler_config (task_type, cron_expression, enabled)
VALUES ('cert_check', '0 0 * * *', 1);
