-- Repair research-backed incidents imported by older worker versions where
-- admin_area and location_name could diverge. The current research importer
-- intentionally stores incident.area.name in both columns.
UPDATE incidents
SET
  admin_area = location_name,
  updated_at = CURRENT_TIMESTAMP
WHERE external_id IS NOT NULL
  AND location_name IS NOT NULL
  AND TRIM(location_name) <> ''
  AND admin_area <> location_name;
