# Air Alert Stat — scheduled research agent

## Mission

Maintain source-linked historical/statistical records of attacks and consequences affecting Kyiv City and Kyiv Oblast.

This task is a research and data-maintenance task, not a tactical monitoring task. Never publish information that could help locate active air-defence positions, military assets, critical infrastructure targets, trajectories, or exact recent strike points.

## Daily publication scan

On every scheduled run:

1. Search **only sources newly published on the current Europe/Kyiv calendar date**.
2. Do not routinely re-search the previous 7 days.
3. For every relevant source, determine the **original event date** it describes.
4. Assign new facts or clarifications to the original event date, even when the publication itself is from today. The submission targets that event date; the pipeline writes the file.
5. Keep publication date, event date, and record update time as separate concepts.
6. Update existing incidents rather than creating duplicates.
7. Create nothing at all when today's publications produce no meaningful data change.
8. Read `data/pipeline/log.json` first. If your last daily submission was rejected, include those fixes in this run.

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


## Submission contract

You never write `data/**` and you never write `data/index.json`. Every run creates **exactly one file** under `data/inbox/`, and nothing else. A deterministic repository pipeline merges it, regenerates the manifest, validates the whole archive, and commits. Do not create branches and do not open pull requests.

`data/inbox/backfill-YYYY-MM-DD.json` for a historical assignment, `data/inbox/daily-YYYY-MM-DD-HHMM.json` for a daily run.

```json
{
  "schemaVersion": 1,
  "kind": "backfill",
  "taskDate": "2026-04-24",
  "submittedAt": "2026-09-25T10:15:00Z",
  "outcome": "updated",
  "searchSummary": "Short free text: queries and sites checked.",
  "documents": [
    {
      "date": "2026-04-24",
      "attacks": [],
      "incidents": [],
      "removeIds": []
    }
  ]
}
```

- `kind`: `backfill` for an assigned event date, `daily` for the publication scan.
- `taskDate`: the assigned event date for `backfill`; today's publication date for `daily`.
- `outcome`: `updated` when the run produced data, `no-findings` when the search finished with nothing relevant. `no-findings` allows `documents: []`; `updated` needs at least one record or one `removeIds` entry.
- `documents[].date`: the **original event date** the facts belong to, never the publication date. One submission may target several event dates.
- `attacks` and `incidents` hold complete objects in the shape of `schema/daily-research.schema.json`. `removeIds` lists attack/incident ids to delete from that date.

### Merge rules you must plan around

- Records are matched by `id`. A submitted record with an existing id **replaces** that record, so always send the **complete object**, not a patch. Read the existing `data/YYYY/MM/<date>.json` before updating anything in it.
- `sources` are unioned by URL: submitted sources come first, and existing sources you did not resubmit are kept. Never drop evidence deliberately — use `removeIds` if a record must go.
- A document that ends with zero attacks and zero incidents deletes that event file. Never submit an empty document to represent "researched, nothing found"; use `outcome: "no-findings"` instead.
- The pipeline sets `generatedAt` and the manifest revision. Do not try to manage them.

### Rejections

If a submission fails validation the pipeline restores the archive, records the concise errors, and keeps the same date assigned. `data/pipeline/next.json` then carries `task.previousRejection.errors`, and `data/pipeline/log.json` carries the last 50 outcomes. Fix those exact errors in the next run. After three rejections or three lease timeouts the date is parked as `needs_review` and the campaign moves on.

## Historical backfill mode

Historical reconstruction is organised by **event date**, not by publication date. Follow `docs/BACKFILL_PROCESS.md`.

On every historical run:

1. Read `data/pipeline/next.json` on `main`. If `status` is not `assigned`, stop.
2. If `task.previousRejection` is present, fix exactly those errors in this run.
3. Research `task.eventDate` with two sweeps:
   - **event sweep** — Ukrainian and English queries with date variants (`24 квітня`, `24.04.2026`, `April 24 2026`) combined with Kyiv/Київщина and attack, damage, debris or casualty terms. Cover official sources (KMVA, KOVA, DSNS, police, hromadas) and local media.
   - **clarification sweep** — publications from `task.clarificationWindow.from` to `task.clarificationWindow.to` about the attacks found, for casualty updates and later damage totals.
4. Use `task.alerts` as context. It is `null` when there is no alert record for that date, which is **not** evidence that the day was quiet.
5. Use `task.existing` to reuse ids and avoid duplicates. It lists one line per existing record for E-1, E and E+1. To update one of them, open its data file and submit the complete object.
6. Create exactly one file at `task.inboxPath`. If that file already exists, stop — it is waiting to be processed.
7. If the search finished with nothing relevant, submit `outcome: "no-findings"` with empty `documents`. That still completes the date.

The assignment carries a lease in `task.expiresAt`. If you cannot finish, submit nothing: the pipeline counts the timeout and rotates the date. Never invent findings to close a date.

Campaign progress counts event dates researched. It is not evidence that an attack occurred on every campaign date.

## Output contract

Every attack and incident must satisfy `schema/daily-research.schema.json` once merged into its event-date file:

- at least one source URL per record; consequence incidents should normally carry two independent sources when available, but never invent a second source;
- incident and attack ids globally unique across the archive, and stable across updates;
- each record's `date` equal to its document date;
- `attackId` set on every incident that belongs to a researched attack, and mandatory when more than one attack exists for the same scope and date;
- canonical English text in the top-level fields, with `localizations.en` / `localizations.uk` added per the localization contract.

The repository pipeline runs the schema, identity, link, index and localization validators before anything reaches `main`, so a submission that breaks any of these rules is rejected rather than published. You do not need shell or npm access.

## GitHub action

Create the single submission file under `data/inbox/` on `main` and nothing else.

Do not modify `data/**` event files, `data/index.json`, `data/pipeline/**`, application code, or any other file during scheduled research runs. Do not create branches or pull requests.

Use a commit message such as:

`research: submit backfill 2026-04-24`
