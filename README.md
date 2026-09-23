# Air Alert Stat

Historical/statistical dashboard for air alerts, attacks and consequences in Kyiv City and Kyiv Oblast.

Production: https://air-alert-stat.com

## Data architecture

The project deliberately separates deterministic alert timing from researched consequences.

```text
Kyiv Digital / official alert sources
        -> alert_events

Scheduled ChatGPT research
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

### ChatGPT research

The scheduled research agent follows `docs/RESEARCH_AGENT_PROMPT.md`.

It performs a simple publication-day workflow:

1. search today's newly published sources;
2. open and verify relevant articles/posts;
3. determine the original event date each publication describes;
4. create/update that event-date JSON, including retrospective corrections;
5. deduplicate, validate and commit meaningful changes.

It does not routinely re-search the previous 7 days.

Every file must validate against `schema/daily-research.schema.json`.

The Worker polls the public GitHub manifest and imports only changed revisions. No Cloudflare credential is required by the ChatGPT research job.

## Interactive map

The main UI is period-first rather than single-day-first. Global visualization modes (Map, Daily timeline, Trends) live in the application header; geography and date-range controls live in the shared filter bar. Map-only controls stay on the map.

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

Heatmap density is an independent optional overlay. The affected-area list remains an explicit area filter.

The interface supports light and dark themes from the application header. The selected theme is persisted in `localStorage`; on first visit the client follows the operating-system preference. Theme selection is applied before React starts to avoid a light/dark startup flash, and the map raster styling follows the selected theme.

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
  index.json
  YYYY/
    MM/
      YYYY-MM-DD.json
```

Manifest entry:

```json
{
  "path": "data/2026/09/2026-09-18.json",
  "revision": "2026-09-18T20:00:00+03:00"
}
```

The manifest revision must equal the document's `generatedAt`.


### Historical publication replay

Historical incident data is rebuilt with the same rule as the daily job, replayed by **publication date**.

- durable state: `data/backfill/cursor.json`;
- current campaign: publication dates `2026-03-19` through `2026-09-19`;
- exactly one publication day is processed per replay run;
- successful replay writes one immutable receipt under `data/backfill/runs/YYYY-MM-DD.json`;
- data files, `data/index.json`, the receipt, and the cursor advance are merged together through one replay PR after CI passes;
- the scheduled agent never writes a successful replay checkpoint directly to `main`; it prepares one replay PR, CI validates it, and only a successful merge advances the cursor; failed research attempts do not skip ahead;
- `staleAfterHours` makes a non-advancing replay visible as stalled in `/progress`;
- later clarifications update older event files rather than creating duplicate newer incidents;
- `npm run backfill:status` reports replay progress;
- `GET /api/status` exposes a synthesized per-day summary as `researchBackfill`.

See `docs/BACKFILL_PROCESS.md`.

### Live collection progress

A temporary live dashboard is available at `/progress`. It polls `GET /api/progress` every 15 seconds and shows:

- publication-replay completion percentage and counts;
- the last completed publication day and the next publication day;
- the per-day replay state synthesized from the cursor for the full six-month campaign;
- retry/review/failure counts;
- imported D1 research archive coverage and latest import timestamps.

`GET /api/progress` refreshes the GitHub backfill cursor before returning status. The upstream cursor fetch uses Cloudflare caching, so source changes can take roughly one minute to appear.

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

Before deployment, CI validates research data, validates the backfill cursor and replay receipts, audits coverage, validates the KOVA parser, builds the frontend, and runs a Cloudflare dry-run. The production job then applies remote D1 migrations, deploys the Worker/static assets, and smoke-checks the production health/status/range API contract. Historical alert-source completeness is monitored separately and does not block unrelated application deploys.

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
