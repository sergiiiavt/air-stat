PRAGMA foreign_keys = ON;

CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('api','official_site','telegram','media')),
  authority_rank INTEGER NOT NULL DEFAULT 3,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE source_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  external_id TEXT,
  url TEXT NOT NULL,
  published_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  title TEXT,
  raw_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  UNIQUE(source_id, content_hash)
);

CREATE TABLE alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('kyiv-city','kyiv-oblast')),
  location_uid TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  local_date TEXT NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'air_raid',
  threat_types_json TEXT NOT NULL DEFAULT '[]',
  source_item_id INTEGER REFERENCES source_items(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_alert_scope_date_started
  ON alert_events(scope, local_date, started_at);

CREATE TABLE incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_date TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('kyiv-city','kyiv-oblast')),
  admin_area TEXT NOT NULL,
  occurred_at TEXT,
  impact_kind TEXT NOT NULL CHECK (
    impact_kind IN ('impact','debris','air-defense','no-confirmed-impact','unknown')
  ),
  threat_types_json TEXT NOT NULL DEFAULT '[]',
  verification TEXT NOT NULL DEFAULT 'provisional' CHECK (
    verification IN ('provisional','confirmed','final')
  ),
  published_lat REAL,
  published_lng REAL,
  geo_precision TEXT NOT NULL DEFAULT 'district-centroid',
  current_summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_incident_date_scope
  ON incidents(incident_date, scope);

CREATE TABLE incident_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  source_item_id INTEGER NOT NULL REFERENCES source_items(id),
  observed_at TEXT NOT NULL,
  killed INTEGER,
  injured INTEGER,
  damaged_objects_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_incident_updates_incident
  ON incident_updates(incident_id, observed_at);

CREATE TABLE incident_sources (
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  source_item_id INTEGER NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
  PRIMARY KEY (incident_id, source_item_id)
);

CREATE VIEW daily_stats AS
SELECT
  d.date,
  d.scope,
  COALESCE(a.alert_count, 0) AS alert_count,
  COALESCE(a.alert_seconds, 0) AS alert_seconds,
  COALESCE(i.incident_count, 0) AS incident_count,
  COALESCE(i.killed, 0) AS killed,
  COALESCE(i.injured, 0) AS injured
FROM (
  SELECT local_date AS date, scope FROM alert_events
  UNION
  SELECT incident_date AS date, scope FROM incidents
) d
LEFT JOIN (
  SELECT
    local_date AS date,
    scope,
    COUNT(*) AS alert_count,
    CAST(
      SUM((julianday(COALESCE(ended_at, started_at)) - julianday(started_at)) * 86400)
      AS INTEGER
    ) AS alert_seconds
  FROM alert_events
  GROUP BY 1, 2
) a ON a.date = d.date AND a.scope = d.scope
LEFT JOIN (
  SELECT
    x.incident_date AS date,
    x.scope,
    COUNT(DISTINCT x.id) AS incident_count,
    COALESCE(SUM(CASE WHEN u.is_current = 1 THEN u.killed ELSE 0 END), 0) AS killed,
    COALESCE(SUM(CASE WHEN u.is_current = 1 THEN u.injured ELSE 0 END), 0) AS injured
  FROM incidents x
  LEFT JOIN incident_updates u ON u.incident_id = x.id
  GROUP BY 1, 2
) i ON i.date = d.date AND i.scope = d.scope;
