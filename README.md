# Air Alert Stat

Historical/statistical dashboard for air alerts, attacks and consequences in Kyiv City and Kyiv Oblast.

Production: https://air-alert-stat.com

## Data architecture

The project deliberately separates deterministic alert timing from researched consequences.

```text
Kyiv Digital / official alert sources
        -> alert_events

Manual / legacy ChatGPT research
        -> data/inbox/*.json                     (one submission per run)
        -> research-pipeline workflow            (merge, validate, commit)
        -> data/YYYY/MM/YYYY-MM-DD.json
        -> data/index.json
        -> Worker GitHub importer
        -> attacks / incidents / evidence

D1
        -> /api/range
        -> interactive period map
```

### Deterministic alert timing

Alert timing is a separate supporting dataset for duration/count/trend charts. Kyiv Digital provides deterministic Kyiv City alert state/history. KOVA supports current/recent Kyiv Oblast alert-state messages, with alerts.in.ua as an optional additional source. KOVA is not the primary incident/consequence source, and public Telegram archive pagination is not treated as a reliable six-month history API.

### Automated incident research

Incident/consequence research now runs inside the production Cloudflare Worker; it does not depend on ChatGPT scheduled tasks.

- **Historical backfill:** the minute collector cron checks the durable D1 backfill queue and first reconciles dates already covered by the curated GitHub archive. For each remaining event date it scans official KODA and Kyiv City publications for E..E+14, uses one bounded GDELT query as supplementary discovery when available, and falls back to Google News RSS when coverage/candidate volume is insufficient. Provider outages degrade source breadth instead of failing the whole run when at least one discovery provider completed successfully. GDELT 429 responses trigger a shared cooldown, and temporary discovery outages requeue the date without consuming its retry budget. Candidates are balanced across sources, publisher reads are bounded/time-limited, Workers AI extracts only from code-selected evidence, and validated facts are persisted directly to D1.
- **Recent/daily research:** the minute Worker cron also drives a throttled recent-research pass. Roughly once per hour it re-scans a rolling seven-day publication window, with a shorter retry interval after failures. Recent discovery is intentionally **news-first**: direct Ukrainska Pravda RSS/daily archives and Suspilne Kyiv are the primary sources, Google News RSS is a fallback when those direct feeds are thin, and official KODA/Kyiv City pages are supplementary confirmation. GDELT is not used in the recent path. One healthy news path is enough to continue; an unrelated provider outage no longer discards usable reporting. Recent scans are single-flight: a still-running scan blocks overlapping minute-cron launches, and repeated findings backed by the same source/area/impact update an existing automated incident instead of creating another row. For Kyiv City, extraction also audits every explicitly mentioned district in each article so secondary impact locations are not dropped from multi-district reports. Up to 36 recent candidates are balanced with media first and extracted in bounded AI batches. The model identifies each finding's original event date, so late reports and later clarifications update the correct event instead of being permanently missed after an early snapshot. Distinct physical incidents in the same district/day receive stable per-incident identities instead of being collapsed into one area/day row.
- **Safety/data quality:** source URLs are selected by code, not invented by the model; unknown casualties stay unknown; exact recent strike, military, air-defence and critical-infrastructure locations are not produced; coordinates come only from deterministic coarse area mappings.
- **Conservative updates:** existing verified records keep their stronger facts. Automated research primarily adds evidence and only upgrades weaker fields when the new evidence is stronger. The one exception is migration of the old automated area/day identity: a legacy row known to have collapsed multiple physical incidents may be rewritten once with the rediscovered physical-incident detail before normal conservative-update rules resume.
- **Retries/state:** campaign claims, leases, attempts, completion and run history are stored in D1 (`automated_research_days`, `automated_research_runs`). A crashed lease is retried and repeated failures rotate instead of blocking the queue.

GitHub JSON under `data/YYYY/MM/` remains the curated seed/manual archive. `data/inbox/` and the legacy research workflow remain available for explicit manual corrections, but they are not the production scheduler.
## Interactive map

The main UI is period-first rather than single-day-first. Global visualization modes (Map, Daily timeline, 24-hour timeline, Trends) live in the application header; geography and date-range controls live in the shared filter bar. Map-only controls stay on the map.

The default first-visit UI is Ukrainian and opens the last 3 months (90 days). A language choice made by the user is persisted and overrides that default on later visits.

Supported period controls:

- 3 days
- 7 days
- 30 days
- 3 months
- 6 months
- custom dates

Geography:

- Kyiv City
- Kyiv Oblast
- both

The map uses one stable representation for the selected period:

- one numbered aggregate marker per canonical district, raion, settlement, or small city that has at least one map-eligible incident in the period;
- area identity is scope-aware (`Kyiv City` vs `Kyiv Oblast`) and is preserved from API aggregate through map click to incident-list filtering;
- the marker count equals the full incident drill-down for that exact scope + area, including non-mappable records that belong to the same canonical area;
- generalized district/settlement/street incidents are not drawn as separate overlapping dots;
- an incident is additionally shown as its own point only when its public precision is `address-point`, meaning an exact published civilian address is permitted by the map-location policy. That incident still remains part of the area's aggregate count.
- selecting any specific incident point also selects that incident's canonical scope + area, so the sidebar remains scoped to related incidents only while the selected incident is expanded inline; selecting the same incident from the incident list uses the identical flow.

Heatmap density is an independent optional overlay. The affected-area list remains an explicit area filter.

The interface supports light and dark themes from the application header. The selected theme is persisted in `localStorage` when browser storage is available; storage access is treated as optional so hardened/private browser contexts cannot crash startup. On first visit, or when storage is unavailable, the client follows the operating-system preference. Theme selection is applied before React starts to avoid a light/dark startup flash, and the map raster styling follows the selected theme.

### Interface design

The dashboard uses a shared, readable system-font scale and semantic light/dark colors. Metric groups and incident rows use simple separators; optional area selection and archive metadata are expandable. A selected area or day has an explicit reset action beside its name. The header links to collection progress at every screen size.

Desktop preserves an independently scrollable incident panel alongside the visualization. Phones put the visualization first and use normal page scrolling. Daily chart labels remain readable through horizontal chart scrolling; trend charts size their coordinates to the actual container. A browser without WebGL receives a map-unavailable message while statistics and incident lists remain usable. Client startup is also guarded independently of React: if the bundle cannot load or the root render throws, the page shows a recovery message instead of a silent blank screen.

See `docs/DESIGN.md` for the full design review and interface rules.

### Localization

English and Ukrainian are separate presentation locales. UI copy comes from locale dictionaries, while user-visible research text is selected through the locale-safe content layer instead of being rendered directly from research JSON.

Research files keep their existing canonical English fields for backward compatibility and may add `incident.localizations.en` / `incident.localizations.uk` for exact translated area names, summaries, reported locations and damage text. New or updated research should provide both locales when practical. Historical records without localized text use structured localized fallbacks, so selecting Ukrainian never exposes an English narrative and selecting English never exposes a Ukrainian narrative.

The Worker stores incident localizations independently in D1 and returns them with incident API payloads. Source/publisher names remain evidence labels and are not translated.

Map indicators and heatmap density use only incidents with district/raion-level or more specific public-map precision. City/oblast-only records remain available in statistics and incident lists but are not plotted as synthetic center points. The API also nulls broad city/oblast coordinates in period responses and excludes them from the dedicated map endpoint. Recent events use sanitized public administrative/generalized locations, never exact strike or air-defence coordinates.

## Daily timeline

The main visualization can be switched between the map and a calendar-complete daily timeline.

For every selected month the timeline:

- renders every calendar day in the selected range, including zero-activity days;
- uses bar height for total air-alert duration;
- shows the alert count above each bar;
- shows the researched incident count below the day;
- uses separate factual consequence indicators for impact/damage, injuries and fatalities;
- keeps one shared duration scale across all displayed months;
- lets a day selection filter the incident list without inventing a composite destruction/severity score.

The timeline is derived from the existing `/api/range` daily rows plus researched incidents. Missing dates are filled client-side with zero values.

## 24-hour timeline

The fourth visualization shows the exact alert windows inside each calendar day on a fixed 00–24 Kyiv-local clock.

- every selected calendar day is rendered newest-first, so the day closest to today is at the top; an empty lane means no stored interval and is not treated as proof that no alert occurred;
- each selected scope has its own lane, so `both` shows Kyiv City and Kyiv Oblast separately instead of flattening overlapping alarms;
- range responses expose the underlying `alert_events` windows (`started_at`, `ended_at`, alert type and threat types);
- the client splits cross-midnight alerts across the affected days and merges overlapping source records within the same scope before drawing them;
- the existing period and geography controls are reused, so this remains a full-width visualization mode rather than a separate route with duplicated filters.

No new database migration is required because the normalized alert table already stores the interval boundaries and alert metadata.

Current coverage caveat: Kyiv City has historical timing rows across the six-month archive, while Kyiv Oblast historical timing before 19 September 2026 is incomplete. The 24-hour view surfaces that limitation instead of turning missing timing data into a false “no alerts” claim.


## Trends

The third visualization is a full-width comparative trends view derived entirely from the existing daily `/api/range` rows. It intentionally drops the map/detail sidebar because its comparison and chart controls apply to the complete selected period rather than to one map area.

It provides:

- equal-window comparison of total alert time, alert count, average alert duration, and the share of days with alerts;
- daily line series with an adaptive 1-, 3-, or 7-day moving average to make direction visible without replacing the raw daily values;
- separate trends for total alert time, alert count, and average duration per alert;
- calendar-complete calculations, including zero-alert days, for the selected scope and date range.

For an odd-length range, the middle day remains in the line charts but is excluded from the equal-window comparison so both compared windows contain the same number of days.

## Research files

```text
data/
  index.json              generated from disk by the pipeline
  YYYY/
    MM/
      YYYY-MM-DD.json     one event date
  inbox/                  research submissions, consumed by the pipeline
  pipeline/
    state.json            campaign state (source of truth)
    next.json             current assignment for the research agent
    log.json              last 50 processed submissions
    alert-days.json       alert-day snapshot used for prioritisation
```

Manifest entry:

```json
{
  "path": "data/2026/09/2026-09-18.json",
  "revision": "2026-09-18T20:00:00+03:00"
}
```

The manifest revision must equal the document's `generatedAt`.


### Historical research pipeline

The active campaign is Cloudflare-native and covers event dates `2026-03-19` through `2026-09-19`.

- D1 is the runtime source of truth for campaign state and research run history.
- Alert days are prioritised from the existing `alert_events` table.
- One date is leased at a time; expired leases retry automatically.
- After five failed attempts a date becomes `needs_review` rather than blocking every later date.
- Each successful date is marked `updated` or `no-findings`.
- `GET /api/status` and `GET /api/progress` expose native state version 4.
- The old GitHub inbox processor runs only for explicit inbox pushes/manual dispatch.

See `docs/BACKFILL_PROCESS.md`.
### Live collection progress

A live dashboard is available at `/progress`. It polls `GET /api/progress` every 15 seconds and shows:

- campaign completion percentage and counts;
- the currently leased event date and when its lease expires;
- the last completed event date and the last accepted submission;
- the per-day campaign state for the full six-month range, with outcome and last error in the tooltip;
- retry/review counts, and whether the campaign is running, stalled, or has never received a submission;
- imported D1 research archive coverage and latest import timestamps.

`GET /api/progress` reads the Cloudflare-native D1 campaign state. The browser still polls every 15 seconds, but progress no longer depends on GitHub raw-file propagation.

### Historical research archive

The historical UI no longer exposes chunk-progress percentages. `/api/status` reports archive metadata from records that have actually been imported into D1:

- first indexed research date;
- latest indexed research date;
- number of distinct indexed research days;
- last import time.

These values describe the imported archive only. They do not imply that every calendar day between the first and last indexed dates has a research file.

## Validation

```bash
npm install
npm run validate:data
npm run validate:backfill
npm run validate:geography
npm run validate:i18n
npm run test:pipeline
npm run audit:data
npm run validate:kova
npm run validate:query-batching
npm run build
npm run cf:dry-run
```

CI rejects invalid research JSON, checks English/Ukrainian locale separation, and runs regression cases for the KOVA whole-oblast alert parser before the application build.

## Cloudflare

- Worker: `air-stat-api`
- D1: `air-stat-db`
- Custom domain: `air-alert-stat.com`

D1 migrations live in `migrations/`.

Successful CI runs on `main` deploy the validated frontend build and Worker automatically only when runtime/UI/configuration files changed. Data-only research commits still run validation/build CI but skip the production deployment job. The build job uploads `dist` as a short-lived artifact only for deployable changes, and the production job reuses that exact artifact instead of installing dependencies a second time.

The production deploy job requires these GitHub repository or `production` environment secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Before deployment, CI validates research data, validates the research pipeline control plane, runs the pipeline regression suite, audits coverage, validates the KOVA parser, builds the frontend, and runs a Cloudflare dry-run. The production job then applies remote D1 migrations, deploys the Worker/static assets, and smoke-checks the production health/status/range API contract. Range smoke checks include the frontend-facing incident damage shape so legacy database rows cannot crash rendering. Historical alert-source completeness is monitored separately and does not block unrelated application deploys. Recent-research code/configuration is smoke-checked synchronously, while the first successful background scan applying a newly deployed research revision is reported as an asynchronous readiness warning rather than blocking an unrelated UI/runtime deploy.

## API

### Period view

```http
GET /api/range?from=2026-09-01&to=2026-09-18&scope=both
```

Returns:

- alert totals;
- incident totals;
- killed / injured;
- affected-area aggregates;
- individual incidents and evidence links.

Legacy single-day endpoints remain available while the period-first UI becomes the primary interface.

## Publishing rules

- No tactical prediction or analysis.
- No exact recent strike coordinates.
- No exact air-defence locations.
- Do not derive weapon counts from explosions.
- Do not infer casualties.
- Do not treat local-group claims as confirmed without appropriate verification.
- Preserve source URLs and verification/confidence status.
