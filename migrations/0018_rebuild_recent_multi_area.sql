-- Rebuild the recent automated window after strengthening multi-district extraction.
-- Manual/curated incidents are preserved.
DELETE FROM incidents
WHERE external_id LIKE 'auto-incident-%'
  AND incident_date BETWEEN '2026-09-24' AND '2026-09-30';

UPDATE automated_research_runs
SET status = 'error',
    finished_at = CURRENT_TIMESTAMP,
    error_message = 'Superseded by multi-area extraction rebuild'
WHERE kind = 'daily'
  AND status = 'running';
