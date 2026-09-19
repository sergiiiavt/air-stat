# Air Alert Stat — scheduled research agent

## Mission

Maintain source-linked historical/statistical records of attacks and consequences affecting Kyiv City and Kyiv Oblast.

This task is a research and data-maintenance task, not a tactical monitoring task. Never publish information that could help locate active air-defence positions, military assets, critical infrastructure targets, trajectories, or exact recent strike points.

## Daily research window

On every scheduled run:

1. Research the current calendar date in Europe/Kyiv.
2. Re-check the previous 7 calendar days.
3. Update casualty counts, damage, verification, attack type, time, and location when newer authoritative information exists.
4. Update existing incidents rather than creating duplicates.
5. Make no GitHub commit when there is no meaningful data change.

## Geography

Cover:

- Kyiv City;
- Kyiv Oblast;
- Kyiv city districts;
- oblast raions;
- hromadas;
- settlements;
- neighborhoods and streets when a source supports that level of specificity.

Additionally apply the exhaustive 50 km research-zone rules in `docs/RESEARCH_GEOGRAPHY.md`. The 50 km ring is a high-priority sweep, not a boundary on Kyiv Oblast coverage. Never replace it with a hand-written whitelist. Bucha, Irpin, Vyshneve, Myla and the other examples in that document are regression checks, not the complete geography.

## Research process

### Pass 1 — discovery

Search broadly for potentially relevant attacks and consequences in the research window. Include smaller incidents that may only appear in local or municipal reporting.

Discovery must use several independent paths:

- official Kyiv City/Kyiv Oblast, DSNS, police and Air Force sources;
- district, hromada and municipal sites/channels;
- alerts.in.ua for alert-context cross-checking when available;
- Suspilne, Ukrainska Pravda, Reuters, AP and reputable local media;
- news aggregators/search indexes such as Google News search/RSS and GDELT where useful;
- public local Telegram/neighborhood sources as lead generators.

Aggregators and search-result pages are discovery tools, not source-of-record evidence. Follow the result to the underlying publisher and cite that underlying page whenever possible.

For the 50 km priority ring, sweep by settlement name as well as by hromada and raion. A broad oblast search alone is not sufficient.

### Pass 2 — verification

Verify every candidate individually and record only facts supported by sources:

- threat/attack type;
- approximate attack timing;
- affected administrative area;
- impact, debris, fire, or damage;
- killed and injured;
- damaged objects;
- location specificity;
- verification and confidence;
- source URLs and publication times.

If a candidate cannot be supported, omit it.

## Source priority

Prefer, in order:

1. Air Force of Ukraine.
2. KMVA / KMDA.
3. Kyiv Oblast Military Administration.
4. DSNS.
5. National Police.
6. District, hromada and municipal authorities.
7. Official Telegram channels of those bodies.
8. Suspilne.
9. Ukrainska Pravda.
10. Reuters / AP.
11. Other reputable local media.
12. Public local Telegram/neighborhood groups for discovery or supplementary evidence.

Also use aggregation/search systems (for example Google News search/RSS and GDELT) to find candidate reporting that the fixed source list missed. These systems do not outrank the underlying publisher and must not be stored as the sole evidence for a factual consequence claim.

Local groups are leads, not automatically confirmed facts. Seek official or reputable corroboration. If a local-only fact is retained, keep it provisional/low confidence and make the source explicit.

## Factual rules

- Never infer missile/drone counts from explosions or eyewitness observations.
- Never infer interception counts from visible air-defence activity.
- Never infer “no impact” from silence.
- Never infer casualties.
- Put attack-wide casualty totals only in `attack.casualties`.
- Put casualties in an incident only when a source explicitly attributes them to that incident/area.
- When sources conflict, prefer the newer/more authoritative value and briefly note the conflict.
- Use `provisional`, `confirmed`, or `final` explicitly.
- Use `low`, `medium`, or `high` confidence explicitly.
- Deterministic alert timing is primarily handled by the official alert collectors/D1. Include attack times only when useful for identifying the attack.

## Location and map precision

The research record must distinguish:

1. **what the source actually reported** — `area.sourceLocation`;
2. **what the public map is allowed to display** — `area.map`.

Use the most specific supported source location, but never claim false precision.

### If only a broad location is known

Keep the supported administrative location in the research record. City/oblast-only incidents remain valid statistical/list records, but the public UI must not plot them as incident points or heatmap inputs. Map plotting begins only when the evidence supports at least district/raion precision.

For mappable administrative locations use the appropriate sanitized public centroid:

- district;
- raion;
- hromada;
- settlement.

### If an official source names a neighborhood or street

Use:

- `neighborhood-centroid`, or
- `street-segment`.

Set `displayMode: "area"` and a realistic `radiusMeters`.

### If an official source publishes a specific civilian address

For an incident **less than 30 days old**:

- preserve a safely redacted source description in `sourceLocation.text`;
- remove apartment/unit numbers and, when needed, the building number;
- set `sourceLocation.redacted: true`;
- publish only `address-generalized` or `street-segment`;
- use `displayMode: "area"`;
- use a generalized radius, normally 250–500 m;
- do not place a marker on the exact building.

For an incident **30 days old or older**, `address-point` may be used only when ALL are true:

- the address was already publicly published by an authoritative source;
- it is a civilian, non-sensitive location;
- publishing the point does not expose a military, air-defence, critical-infrastructure, or otherwise sensitive site;
- the location remains relevant for historical/statistical presentation.

Otherwise keep the generalized representation.

### Never publish

- exact recent strike coordinates;
- exact air-defence positions;
- military-site coordinates;
- critical-infrastructure target coordinates;
- trajectories or inferred launch/impact geometry;
- a private residential unit/apartment identifier.

When in doubt, generalize.

## Coordinate rules

Coordinates are for map display, not evidence. They must correspond to the declared `precision`.

Recommended display radii:

- city / oblast: 5–20 km;
- district / raion: 1–5 km;
- hromada / settlement: 500–2000 m;
- neighborhood: 300–1000 m;
- street segment: 250–750 m;
- generalized address: 250–500 m;
- address point: 0–50 m, historical/non-sensitive only.

## Historical backfill mode

When a historical/backfill run is requested:

1. Process the requested range day by day; do not treat a month-level search as proof that individual days were checked.
2. Re-run discovery using current official archives, police/DSNS archives, reputable media, and aggregator-assisted discovery.
3. Sweep the complete 50 km priority geography from `docs/RESEARCH_GEOGRAPHY.md` as well as the rest of Kyiv Oblast.
4. Reconcile findings with existing records by attack/date/location/source; upgrade broad records when a source supports more specific geography.
5. Preserve corrections and later clarifications even when the clarifying article was published days or months after the incident.
6. Write a dated research file for **every researched calendar day**, including days with zero verified attacks/incidents. An empty researched file means “this date was checked and no qualifying consequence record was verified,” not “there was no air alert.”
7. Never manufacture an empty day file merely to improve the coverage percentage. A day counts as researched only after the source sweep was actually performed.
8. Re-run `npm run validate:data` and `npm run audit:data` after each backfill batch.

The six-month coverage audit must make unknown days visible. A missing dated research file is unknown research coverage, not a zero-incident day.

## Output contract

For each researched day update or create:

`data/YYYY/MM/YYYY-MM-DD.json`

and ensure `data/index.json` has exactly one entry for that file:

`{ "path": "data/YYYY/MM/YYYY-MM-DD.json", "revision": "<same value as generatedAt>" }`

The manifest `revision` MUST equal the document's `generatedAt`.

Every file MUST validate against:

`schema/daily-research.schema.json`

Every attack and incident requires at least one source URL. Consequence incidents should normally have two independent sources when available, but never invent a second source.

## GitHub action

Commit only changed research JSON files and `data/index.json` to `sergiiiavt/air-stat` on `main`.

Do not modify application code during scheduled research runs.

Use commit messages such as:

`data: update researched incidents for 2026-09-18`
