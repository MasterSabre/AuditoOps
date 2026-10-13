-- AuditOps: banco SQL persistente para calendário e histórico de auditorias.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scheduled_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_date TEXT NOT NULL UNIQUE,
  weekday INTEGER NOT NULL,
  window_start TEXT,
  window_end TEXT,
  audit_type TEXT NOT NULL CHECK (audit_type IN ('Etiqueta', 'Presença', 'Ruptura')),
  action_label TEXT NOT NULL DEFAULT 'Criar',
  status TEXT NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta', 'Fechada')),
  latest_run_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER REFERENCES scheduled_audits(id),
  data_auditoria TEXT NOT NULL,
  audit_type TEXT NOT NULL CHECK (audit_type IN ('Etiqueta', 'Presença', 'Ruptura')),
  status TEXT NOT NULL DEFAULT 'Fechada' CHECK (status IN ('Aberta', 'Fechada')),
  source_file TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  sku INTEGER NOT NULL DEFAULT 0,
  nao_lidos INTEGER NOT NULL DEFAULT 0,
  lidos_com_estoque INTEGER NOT NULL DEFAULT 0,
  lidos_sem_estoque INTEGER NOT NULL DEFAULT 0,
  lidos_nao_pertence INTEGER NOT NULL DEFAULT 0,
  etiquetas_desatualizadas INTEGER NOT NULL DEFAULT 0,
  colaboradores_ativos INTEGER NOT NULL DEFAULT 0,
  parcial REAL NOT NULL DEFAULT 0,
  details_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_detail_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  root_class TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  current_stock REAL,
  situation TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  audited_time TEXT NOT NULL DEFAULT '',
  sales_days REAL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_audits_date ON scheduled_audits(audit_date);
CREATE INDEX IF NOT EXISTS idx_audit_runs_date ON audit_runs(data_auditoria);
CREATE INDEX IF NOT EXISTS idx_audit_runs_type_status ON audit_runs(audit_type, status);
CREATE INDEX IF NOT EXISTS idx_audit_records_run ON audit_detail_records(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_records_code ON audit_detail_records(product_code);


-- Authentication and access control; created automatically by src/lib/server/auth-api.ts.
CREATE TABLE IF NOT EXISTS auth_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'custom' CHECK (role IN ('master', 'custom')),
  is_active INTEGER NOT NULL DEFAULT 1,
  force_password_change INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  failed_window_started_at TEXT,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_user_permissions (
  user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  can_view INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, section_key)
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS auth_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_login_rate_limits (ip_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_started_at TEXT NOT NULL, blocked_until TEXT);
CREATE TABLE IF NOT EXISTS auth_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, user_id INTEGER, username TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, details TEXT NOT NULL DEFAULT '');
