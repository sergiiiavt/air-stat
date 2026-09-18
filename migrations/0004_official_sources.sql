ALTER TABLE alert_events ADD COLUMN source_key TEXT NOT NULL DEFAULT 'alerts_in_ua';
ALTER TABLE alert_events ADD COLUMN source_url TEXT;
ALTER TABLE alert_events ADD COLUMN admin_area TEXT;

CREATE INDEX IF NOT EXISTS idx_alert_scope_date_area
  ON alert_events(scope, local_date, admin_area, started_at);

INSERT OR IGNORE INTO sources (
  key, name, base_url, source_type, authority_rank, enabled
) VALUES
  (
    'kyiv_open_data',
    'Kyiv Open Data / Kyiv Digital',
    'https://data.kyivcity.gov.ua/',
    'official_site',
    1,
    1
  ),
  (
    'kmda_telegram',
    'KMDA official Telegram',
    'https://t.me/KyivCityOfficial',
    'telegram',
    1,
    1
  ),
  (
    'kova_telegram',
    'Kyiv Oblast Military Administration official Telegram',
    'https://t.me/kyivoda',
    'telegram',
    1,
    1
  );
