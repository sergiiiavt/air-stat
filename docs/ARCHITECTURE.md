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
structured alert sources            today's newly published news/sources
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

Returns only map-eligible generalized locations supported to district/raion precision or better. City/oblast-only records remain in statistics but are excluded from public map points and heatmaps. The range response also returns broad incidents with null public coordinates so future visualizations cannot accidentally treat a city/oblast centroid as an incident point. Do not return precise recent strike coordinates.

## UI hierarchy

The React shell separates controls by scope:

- the top header owns global visualization mode: Map, Daily timeline, or Trends;
- the shared filter bar owns geography and date range;
- the map surface contains one optional heatmap-density control; marker representation itself is fixed and semantic;
- numbered markers are anchored by map-eligible incidents but aggregate all incidents belonging to the same canonical scope + administrative area/location across the full selected date range. The marker count therefore matches the incident drill-down exactly;
- the range API exposes a stable scope-aware area `key`, and the affected-area list, map marker selection, summary card, camera focus, and incident filter all use that same identity rather than a translated/display label;
- generalized district/raion/settlement/neighborhood/street incidents do not render as separate event dots, so repeated centroid coordinates cannot form artificial circles of circles;
- only incidents with public precision `address-point` additionally render as selectable individual dots. They remain included in their area's aggregate count;
- selecting a specific incident, whether from an exact-address map point or the incident list, also selects that incident's stable scope-aware area key; the detail expands inline and the surrounding incident list contains only incidents from that same area;
- heatmap density continues to use individual mappable incident coordinates independently of the visible marker model;
- the left detail panel remains structurally stable during Map and Daily timeline drill-downs instead of being replaced by a separate incident screen;
- Trends uses the full visualization width because it operates on the complete selected period;
- the header also owns the persistent light/dark theme toggle;
- theme choice is bootstrapped in `index.html` before the React bundle renders, then managed by React and persisted in `localStorage`;
- the MapLibre raster layer adjusts brightness/saturation with the UI theme so the map and surrounding controls remain visually consistent.

This avoids presenting non-map analytics as controls layered on top of the map.

Presentation follows `docs/DESIGN.md`. The shared palette is defined in `src/theme.css`; component styles consume semantic colors instead of maintaining separate light-theme overrides. The area list is an optional native disclosure, and the incident panel shows the current area/date with a reset action. Archive metadata is a separate disclosure. Trends measures its SVG width using `ResizeObserver` so axis text remains readable as the layout changes. The progress page scrolls as a normal document.

Map initialization is guarded: if WebGL cannot start, the page keeps its statistics and incident list and offers the daily visualization. The same fallback follows the live context, so a WebGL context lost after startup also shows it and a restored context returns to the map. This fallback does not synthesize map locations or alter incident selection.

Loading and error states are drawn over the visualization instead of replacing it, so changing scope, period or locale does not unmount the map and discard its WebGL context and tile cache. The map still re-fits its camera to the incidents of the selected period.

## Daily timeline rendering

The React client derives the daily timeline from `GET /api/range`:

- daily rows are aggregated by date when `scope=both`;
- the full inclusive calendar range is generated client-side so days without alerts/incidents remain visible as zeroes;
- bar height represents total alert seconds;
- alert count is shown independently of duration;
- researched incidents provide separate impact/damage, injury and fatality indicators;
- all displayed months share the same duration scale.

No synthetic destruction score is stored or calculated.


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

Map rendering is deliberately separate from temporal filtering: changing the selected period changes the incident set first, then the map always renders period-level semantic area aggregates. Aggregation identity is the canonical `scope + area` key, not a translated label and not zoom-dependent proximity. An aggregate is placed only when at least one member has map-eligible coordinates, while its count and drill-down include every incident with that same key. Exact `address-point` incidents are overlaid as individual drill-down points while still contributing to the corresponding aggregate count.

The MapLibre canvas is resized with its container through `ResizeObserver`. This is required because the desktop layout keeps the map fixed while the left panel scrolls independently; a container-size change without `map.resize()` can stretch the WebGL canvas and visually corrupt raster tiles.


## Historical reconciliation pipeline

Historical incident reconstruction is organised by **event date**. The control plane is deterministic code, not prompt text: the research agent is a stateless worker that reads one assignment and creates one submission.

```text
data/pipeline/next.json  ---- read by the research agent
        |                       |
        |                       v
        |                 data/inbox/backfill-E.json      (exactly one file)
        |                       |
        |                       v
        |     .github/workflows/research-pipeline.yml     (concurrency group)
        |       node scripts/research-pipeline.mjs run
        |         1. merge submissions by id -> data/YYYY/MM/*.json
        |            regenerate data/index.json from disk
        |            validate the whole archive in-process
        |            invalid -> restore original bytes, record the errors
        |            delete the submission; append to log.json
        |         2. lease check -> timeouts, release
        |         3. cap reached -> needs_review, move on
        |         4. plan the next date (alert days first)
        |                       |
        +-----------------------+--> one atomic commit on main
                                     push with pull --rebase retry
```

Why this shape:

- no branches and no pull requests, so an interrupted run cannot leave an orphan branch that deadlocks the next one;
- one file write per agent run, so there is no partial multi-file state to reason about;
- the lease lives in code, so a silent agent death is counted without the dying run having to record anything;
- `needs_review` plus timeout-first rotation means one bad date cannot block the rest;
- `data/index.json` is generated from disk, so it has a single writer and cannot conflict;
- validation happens before anything lands on `main`, and a rejected submission restores the original bytes;
- one run per date instead of the two the PR transaction needed.

Daily research and the historical campaign may both touch the same old event file. That is safe because every write goes through the same serialised pipeline: submissions are merged by record id, sources are unioned, and the pipeline is the only writer.

Campaign progress and event archive coverage remain intentionally different metrics.

The `/progress` dashboard reads `GET /api/progress`. The endpoint refreshes `data/pipeline/state.json` from GitHub and projects it onto the established `researchBackfill` response shape. The browser polls every 15 seconds; the upstream GitHub response may be cached by Cloudflare for roughly one minute.

The Worker's research importer isolates each manifest file: one invalid document or one stale raw-GitHub response is recorded and skipped rather than aborting the rest of the manifest, and the poll timestamp is always written so a persistent failure retries on the normal ten-minute cadence instead of every minute.

The 50 km settlement catalogue at `data/reference/kyiv-50km-settlements.json` is an optional discovery aid; it does not require hundreds of searches for every researched date.

## KOVA scope

KOVA remains a supporting source for current/recent Kyiv Oblast alert-state messages. It is not the core source for attack incidents/consequences, and public Telegram archive pagination is not relied on as the authoritative six-month historical incident or alert-timing backfill.
