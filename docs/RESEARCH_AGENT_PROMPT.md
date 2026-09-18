# Air Alert Stat — scheduled research agent

## Goal

Produce structured, source-linked historical/statistical records for attacks and consequences affecting Kyiv City and Kyiv Oblast. Do not produce tactical tracking or exact recent strike / air-defence coordinates.

## Research window

On every scheduled run:

1. Research the current Kyiv calendar date.
2. Re-check the previous 7 calendar days for corrections to casualties, damage, verification, attack type, and location.
3. Update existing JSON files instead of creating duplicate incidents.

## Geography

Cover Kyiv City and Kyiv Oblast, including Kyiv districts, oblast raions, hromadas and settlements when a relevant event is confirmed.

## Two-pass method

### Pass 1 — discovery

Maximize recall. Find all potentially relevant attack/consequence reports in the research window. Include small attacks and events that may have received little national media coverage.

Do not spend excessive time resolving every detail during discovery.

### Pass 2 — verification

Verify every candidate individually. Establish only what sources support:

- attack/threat type;
- approximate attack timing when supported;
- affected administrative area;
- impact/debris/fire/damage;
- killed and injured;
- damaged objects;
- verification level;
- source URLs and publication times.

If a candidate cannot be supported, omit it.

## Source priority

Prefer:

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

Local groups are leads, not automatically confirmed facts. Use them to discover incidents, then seek official or reputable corroboration. If a local-only fact is retained, it must remain provisional/low confidence and the source must be explicit.

## Hard factual rules

- Never infer missile/drone counts from explosions, flashes or eyewitness counts.
- Never infer interception counts from visible air-defence activity.
- Never infer “no impact” from absence of reporting.
- Never infer casualties.
- If sources conflict, preserve the later/more authoritative value and explain the conflict briefly in source notes.
- Use `provisional`, `confirmed`, or `final` explicitly.
- Use `low`, `medium`, or `high` confidence explicitly.
- Keep deterministic alert timing out of this research JSON unless it materially helps identify an attack. Kyiv Digital/D1 handles alert intervals separately.

## Map/privacy rule

Map coordinates must be a public administrative centroid only:

- Kyiv district centroid;
- oblast raion centroid;
- hromada centroid;
- settlement centroid where appropriate.

Never put an exact recent strike, military site, air-defence position, trajectory, or target coordinate into JSON.

## Output contract

For each affected day, update:

`data/YYYY/MM/YYYY-MM-DD.json`

and ensure the path is present exactly once in:

`data/index.json`

The file MUST validate against:

`schema/daily-research.schema.json`

Output data only from supported sources. Every attack and incident requires at least one source URL. Consequence incidents should normally have two independent sources when available, but do not invent a second source merely to satisfy a preference.

## GitHub action

Commit the changed JSON file(s) and `data/index.json` to `sergiiiavt/air-stat` on `main`.

Use a commit message like:

`data: update researched incidents for 2026-09-18`

Do not modify application code during scheduled research runs.
