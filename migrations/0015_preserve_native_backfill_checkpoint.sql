-- Preserve the one date accepted by the legacy campaign before native D1 state became authoritative.
UPDATE automated_research_days
SET status = 'done',
    attempts = 0,
    completed_at = '2026-09-26 12:48:16',
    lease_expires_at = NULL,
    last_error = NULL,
    outcome = 'updated',
    findings_count = 2,
    updated_at = CURRENT_TIMESTAMP
WHERE event_date = '2026-03-24';
