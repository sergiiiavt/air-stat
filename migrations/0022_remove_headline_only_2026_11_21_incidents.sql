-- Remove automated Kyiv City incidents for 2026-11-21 that were created from
-- Google News RSS headlines only (no article body was ever read). Since
-- revision 2026-11-22-official-telegram-v3 the same consequences exist as
-- district-level records sourced from official posts:
--   Podilskyi district fire  - t.me/VA_Kyiv/22858, t.me/VA_Kyiv/22862, t.me/vitaliy_klitschko/8206
--   Solomianskyi district debris - t.me/vitaliy_klitschko/8206
-- and headline-only findings can no longer create incidents
-- (shared/finding-evidence.mjs), so these rows will not be recreated.
--
-- 01vvvpdma8ezo is a 19 Nov 2026 embassy report misdated to 21 Nov; 19 Nov
-- already holds the Netherlands/Austrian embassy incidents.
-- Removed one by one by stable external ID; curated/manual records and all
-- other automated rows are untouched. incident_updates and incident_sources
-- rows cascade.
DELETE FROM incidents
WHERE external_id IN (
  'auto-incident-20261121-kyiv-city-kyiv-01vvvpdma8ezo',
  'auto-incident-20261121-kyiv-city-kyiv-2qe84atxsdluu',
  'auto-incident-20261121-kyiv-city-kyiv-1e6n2gqtff4es',
  'auto-incident-20261121-kyiv-city-kyiv-23we3b0kacz88',
  'auto-incident-20261121-kyiv-city-kyiv-3p7wq294wc54a',
  'auto-incident-20261121-kyiv-city-kyiv-1tz0h08dif0s9'
)
  AND incident_date = '2026-11-21'
  AND scope = 'kyiv-city'
  AND admin_area = 'Kyiv';
