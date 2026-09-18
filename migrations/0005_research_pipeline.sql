ALTER TABLE incidents ADD COLUMN external_id TEXT;
ALTER TABLE incidents ADD COLUMN attack_external_id TEXT;
ALTER TABLE incidents ADD COLUMN confidence TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE incidents ADD COLUMN location_name TEXT;
ALTER TABLE incidents ADD COLUMN damage_json TEXT NOT NULL DEFAULT '[]';

CREATE UNIQUE INDEX IF NOT EXISTS ux_incidents_external_id
  ON incidents(external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS attacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT NOT NULL UNIQUE,
  attack_date TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('kyiv-city','kyiv-oblast')),
  started_at TEXT,
  ended_at TEXT,
  threat_types_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL,
  verification TEXT NOT NULL CHECK (verification IN ('provisional','confirmed','final')),
  confidence TEXT NOT NULL CHECK (confidence IN ('low','medium','high')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_attacks_date_scope
  ON attacks(attack_date, scope);

CREATE TABLE IF NOT EXISTS attack_sources (
  attack_id INTEGER NOT NULL REFERENCES attacks(id) ON DELETE CASCADE,
  source_item_id INTEGER NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
  PRIMARY KEY (attack_id, source_item_id)
);

CREATE TABLE IF NOT EXISTS research_files (
  path TEXT PRIMARY KEY,
  manifest_revision TEXT NOT NULL,
  content_sha TEXT NOT NULL,
  document_date TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
