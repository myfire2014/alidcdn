-- 域名表
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  description TEXT,
  cloudflare_zone_id TEXT,
  aliyun_dcdn_domain TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 证书状态表
CREATE TABLE IF NOT EXISTS certificate_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER NOT NULL UNIQUE,
  issuer TEXT,
  valid_from TEXT,
  valid_to TEXT,
  days_remaining INTEGER,
  last_checked TEXT DEFAULT (datetime('now')),
  status TEXT CHECK(status IN ('valid', 'expiring', 'expired', 'error')) DEFAULT 'error',
  error_message TEXT,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
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
CREATE INDEX IF NOT EXISTS idx_cert_status_domain_id ON certificate_status(domain_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- 插入默认调度配置
INSERT OR IGNORE INTO scheduler_config (task_type, cron_expression, enabled)
VALUES ('cert_check', '0 0 * * *', 1);
