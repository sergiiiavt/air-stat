-- Two incident_updates rows could both carry is_current = 1, because the
-- ingest demote-then-insert pair is not atomic in D1. Every read joins on
-- is_current = 1, so such an incident fans out into two identical API rows:
-- its area counted it twice, its map dot showed an inflated number, and the
-- repeated id made React reuse stale cards from the unfiltered list.
UPDATE incident_updates
SET is_current = 0
WHERE is_current = 1
  AND id <> (
    SELECT MAX(iu.id)
    FROM incident_updates iu
    WHERE iu.incident_id = incident_updates.incident_id
      AND iu.is_current = 1
  );

-- Makes the fan-out impossible rather than merely repaired.
CREATE UNIQUE INDEX IF NOT EXISTS idx_incident_updates_current
  ON incident_updates(incident_id)
  WHERE is_current = 1;

-- One raion reached the archive under several English spellings. They render
-- under the same Ukrainian label, so they appeared as two identically named
-- map dots, each holding part of the area's incidents. shared/area-identity.mjs
-- holds the same table for ingest and for the dashboard.
UPDATE incidents
SET admin_area = CASE admin_area
      WHEN 'Bila Tserkva raion' THEN 'Bilotserkivskyi raion'
      WHEN 'Boryspil raion' THEN 'Boryspilskyi raion'
      WHEN 'Brovary raion' THEN 'Brovarskyi raion'
      WHEN 'Brovaryskyi raion' THEN 'Brovarskyi raion'
      WHEN 'Bucha raion' THEN 'Buchanskyi raion'
      WHEN 'Fastiv raion' THEN 'Fastivskyi raion'
      WHEN 'Obukhiv raion' THEN 'Obukhivskyi raion'
      WHEN 'Vyshhorod raion' THEN 'Vyshhorodskyi raion'
      WHEN 'Darntyskyi district' THEN 'Darnytskyi district'
      WHEN 'Kyiv City' THEN 'Kyiv'
      WHEN 'Boyarka' THEN 'Boiarka'
      ELSE admin_area
    END,
    location_name = CASE location_name
      WHEN 'Bila Tserkva raion' THEN 'Bilotserkivskyi raion'
      WHEN 'Boryspil raion' THEN 'Boryspilskyi raion'
      WHEN 'Brovary raion' THEN 'Brovarskyi raion'
      WHEN 'Brovaryskyi raion' THEN 'Brovarskyi raion'
      WHEN 'Bucha raion' THEN 'Buchanskyi raion'
      WHEN 'Fastiv raion' THEN 'Fastivskyi raion'
      WHEN 'Obukhiv raion' THEN 'Obukhivskyi raion'
      WHEN 'Vyshhorod raion' THEN 'Vyshhorodskyi raion'
      WHEN 'Darntyskyi district' THEN 'Darnytskyi district'
      WHEN 'Kyiv City' THEN 'Kyiv'
      WHEN 'Boyarka' THEN 'Boiarka'
      ELSE location_name
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE admin_area IN (
        'Bila Tserkva raion', 'Boryspil raion', 'Brovary raion', 'Brovaryskyi raion',
        'Bucha raion', 'Fastiv raion', 'Obukhiv raion', 'Vyshhorod raion',
        'Darntyskyi district', 'Kyiv City', 'Boyarka'
      )
   OR location_name IN (
        'Bila Tserkva raion', 'Boryspil raion', 'Brovary raion', 'Brovaryskyi raion',
        'Bucha raion', 'Fastiv raion', 'Obukhiv raion', 'Vyshhorod raion',
        'Darntyskyi district', 'Kyiv City', 'Boyarka'
      );
