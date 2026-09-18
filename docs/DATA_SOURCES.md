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
- alerts.in.ua: approximately once per minute when a token exists, subject to provider limits.
- Consequence sources: more frequently immediately after a reported incident, then taper as official reports stabilize.

## Extraction pipeline

`fetch -> raw/evidenced source -> normalize -> validate -> deduplicate -> publish`

LLM-assisted extraction may be used for narrative consequence reports, but every published number must retain provenance to the exact source item that supplied it.
