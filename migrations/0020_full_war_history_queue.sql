-- Expand the event-date research queue to the beginning of the full-scale
-- invasion. 0014 already contains 2026-03-19..2026-09-19; preserve every
-- existing status/attempt/lease with INSERT OR IGNORE.
WITH RECURSIVE historical_dates(event_date) AS (
  SELECT '2022-02-24'
  UNION ALL
  SELECT date(event_date, '+1 day')
  FROM historical_dates
  WHERE event_date < '2026-03-18'
)
INSERT OR IGNORE INTO automated_research_days(event_date, status)
SELECT event_date, 'pending' FROM historical_dates;
