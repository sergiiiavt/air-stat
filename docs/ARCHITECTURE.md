# Architecture

## MVP request flow

```text
React / MapLibre frontend
        |
        v
Cloudflare Worker API
        |
        +--> D1: normalized alerts, incidents, updates, sources
        |
        +--> R2 (optional): raw source snapshots / larger artifacts
```

## Ingestion flow

```text
ALERT TIMING                         INCIDENTS / CONSEQUENCES
structured alert sources            rolling recent publications / historical sources
        |                                      |
        v                                      v
Kyiv Digital / KOVA current /        discovery + article reading
alerts.in.ua when configured                  |
        |                                      v
        v                              resolve original event date
alert_events                                  |
        |                                      v
        |                              event-date research JSON
        |                                      |
        +------------------+-------------------+
                           v
                    D1 / derived APIs
```

News research is the primary incident/consequence pipeline. Alert feeds are a separate supporting stream for alert-duration/count analytics.

## Initial API shape

### GET /api/days?scope=kyiv-city&from=YYYY-MM-DD&to=YYYY-MM-DD

Returns compact day rows for the left panel:

- date
- alert count
- total alert seconds
- threat types
- incident count
- killed / injured
- affected areas
- short consequence summary

### GET /api/days/:date?scope=kyiv-city

Returns detailed alert windows, incidents, current consequence values, update timestamps, and source references.

### GET /api/range?from=YYYY-MM-DD&to=YYYY-MM-DD&scope=both

Returns period stats, daily rows, incidents, and affected-area aggregates. Each affected-area aggregate includes a stable `key` in the form `<scope>:<canonical-area>`; clients must use this key for selection and drill-down identity rather than localized labels.

### GET /api/map?date=YYYY-MM-DD&scope=kyiv-city

Returns only map-eligible generalized locations supported to district/raion precision or better. City/oblast-only records remain in statistics but are excluded from public map points. The range response also returns broad incidents with null public coordinates so future visualizations cannot accidentally treat a city/oblast centroid as an incident point. Do not return precise recent strike coordinates.

## UI hierarchy

The React shell separates controls by scope:

- the top header owns global visualization mode: Map, Daily timeline, 24-hour timeline, or Trends;
- the shared filter bar owns geography and date range;
- the first-visit default is Map, Kyiv City and the latest 7 days;
- the map surface uses a fixed semantic marker representation with no heatmap mode;
- for Kyiv City (and the Kyiv portion of the combined scope), a low-emphasis bundled same-origin GeoJSON layer outlines administrative districts to give aggregate marker numbers geographic context without implying incident extent or severity. Hovering a district emphasizes only that polygon and shows its localized name in a compact stationary map label; clicking a district polygon selects or clears the same canonical area filter used by its numbered aggregate marker. The geometry is derived from OpenStreetMap administrative boundaries and does not require a third-party GIS request at runtime;
- numbered markers aggregate all incidents belonging to the same canonical scope + administrative area/location across the full selected date range. Kyiv City district markers use a representative point calculated from the corresponding district polygon, while non-district/fallback markers retain the existing incident-derived anchor. The marker count therefore matches the incident drill-down exactly and does not imply a strike at the marker position;
- the range API exposes a stable scope-aware area `key`, and the affected-area list, map marker selection, summary card, camera focus, and incident filter all use that same identity rather than a translated/display label;
- district/raion/hromada/settlement records remain aggregate-only, so repeated administrative centroids cannot form artificial circles of circles;
- source-supported, non-sensitive `neighborhood-centroid`, `street-segment`, and `address-generalized` records may additionally render as selectable generalized individual markers. Historical non-sensitive `address-point` records may render as exact individual points under the map-location policy. Every individual marker remains included in its area's aggregate count;
- selecting a specific incident, whether from an individual map marker or the incident list, also selects that incident's stable scope-aware area key; the detail expands inline and the surrounding incident list contains only incidents from that same area;
- the left detail panel remains structurally stable during Map and Daily timeline drill-downs instead of being replaced by a separate incident screen;
- the 24-hour timeline and Trends use the full visualization width because they operate on the complete selected period;
- the header also owns the persistent light/dark theme toggle;
- theme choice is bootstrapped in `index.html` before the React bundle renders, then managed by React and persisted in `localStorage` when browser storage is available; storage reads/writes are guarded because some private or hardened mobile-browser contexts expose `localStorage` but throw on access;
- the MapLibre raster layer adjusts brightness/saturation with the UI theme so the map and surrounding controls remain visually consistent.

This avoids presenting non-map analytics as controls layered on top of the map.

Presentation follows `docs/DESIGN.md`. The shared palette is defined in `src/theme.css`; component styles consume semantic colors instead of maintaining separate light-theme overrides. The area list is an optional native disclosure, and the incident panel shows the current area/date with a reset action. Archive metadata is a separate disclosure. Trends measures its SVG width using `ResizeObserver` so axis text remains readable as the layout changes. The progress page scrolls as a normal document.

Map initialization is guarded: if WebGL cannot start, the page keeps its statistics and incident list and offers the daily visualization. The same fallback follows the live context, so a WebGL context lost after startup also shows it and a restored context returns to the map. This fallback does not synthesize map locations or alter incident selection.

Application startup has a separate guard that does not depend on the React bundle. The static HTML owns a delayed boot fallback, the root render is wrapped in an error boundary, and successful React commit removes the fallback. Browser preference persistence is non-critical: language, theme and view-mode storage failures fall back to defaults instead of escaping into the root error boundary. The API also normalizes legacy `damage_json` rows into the current structured `{ type, count, description }` damage shape before they reach React; new automated-research writes persist that structured shape directly. Production smoke verifies the root HTML plus every linked JavaScript and stylesheet asset and rejects malformed damage items, so an asset-routing, startup-shell or data-shape regression cannot pass deployment as an API-only success.

Loading and error states are drawn over the visualization instead of replacing it, so changing scope, period or locale does not unmount the map and discard its WebGL context and tile cache. With no area or incident selected, Kyiv City keeps a stable overview camera sized to the district geometry rather than re-fitting around the currently mapped incident points. Selecting a Kyiv district or exact incident focuses the camera as before; non-city scopes continue to fit their visible incident set.

## Daily timeline rendering

The React client derives the daily timeline from `GET /api/range`:

- daily rows are aggregated by date when `scope=both`;
- the full inclusive calendar range is generated client-side so days without alerts/incidents remain visible as zeroes;
- bar height represents total alert seconds;
- alert count is shown independently of duration;
- researched incidents provide separate impact/damage, injury and fatality indicators;
- all displayed months share the same duration scale.

No synthetic destruction score is stored or calculated.

## 24-hour timeline rendering

`GET /api/range` also returns the raw air-alert windows needed for intraday rendering. The query includes the day before the selected range so an alert that began before midnight can still be clipped into the first visible day.

The React client:

- converts timestamps to Europe/Kyiv wall-clock dates and minutes;
- splits cross-midnight windows into per-day segments;
- merges overlapping windows only within the same scope, unioning their threat labels;
- keeps Kyiv City and Kyiv Oblast in separate lanes when `scope=both`;
- renders every selected calendar day on the same 00–24 axis, newest-first so the closest day is at the top;
- renders the per-day total as compact `H:MM | percent-of-24h` on one line;
- treats a missing interval as missing stored timing, never as evidence that the day was alert-free; for ranges reaching before 19 September 2026 the UI explicitly warns that Kyiv Oblast historical timing coverage is incomplete.

This view uses existing `alert_events.started_at`, `ended_at`, `alert_type` and `threat_types_json`; there is no additional persistence layer or migration.

## Trends rendering

The React client also derives the comparative trends view from `GET /api/range`:

- daily rows are aggregated by calendar date when `scope=both`;
- the inclusive date range is filled with zero-alert days before any trend calculation;
- total alert time, alert count, average duration per alert, and alert-active-day share are compared across equal-length early/recent windows;
- an odd middle day stays in the line series but is excluded from the equal-window comparison;
- the visible direction line uses a trailing 1-, 3-, or 7-day moving average depending on the selected range length, while raw daily values remain visible;
- no composite danger, destruction, or severity score is calculated.

Long-period range responses batch incident-source lookups so D1 queries stay below the platform bind-variable limit; the API response contract is unchanged.

## Localization flow

The application treats locale as presentation data, not as an attribute inferred from whatever language a source happened to use.

- `src/i18n.ts` owns interface labels for English and Ukrainian.
- Research incident payloads may contain explicit `localizations.en` and `localizations.uk` values for area names, summaries, reported locations, and damage text.
- D1 stores that object in `incidents.localizations_json`; period/day APIs return it unchanged as structured locale data.
- React never renders raw incident narrative fields directly. `src/localized-content.ts` selects the requested locale and uses structured localized facts when a legacy record has no exact translation.
- Source/publisher labels are evidence metadata and remain in their published/canonical form.
- `npm run validate:i18n` prevents canonical research narrative from silently switching language and rejects direct raw narrative rendering in primary React views.

This keeps old research files compatible while making newly researched content capable of exact bilingual presentation.

## Data integrity principles

- Raw source evidence is immutable.
- Normalized facts point back to source items.
- Consequence updates are append-only history with one current value.
- Daily aggregates are derived and rebuildable.
- Alert timing aggregates merge overlapping intervals across raions and sources before counting periods/duration; raw source intervals remain preserved.
- Research incident area has one canonical meaning. The importer writes `area.name` consistently and public APIs prefer the canonical research location when legacy columns disagree.
- Attack-level casualties are authoritative for overall date/scope totals when an attack record exists. Incident casualties are area-attributed detail and are used as the overall fallback only when there is no attack record for that date/scope.
- Incident-to-attack linkage is inferred only when exactly one attack matches the same date/scope; ambiguous links must be explicit.
- One area-specific incident must not combine consequences from multiple distinct districts/raions.
- Kyiv calendar dates are computed using the `Europe/Kyiv` timezone during ingestion.
- The public map is statistical/historical, not a live tactical tracker.

## Map rendering

Map rendering is deliberately separate from temporal filtering: changing the selected period changes the incident set first, then the map always renders period-level semantic area aggregates. Aggregation identity is the canonical `scope + area` key, not a translated label and not zoom-dependent proximity. Counts and drill-downs always include every incident with that key. For Kyiv City districts, the bundled district polygon itself supplies the aggregate marker anchor, so the marker remains an administrative aggregate rather than a synthetic incident point; other areas fall back to the existing map-eligible incident anchor. Safe generalized neighborhood/street/address records may be overlaid as individual drill-down markers, and historical non-sensitive `address-point` incidents may be overlaid as exact points; all still contribute to the corresponding aggregate count.

For Kyiv City, MapLibre renders a low-opacity polygon fill and outline from the bundled `public/data/kyiv-districts.geojson` asset. The same geometry is used to calculate a representative marker point inside each district: the polygon centroid is preferred when it lies inside the district, with an interior fallback for irregular shapes. This changes only presentation coordinates for district aggregates; it does not alter aggregation identity, incident coordinates, filtering, severity, or source evidence. The geometry is derived from OpenStreetMap administrative boundaries and is served from the same origin so district context, marker anchoring, hover and polygon selection do not depend on a third-party GIS request. Hover is presentation-only apart from the localized district label; polygon click reuses the same canonical area-selection contract as the aggregate marker. The district layer is hidden for Kyiv-Oblast-only scope.

The MapLibre canvas is resized with its container through `ResizeObserver`. This is required because the desktop layout keeps the map fixed while the left panel scrolls independently; a container-size change without `map.resize()` can stretch the WebGL canvas and visually corrupt raster tiles.

## Historical reconciliation pipeline

Historical and daily incident research run in the production Cloudflare Worker.

```text
Cloudflare Cron
   |
   +-- minute scheduler -> throttled backfill (~5 min)
   |     seed 2022-02-24 onward (migration 0020), append eligible dates daily
    |     exclude the newest seven publication days (handled below)
    |     reconcile imported research_files -> done dates
   |     claim at most one remaining D1 campaign date
   |     scan official KODA + Kyiv City publications (E..E+14)
   |     supplement with one bounded GDELT query; Google News RSS fallback when needed
   |     tolerate partial provider outages when at least one discovery provider completes
   |     provider-wide cooldown on throttling; transient failures do not burn date retries
   |     fetch a bounded set of publisher pages with timeouts
   |     Workers AI structured extraction
   |     deterministic validation / area normalization / dedup
   |     conservative upsert -> attacks / per-physical-incident rows / evidence
   |     complete or retry D1 campaign row
   |
   +-- recent/daily research
         minute cron, internally throttled to roughly hourly
         scan rolling seven-day Kyiv publication window
         primary: Ukrainska Pravda RSS + direct Suspilne Kyiv
         fallback: Google News RSS; supplementary: KODA/Kyiv City
         no GDELT in recent path; one healthy news source is sufficient
         single-flight runner + D1 partial unique index + ambiguity-safe evidence matching
         audit every explicitly mentioned Kyiv district for physical consequences
         classify each publication by original event date
         preserve distinct physical incidents within the same district/day
         use the same extraction + persistence path

D1
   +-- automated_research_days   durable campaign queue / leases / retries
   +-- automated_research_runs   auditable run history
   +-- sources / source_items    evidence
   +-- attacks / incidents       normalized product data
```

The AI model never chooses source URLs or public map coordinates. URLs come from discovery code. Administrative fallbacks still use deterministic coarse area mappings; for Kyiv City only, the model may identify an explicitly source-supported civilian neighborhood or street label after building/unit numbers are removed. Code-side safety filters reject sensitive infrastructure, a bounded geocoder resolves the sanitized label, and the result is rounded to 0.01° with a 1.5–2 km display radius. If any step fails, the incident stays on the coarse administrative mapping. Existing stronger verified records are not overwritten by weaker automated findings.

The multi-year queue preserves existing imported/processed dates through idempotent seeding. The status API reports complete totals but samples just 30 recent historical date rows to keep the dashboard responsive. Dates needing review prevent the campaign from reporting full completion. Alert timing before the 2026 collector is not automatically reconstructed by news research.

The old GitHub JSON importer remains useful for curated/manual corrections and for seeding D1. Imported `research_files` dates are reconciled into native campaign completion state before new work is claimed, preventing duplicate historical research. The old `data/pipeline/*.json` campaign is no longer the production control plane; `.github/workflows/research-pipeline.yml` is inbox/manual only.

`/progress` projects the native D1 campaign into the existing `researchBackfill` API shape (state version 4), so the UI does not need a parallel progress model.
## KOVA scope

KOVA remains a supporting source for current/recent Kyiv Oblast alert-state messages. It is not the core source for attack incidents/consequences, and public Telegram archive pagination is not relied on as the authoritative six-month historical incident or alert-timing backfill.
