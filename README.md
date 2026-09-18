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

Kyiv City alert history/current state is collected from Kyiv Digital. Kyiv Oblast current official messages are collected separately. These collectors do not depend on LLM interpretation.

### ChatGPT research

The scheduled research agent follows `docs/RESEARCH_AGENT_PROMPT.md`.

It performs:

1. broad candidate discovery;
2. candidate-by-candidate verification;
3. source reconciliation;
4. structured JSON output;
5. GitHub commit.

Every file must validate against `schema/daily-research.schema.json`.

The Worker polls the public GitHub manifest and imports only changed revisions. No Cloudflare credential is required by the ChatGPT research job.

## Interactive map

The main UI is period-first rather than single-day-first.

Supported period controls:

- 3 days
- 7 days
- 30 days
- 3 months
- custom dates

Geography:

- Kyiv City
- Kyiv Oblast
- both

The map initially displays affected administrative areas aggregated for the selected period. Clicking an area drills into individual incidents. Clicking an incident opens consequence details and evidence sources.

Map indicators and heatmap density use only incidents with district/raion-level or more specific public-map precision. City/oblast-only records remain available in statistics and incident lists but are not plotted as synthetic center points. Recent events use sanitized public administrative/generalized locations, never exact strike or air-defence coordinates.

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

## Validation

```bash
npm install
npm run validate:data
npm run build
npm run cf:dry-run
```

CI rejects invalid research JSON before application validation completes.

## Cloudflare

- Worker: `air-stat-api`
- D1: `air-stat-db`
- Custom domain: `air-alert-stat.com`

D1 migrations live in `migrations/`.

Successful CI runs on `main` deploy the validated frontend build and Worker automatically only when runtime/UI/configuration files changed. Data-only research and historical-backfill commits still run validation/build CI but skip the production deployment job. The build job uploads `dist` as a short-lived artifact only for deployable changes, and the production job reuses that exact artifact instead of installing dependencies a second time.

The production deploy job requires these GitHub repository or `production` environment secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Before deployment, CI validates research data, builds the frontend, and runs a Cloudflare dry-run. The production job then applies remote D1 migrations and deploys the Worker/static assets.

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
