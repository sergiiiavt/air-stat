DROP VIEW IF EXISTS daily_stats;

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
      SUM(
        MAX(
          0,
          (julianday(COALESCE(ended_at, CURRENT_TIMESTAMP)) - julianday(started_at)) * 86400
        )
      ) AS INTEGER
    ) AS alert_seconds
  FROM alert_events
  WHERE alert_type = 'air_raid'
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
