-- Repair and infer research incident -> attack links.
-- A link is safe to infer only when exactly one attack exists for the same date/scope.

UPDATE incidents
SET attack_external_id = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE external_id IS NOT NULL
  AND attack_external_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM attacks a
    WHERE a.external_id = incidents.attack_external_id
      AND a.attack_date = incidents.incident_date
      AND a.scope = incidents.scope
  );

UPDATE incidents
SET attack_external_id = (
      SELECT MIN(a.external_id)
      FROM attacks a
      WHERE a.attack_date = incidents.incident_date
        AND a.scope = incidents.scope
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE external_id IS NOT NULL
  AND attack_external_id IS NULL
  AND (
    SELECT COUNT(*)
    FROM attacks a
    WHERE a.attack_date = incidents.incident_date
      AND a.scope = incidents.scope
  ) = 1;
