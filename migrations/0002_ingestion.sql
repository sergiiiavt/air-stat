CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_scope_external_id
  ON alert_events(scope, external_id);

CREATE TABLE IF NOT EXISTS ingestion_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','success','error','skipped')),
  fetched_count INTEGER NOT NULL DEFAULT 0,
  stored_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_source_started
  ON sync_runs(source_key, started_at DESC);

INSERT OR IGNORE INTO sources (
  key, name, base_url, source_type, authority_rank, enabled
) VALUES (
  'alerts_in_ua',
  'alerts.in.ua',
  'https://alerts.in.ua/',
  'api',
  1,
  1
);
