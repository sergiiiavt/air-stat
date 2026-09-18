# Data source strategy

The application should keep two data streams separate:

1. **Alert state/timing** — when an air-raid alert started and ended and which threat types were publicly reported.
2. **Consequences** — official post-event reports about casualties, damage, debris, fires, rescue work, and affected administrative areas.

## Tier 1 — alert timing / threat state

- **alerts.in.ua API** — primary machine-readable alert state. Persist state changes locally so long-term history does not depend on a third-party history window.
- **Air Force of the Armed Forces of Ukraine** — public threat classification and context such as UAV, ballistic, cruise-missile, or aviation threat.
- **KMVA / KMDA** — Kyiv City alert and consequence context.
- **Kyiv Oblast Military Administration (KOVA)** — Kyiv Oblast alert and consequence context.

## Tier 1 — consequences

- Kyiv City portal / KMDA / KMVA
- Kyiv Oblast Military Administration
- State Emergency Service (DSNS), including Kyiv-region channels/pages
- National Police: Kyiv City and Kyiv Oblast
- Kyiv City health authorities when they publish casualty updates

## Tier 2 — cross-check / discovery

- Suspilne
- Reuters
- Associated Press
- Other reputable media when an official report is not yet available

Tier 2 sources may trigger review or fill context, but official Ukrainian sources should be preferred for published casualty and damage totals when available.

## Normalization rules

- Store each fetched source item with URL, source, publish time, fetch time, body text, and content hash.
- Version consequence numbers instead of silently overwriting them.
- Display an **as of** timestamp for casualty and damage totals.
- Retain older official values for auditability.
- Tag extracted values as `provisional`, `confirmed`, or `final`.
- Do not infer “no strike” from silence. Use **no confirmed impact reported**.
- Do not publish exact recent strike or air-defence coordinates. Aggregate to district, raion, or hromada geometry.
- Store `local_date` using the `Europe/Kyiv` timezone at ingestion time; do not hard-code UTC offsets because daylight-saving time changes them.

## Suggested polling

- Machine-readable alert state: approximately once per minute, subject to provider limits and caching.
- Public threat channels: every few minutes during active alerts, less frequently otherwise.
- Consequence sources: more frequently for the first hours after a reported incident, then taper as official reports stabilize.

Exact polling intervals must respect each provider's documented limits and terms.

## Extraction pipeline

`fetch -> raw source_item -> relevance classification -> structured candidate -> schema validation -> deduplication/merge -> publish`

An LLM can assist with extracting fields from narrative reports, but every published number must retain provenance to the exact source item that supplied it.
