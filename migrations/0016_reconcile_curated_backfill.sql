-- Dates already present in the curated GitHub research archive have already
-- been validated and imported into D1. They are authoritative seed coverage
-- and must not be re-researched by the native historical queue.
UPDATE automated_research_days
SET status = 'done',
    attempts = 0,
    completed_at = COALESCE(
      completed_at,
      (
        SELECT MAX(rf.imported_at)
        FROM research_files rf
        WHERE rf.document_date = automated_research_days.event_date
      ),
      CURRENT_TIMESTAMP
    ),
    lease_expires_at = NULL,
    last_error = NULL,
    outcome = 'updated',
    findings_count =
      (SELECT COUNT(*) FROM attacks a WHERE a.attack_date = automated_research_days.event_date) +
      (SELECT COUNT(*) FROM incidents i WHERE i.incident_date = automated_research_days.event_date),
    updated_at = CURRENT_TIMESTAMP
WHERE status IN ('pending', 'retry', 'needs_review')
  AND EXISTS (
    SELECT 1
    FROM research_files rf
    WHERE rf.document_date = automated_research_days.event_date
  );
