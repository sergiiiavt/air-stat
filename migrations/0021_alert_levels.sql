-- Legacy and untyped/mixed history stays unknown; never infer a level from UAV alone.
ALTER TABLE alert_events ADD COLUMN alert_level TEXT NOT NULL DEFAULT 'unknown'
  CHECK (alert_level IN ('yellow', 'red', 'unknown'));

-- The history API has episode causes, but no intraday cause-change timestamps.
-- Preserve current-state observations separately instead of backdating a change.
CREATE TABLE kyiv_alert_level_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_started_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  alert_level TEXT NOT NULL CHECK (alert_level IN ('yellow', 'red', 'unknown')),
  causes_json TEXT NOT NULL,
  UNIQUE (episode_started_at, observed_at)
);
CREATE INDEX idx_kyiv_level_episode ON kyiv_alert_level_observations(episode_started_at, observed_at);
CREATE INDEX idx_kyiv_level_observed ON kyiv_alert_level_observations(last_observed_at);
