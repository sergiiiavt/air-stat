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

Primary no-key source for current and recent historical Kyiv Oblast alerts:

- Official Telegram: `@kyivoda`.
- The parser ingests both whole-oblast messages and alert/all-clear messages for the seven Kyiv Oblast raions.
- Each raion interval is preserved with its administrative area for provenance.
- Daily Kyiv Oblast alert statistics are calculated from the **union** of overlapping intervals, so simultaneous alerts in several raions do not multiply alert duration or count.
- The Worker paginates the public KOVA Telegram search archive and reconstructs roughly six months of intervals.
- Pagination is resumable: at most 8 pages are fetched per cron execution, raw posts are staged in D1, and the next `before` cursor is checkpointed after every page.
- After the cutoff is reached, staged posts are parsed chronologically and rebuilt into interval data.
- The bootstrap state is versioned. Parser/aggregation changes can intentionally trigger a new idempotent history rebuild instead of being blocked by an old “completed” flag.
- `GET /api/status` exposes the current history phase/cursor counters under `kovaHistory`.

## Optional enrichment when access is granted

### alerts.in.ua

When `ALERTS_API_TOKEN` is available, alerts.in.ua is used as an independent additional source for:

- threat classification;
- cross-checking current alert state;
- partial Kyiv Oblast alerts where `location_oblast_uid=14`;
- recent history reconciliation.

The active endpoint is polled with the minute collectors. The one-month regional history endpoint is reconciled by the daily collectors. alerts.in.ua rows are tagged with their own `source_key`; closing an alerts.in.ua interval cannot close an open KOVA/Kyiv Digital interval.

Overlapping alerts.in.ua/KOVA/raion intervals are kept as raw evidence and unioned only in derived daily statistics.

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

Historical discovery is deliberately broader than the source-of-record list. The research process may additionally use:

- Google News/search/RSS-style indexes;
- GDELT when its historical window is useful;
- reputable Kyiv/oblast local media;
- public local Telegram/neighborhood sources as candidate leads;
- alerts.in.ua as alert/geography context.

Aggregation/search pages are discovery mechanisms, not factual sources of record. The stored evidence should point to the underlying official or media article whenever possible. Local/social-only claims remain provisional/low-confidence unless corroborated.

For the 50 km priority ring, discovery searches by settlement **and** by hromada/raion. Broad “Kyiv Oblast” searches do not replace settlement-level discovery. See `docs/RESEARCH_GEOGRAPHY.md`.

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
- KOVA public channel: polled frequently for whole-oblast and raion alert/all-clear posts, with a versioned recent-history bootstrap.
- alerts.in.ua active state: approximately once per minute when a token exists, subject to provider limits.
- alerts.in.ua one-month history: reconciled daily when a token exists, subject to provider limits.
- Consequence sources: more frequently immediately after a reported incident, then taper as official reports stabilize.

## Extraction pipeline

`fetch -> raw/evidenced source -> normalize -> validate -> deduplicate -> publish`

LLM-assisted extraction may be used for narrative consequence reports, but every published number must retain provenance to the exact source item that supplied it.
