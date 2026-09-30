-- Enforce the recent-research single-flight invariant in D1 itself.
-- Application-side checks alone have a read-then-insert race when two cron
-- invocations overlap. Preserve the newest running row and close any older
-- duplicate runners before adding the partial unique index.
UPDATE automated_research_runs
SET status = 'error',
    finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
    error_message = COALESCE(
      error_message,
      'Superseded while enforcing single-flight recent research'
    )
WHERE kind = 'daily'
  AND status = 'running'
  AND id <> (
    SELECT MAX(id)
    FROM automated_research_runs
    WHERE kind = 'daily' AND status = 'running'
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_automated_research_runs_single_running_daily
  ON automated_research_runs(kind)
  WHERE kind = 'daily' AND status = 'running';
