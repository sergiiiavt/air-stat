# Data source strategy

The application keeps alert timing and consequences as separate evidence streams.

## Primary sources available without private API approval

### Kyiv City — Kyiv Open Data / Kyiv Digital

Primary timing source:

- Dataset: **Статистика повітряних тривог у місті Києві**
- Publisher: Kyiv Department of Municipal Security
- Backed by the Kyiv Digital platform
- Public `airAlertHistory` resource provides alert state events
- `state=1` means alert start
- `state=0` means all-clear
- `cause` can describe threat level/type such as `missile`, `massive-drone`, or `drone`
- `created_at` is the event timestamp
- The official dataset covers Kyiv alert history back to 2022

Air Stat uses the public Kyiv Digital endpoints `GET https://kyiv.digital/open-api/air-alert/state` once per minute and `GET https://kyiv.digital/open-api/air-alert/history` for bootstrap/daily reconciliation. Both are requested as JSON. Start/all-clear state transitions are converted into alert intervals with `Europe/Kyiv` timezone handling.

### Kyiv Oblast — Kyiv Oblast Military Administration

Primary no-key source for current oblast alerts:

- Official Telegram: `@kyivoda`
- Whole-oblast alert messages are ingested as start/all-clear intervals.
- District-level alerts are planned as the next step, but must use interval-union aggregation before they contribute to oblast totals; naive summation would double-count overlapping district alerts.

## Optional enrichment when access is granted

### alerts.in.ua

When `ALERTS_API_TOKEN` is available, alerts.in.ua is used as an additional source for:

- threat classification;
- cross-checking current alert state;
- recent history reconciliation.

The Worker polls the active endpoint in the minute collector and the provider's `month_ago` history endpoint in the daily reconciliation job. The provider exposes oblast/raion/hromada UIDs, but child-area intervals must not be naively summed into oblast totals because overlapping alerts would double-count time.

It is not required for the website to function.

## Consequence sources

Use official Ukrainian sources as the source of record where available:

- KMVA / KMDA
- Kyiv Oblast Military Administration
- State Emergency Service (DSNS)
- National Police: Kyiv City and Kyiv Oblast
- Kyiv health authorities when they publish casualty updates
- Air Force of the Armed Forces of Ukraine for public threat context

Secondary media such as Suspilne, Reuters, and AP may be used for discovery/cross-checking but should not silently override official casualty or damage figures.

### Aggregation and discovery sources

A fixed official-source list is not sufficient for exhaustive historical discovery. The research agent may additionally use:

- Google News search/RSS or comparable news indexes to surface local reporting;
- GDELT article search where the requested date is inside the API's supported historical window;
- alerts.in.ua as alert-context/region discovery;
- reputable local Kyiv/oblast media and municipal reporting;
- public local Telegram/neighborhood channels as leads.

Rules:

- aggregation/search pages are **not** treated as the factual source of record;
- follow results to the underlying official/media article and store that URL;
- use local/social-only claims as provisional leads unless corroborated;
- later official clarification may update an older incident;
- source diversity is audited with `npm run audit:data`.

The six-month backfill must search by date **and** by geography. In the 50 km priority ring, every settlement described by `docs/RESEARCH_GEOGRAPHY.md` is part of the discovery sweep; broad searches for “Kyiv Oblast” do not replace settlement/hromada searches.

## Normalization rules

- Store source provenance for every normalized alert/incident.
- Version consequence numbers instead of silently overwriting them.
- Display an **as of** timestamp for casualty and damage totals.
- Retain older official values for auditability.
- Tag consequence values as `provisional`, `confirmed`, or `final`.
- Do not infer “no strike” from silence. Use **no confirmed impact reported**.
- Do not publish exact recent strike or air-defence coordinates. Aggregate to district, raion, or hromada geometry.
- Store Kyiv calendar dates using the `Europe/Kyiv` timezone; never hard-code UTC offsets.

## Collection cadence

- Kyiv Open Data history/state: polled by the Worker collector.
- KOVA public channel: polled frequently for new whole-oblast alert/all-clear posts.
- alerts.in.ua active state: approximately once per minute when a token exists, subject to provider limits.
- alerts.in.ua one-month history reconciliation: daily when a token exists, subject to the provider's history limit.
- Consequence sources: more frequently immediately after a reported incident, then taper as official reports stabilize.

## Extraction pipeline

`fetch -> raw/evidenced source -> normalize -> validate -> deduplicate -> publish`

LLM-assisted extraction may be used for narrative consequence reports, but every published number must retain provenance to the exact source item that supplied it.
