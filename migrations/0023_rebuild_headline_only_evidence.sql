-- Rebuild automated research that rests only on Google News RSS headlines.
--
-- Until revision 2026-11-22-official-telegram-v3 a Google News link was
-- "hydrated" by fetching a Google-hosted page, so the extractor saw headlines
-- only. Project rules treat headlines/snippets as insufficient evidence for a
-- physical incident or a casualty count (shared/finding-evidence.mjs now
-- enforces this). On 23 Nov 2026 production held 157 automated incidents on
-- 57 dates (2022-03-24 .. 2026-11-19) and 3 automated attack casualty counts
-- whose every source was a news.google.com link.
--
-- Historical research now also reads the dated Ukrainska Pravda archive with
-- full article bodies, so the affected dates are requeued and re-researched
-- from KODA, Pravda, GDELT-hydrated publisher pages and Kyiv City sources.
-- Curated/manual records are never touched; curated dates are re-marked done by
-- the existing reconciliation. Recent-window dates are rescanned by the recent
-- collector. incident_updates / incident_sources rows cascade.

-- 1. Requeue historical dates that held headline-only automated evidence, and
--    retry the date left in needs_review (no candidates before Pravda existed
--    in the historical path).
UPDATE automated_research_days
SET status = 'pending',
    attempts = 0,
    last_started_at = NULL,
    lease_expires_at = NULL,
    completed_at = NULL,
    last_error = NULL,
    outcome = NULL,
    findings_count = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE status <> 'running'
  AND (
    status = 'needs_review'
    OR event_date IN (
      SELECT DISTINCT i.incident_date
      FROM incidents i
      WHERE i.external_id LIKE 'auto-incident-%'
        AND EXISTS (SELECT 1 FROM incident_sources s WHERE s.incident_id = i.id)
        AND NOT EXISTS (
          SELECT 1
          FROM incident_sources s
          JOIN source_items si ON si.id = s.source_item_id
          WHERE s.incident_id = i.id
            AND si.url NOT LIKE 'https://news.google.com/%'
        )
    )
    OR event_date IN (
      SELECT DISTINCT a.attack_date
      FROM attacks a
      WHERE a.external_id LIKE 'auto-attack-%'
        AND a.casualty_status <> 'unknown'
        AND EXISTS (SELECT 1 FROM attack_sources s WHERE s.attack_id = a.id)
        AND NOT EXISTS (
          SELECT 1
          FROM attack_sources s
          JOIN source_items si ON si.id = s.source_item_id
          WHERE s.attack_id = a.id
            AND si.url NOT LIKE 'https://news.google.com/%'
        )
    )
  );

-- 2. Casualty counts taken from headlines only become unknown (not zero); the
--    re-research upgrades them when an article body supports a number.
UPDATE attacks
SET killed = 0,
    injured = 0,
    casualty_status = 'unknown',
    updated_at = CURRENT_TIMESTAMP
WHERE external_id LIKE 'auto-attack-%'
  AND casualty_status <> 'unknown'
  AND EXISTS (SELECT 1 FROM attack_sources s WHERE s.attack_id = attacks.id)
  AND NOT EXISTS (
    SELECT 1
    FROM attack_sources s
    JOIN source_items si ON si.id = s.source_item_id
    WHERE s.attack_id = attacks.id
      AND si.url NOT LIKE 'https://news.google.com/%'
  );

-- 3. Remove automated incidents whose every source is a Google News headline.
DELETE FROM incidents
WHERE external_id LIKE 'auto-incident-%'
  AND EXISTS (SELECT 1 FROM incident_sources s WHERE s.incident_id = incidents.id)
  AND NOT EXISTS (
    SELECT 1
    FROM incident_sources s
    JOIN source_items si ON si.id = s.source_item_id
    WHERE s.incident_id = incidents.id
      AND si.url NOT LIKE 'https://news.google.com/%'
  );
