DROP VIEW IF EXISTS daily_stats;

CREATE VIEW daily_stats AS
WITH
raw_alerts AS (
  SELECT
    local_date AS date,
    scope,
    started_at,
    COALESCE(ended_at, CURRENT_TIMESTAMP) AS ended_at,
    julianday(started_at) AS start_jd,
    julianday(COALESCE(ended_at, CURRENT_TIMESTAMP)) AS end_jd
  FROM alert_events
  WHERE alert_type = 'air_raid'
),
ordered_alerts AS (
  SELECT
    *,
    MAX(end_jd) OVER (
      PARTITION BY date, scope
      ORDER BY start_jd, end_jd
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS previous_max_end_jd
  FROM raw_alerts
),
marked_alerts AS (
  SELECT
    *,
    CASE
      WHEN previous_max_end_jd IS NULL OR start_jd > previous_max_end_jd THEN 1
      ELSE 0
    END AS starts_new_interval
  FROM ordered_alerts
),
grouped_alerts AS (
  SELECT
    *,
    SUM(starts_new_interval) OVER (
      PARTITION BY date, scope
      ORDER BY start_jd, end_jd
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS interval_group
  FROM marked_alerts
),
merged_alerts AS (
  SELECT
    date,
    scope,
    MIN(start_jd) AS start_jd,
    MAX(end_jd) AS end_jd
  FROM grouped_alerts
  GROUP BY date, scope, interval_group
),
alert_stats AS (
  SELECT
    date,
    scope,
    COUNT(*) AS alert_count,
    CAST(
      SUM(MAX(0, (end_jd - start_jd) * 86400))
      AS INTEGER
    ) AS alert_seconds
  FROM merged_alerts
  GROUP BY date, scope
),
incident_stats AS (
  SELECT
    x.incident_date AS date,
    x.scope,
    COUNT(DISTINCT x.id) AS incident_count,
    COALESCE(SUM(CASE WHEN u.is_current = 1 THEN u.killed ELSE 0 END), 0) AS killed,
    COALESCE(SUM(CASE WHEN u.is_current = 1 THEN u.injured ELSE 0 END), 0) AS injured
  FROM incidents x
  LEFT JOIN incident_updates u ON u.incident_id = x.id
  GROUP BY x.incident_date, x.scope
),
dates AS (
  SELECT local_date AS date, scope FROM alert_events
  UNION
  SELECT incident_date AS date, scope FROM incidents
)
SELECT
  d.date,
  d.scope,
  COALESCE(a.alert_count, 0) AS alert_count,
  COALESCE(a.alert_seconds, 0) AS alert_seconds,
  COALESCE(i.incident_count, 0) AS incident_count,
  COALESCE(i.killed, 0) AS killed,
  COALESCE(i.injured, 0) AS injured
FROM dates d
LEFT JOIN alert_stats a ON a.date = d.date AND a.scope = d.scope
LEFT JOIN incident_stats i ON i.date = d.date AND i.scope = d.scope;
