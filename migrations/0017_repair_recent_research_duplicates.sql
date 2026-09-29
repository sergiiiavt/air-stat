-- Repair the recent window polluted by overlapping news-research scans.
-- Only automated incidents are removed; curated/manual records remain intact.
DELETE FROM incidents
WHERE external_id LIKE 'auto-incident-%'
  AND incident_date BETWEEN '2026-09-24' AND '2026-09-30';

-- Older code could start a new recent scan every minute while a revision change
-- was still being applied. Close any orphaned rows so the new single-flight
-- guard starts from a clean scheduler state.
UPDATE automated_research_runs
SET status = 'error',
    finished_at = CURRENT_TIMESTAMP,
    error_message = 'Superseded by idempotent recent-research repair'
WHERE kind = 'daily'
  AND status = 'running';
