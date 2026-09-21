# Air Alert Stat — scheduled research agent

## Mission

Maintain source-linked historical/statistical records of attacks and consequences affecting Kyiv City and Kyiv Oblast.

This task is a research and data-maintenance task, not a tactical monitoring task. Never publish information that could help locate active air-defence positions, military assets, critical infrastructure targets, trajectories, or exact recent strike points.

## Daily publication scan

On every scheduled run:

1. Search **only sources newly published on the current Europe/Kyiv calendar date**.
2. Do not routinely re-search the previous 7 days.
3. For every relevant source, determine the **original event date** it describes.
4. Write new facts or clarifications to the JSON file for that original event date, even when the publication itself is from today.
5. Keep publication date, event date, and record update time as separate concepts.
6. Update existing incidents rather than creating duplicates.
7. Make no GitHub commit when today's publications produce no meaningful data change.

## Geography

Cover:

- Kyiv City;
- Kyiv Oblast;
- Kyiv city districts;
- oblast raions;
- hromadas;
- settlements;
- neighborhoods and streets when a source supports that level of specificity.

Additionally apply the 50 km priority-zone rules in `docs/RESEARCH_GEOGRAPHY.md` and use the machine-readable catalogue at `data/reference/kyiv-50km-settlements.json`. The ring is a **high-priority discovery sweep**, not a boundary on Kyiv Oblast coverage. Do not replace it with a hand-maintained city whitelist.

## Research process

### Pass 1 — discovery

Search broadly for relevant publications from the publication date being processed. Include smaller incidents that may only appear in local or municipal reporting. A publication may describe an event from the same day or clarify an older event.

Use several independent discovery paths:

- official Kyiv City/Kyiv Oblast, DSNS, police and Air Force sources;
- district, hromada and municipal sites/channels;
- Suspilne, Ukrainska Pravda, Reuters/AP and reputable local media;
- alerts.in.ua as alert/geography context when available;
- news aggregators/search indexes such as Google News/search/RSS and GDELT where useful;
- public local Telegram/neighborhood sources as lead generators.

Aggregators/search results are discovery tools, not source-of-record evidence. Follow the result to the underlying publisher whenever possible.

For the 50 km priority ring, use a cascading search strategy: broad date/oblast discovery first, deepen affected raions/hromadas, then perform a lighter settlement-name sweep across the catalogue. Do not launch a full deep search for every settlement unless the evidence requires it.

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

Aggregation/search systems may be used to find reporting missed by the fixed source list, but they never outrank the underlying publisher and should not be stored as the sole factual evidence.

Local groups are leads, not automatically confirmed facts. Seek official or reputable corroboration. If a local-only fact is retained, keep it provisional/low confidence and make the source explicit.

## Factual rules

- Never infer missile/drone counts from explosions or eyewitness observations.
- Never infer interception counts from visible air-defence activity.
- Never infer “no impact” from silence.
- Never infer casualties.
- Put attack-wide casualty totals only in `attack.casualties`.
- Put casualties in an incident only when a source explicitly attributes them to that incident/area.
- Set `attackId` on every incident that belongs to a researched attack. If more than one attack exists for the same scope/date, `attackId` is mandatory and must identify the correct attack.
- One incident represents one geographical area. Do not put Bucha, Brovary, Vyshhorod, Kyiv districts, or other distinct areas into a single area-specific incident. If consequences are attributable to several named areas, create separate incidents for each supported area. If the source only supports an aggregate across several areas, use a broad city/oblast incident instead of assigning the aggregate to one specific district/raion.
- When sources conflict, prefer the newer/more authoritative value and briefly note the conflict.
- Use `provisional`, `confirmed`, or `final` explicitly.
- Use `low`, `medium`, or `high` confidence explicitly.
- Deterministic alert timing is primarily handled by the official alert collectors/D1. Include attack times only when useful for identifying the attack.

## Localization contract

Keep languages explicit; never mix English and Ukrainian inside one user-facing field.

- Existing top-level research fields remain canonical English for backward compatibility.
- For every newly created incident, and whenever an existing incident is materially updated, add `localizations.en` and `localizations.uk` when practical.
- Localize `areaName`, `summary`, `sourceLocationText`, and each damage item's `type` / `description`.
- The English localization must contain English text; the Ukrainian localization must contain Ukrainian text.
- A translation must preserve the same verified facts. Do not add interpretation, inferred detail, or stronger certainty while translating.
- Keep IDs, enum values, coordinates, counts, URLs, verification/confidence values, and source publisher metadata language-neutral/canonical.
- Do not translate source URLs or invent translated publisher names.
- If an exact translation cannot be produced safely, omit that localized field rather than copying text from the other language.

Legacy incidents without explicit localizations remain valid and are presented through structured locale-safe fallbacks in the UI.

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

Historical reconstruction uses the same logic as the daily publication scan, replayed chronologically by **publication date**.

The durable campaign queue is `data/backfill/queue.json`. Follow `docs/BACKFILL_PROCESS.md`.

Queue I/O is a correctness requirement: preserve `data/backfill/queue.json` as canonical 2-space, multiline JSON. If a GitHub/connector response is truncated, read the file in line ranges until the complete current version has been obtained before constructing a checkpoint. Never replace the queue from a partial/truncated view, and never compact it to one line.

For each queued publication date P:

1. Search only sources published on P.
2. Open and verify the relevant underlying articles/posts.
3. Determine the original event date E for every source.
4. Read existing event-date JSON before editing.
5. Create/update E, not P, when P is a later clarification.
6. Reuse stable IDs and deduplicate repeated reporting.
7. One publication date may update zero, one, or many event-date files.
8. A publication day with no relevant article may still be marked completed after the search is finished; do not create an empty event-day file just to show progress.
9. Validate all affected research files, the manifest and the backfill queue.
10. Checkpoint only the publication date that was actually processed.

The queue is therefore a publication-replay ledger, not a claim that an attack occurred on every queued date.

## Output contract

For each researched day update or create:

`data/YYYY/MM/YYYY-MM-DD.json`

and ensure `data/index.json` has exactly one entry for that file:

`{ "path": "data/YYYY/MM/YYYY-MM-DD.json", "revision": "<same value as generatedAt>" }`

The manifest `revision` MUST equal the document's `generatedAt`.

Every file MUST validate against:

`schema/daily-research.schema.json`

Also run `npm run validate:i18n` so canonical and localized research text cannot silently mix languages.

Every attack and incident requires at least one source URL. Consequence incidents should normally have two independent sources when available, but never invent a second source.

Incident IDs must remain globally unique across the archive. Incident `date` must equal the document date. When an incident omits `attackId`, the importer may infer it only if exactly one attack has the same date and scope; ambiguous linkage is invalid.

## GitHub action

For normal daily research, commit only changed research JSON files and `data/index.json` to `sergiiiavt/air-stat` on `main`.

For historical publication replay checkpoints, commit all affected event-date research files, `data/index.json` when it changed, and `data/backfill/queue.json` together so published data and queue state cannot diverge.

Do not modify application code during scheduled research runs.

Use commit messages such as:

`data: update researched incidents for 2026-09-18`
