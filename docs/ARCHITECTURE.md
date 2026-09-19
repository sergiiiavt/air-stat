# Architecture

## MVP request flow

```text
React / MapLibre frontend
        |
        v
Cloudflare Worker API
        |
        +--> D1: normalized alerts, incidents, updates, sources
        |
        +--> R2 (optional): raw source snapshots / larger artifacts
```

## Ingestion flow

```text
ALERT TIMING                         INCIDENTS / CONSEQUENCES
structured alert sources            today's newly published news/sources
        |                                      |
        v                                      v
Kyiv Digital / KOVA current /        discovery + article reading
alerts.in.ua when configured                  |
        |                                      v
        v                              resolve original event date
alert_events                                  |
        |                                      v
        |                              event-date research JSON
        |                                      |
        +------------------+-------------------+
                           v
                    D1 / derived APIs
```

News research is the primary incident/consequence pipeline. Alert feeds are a separate supporting stream for alert-duration/count analytics.

## Initial API shape

### GET /api/days?scope=kyiv-city&from=YYYY-MM-DD&to=YYYY-MM-DD

Returns compact day rows for the left panel:

- date
- alert count
- total alert seconds
- threat types
- incident count
- killed / injured
- affected areas
- short consequence summary

### GET /api/days/:date?scope=kyiv-city

Returns detailed alert windows, incidents, current consequence values, update timestamps, and source references.

### GET /api/map?date=YYYY-MM-DD&scope=kyiv-city

Returns only map-eligible generalized locations supported to district/raion precision or better. City/oblast-only records remain in statistics but are excluded from public map points and heatmaps. The range response also returns broad incidents with null public coordinates so future visualizations cannot accidentally treat a city/oblast centroid as an incident point. Do not return precise recent strike coordinates.

## UI hierarchy

The React shell separates controls by scope:

- the top header owns global visualization mode: Map, Daily timeline, or Trends;
- the shared filter bar owns geography and date range;
- the map surface contains only map-specific controls such as dots/heatmap mode;
- the left detail panel is retained for Map and Daily timeline drill-downs;
- Trends uses the full visualization width because it operates on the complete selected period;
- the header also owns the persistent light/dark theme toggle;
- theme choice is bootstrapped in `index.html` before the React bundle renders, then managed by React and persisted in `localStorage`;
- the MapLibre raster layer adjusts brightness/saturation with the UI theme so the map and surrounding controls remain visually consistent.

This avoids presenting non-map analytics as controls layered on top of the map.

## Daily timeline rendering

The React client derives the daily timeline from `GET /api/range`:

- daily rows are aggregated by date when `scope=both`;
- the full inclusive calendar range is generated client-side so days without alerts/incidents remain visible as zeroes;
- bar height represents total alert seconds;
- alert count is shown independently of duration;
- researched incidents provide separate impact/damage, injury and fatality indicators;
- all displayed months share the same duration scale.

No synthetic destruction score is stored or calculated.


## Trends rendering

The React client also derives the comparative trends view from `GET /api/range`:

- daily rows are aggregated by calendar date when `scope=both`;
- the inclusive date range is filled with zero-alert days before any trend calculation;
- total alert time, alert count, average duration per alert, and alert-active-day share are compared across equal-length early/recent windows;
- an odd middle day stays in the line series but is excluded from the equal-window comparison;
- the visible direction line uses a trailing 1-, 3-, or 7-day moving average depending on the selected range length, while raw daily values remain visible;
- no composite danger, destruction, or severity score is calculated.

## Data integrity principles

- Raw source evidence is immutable.
- Normalized facts point back to source items.
- Consequence updates are append-only history with one current value.
- Daily aggregates are derived and rebuildable.
- Alert timing aggregates merge overlapping intervals across raions and sources before counting periods/duration; raw source intervals remain preserved.
- Research incident area has one canonical meaning. The importer writes `area.name` consistently and public APIs prefer the canonical research location when legacy columns disagree.
- Attack-level casualties are authoritative for overall date/scope totals when an attack record exists. Incident casualties are area-attributed detail and are used as the overall fallback only when there is no attack record for that date/scope.
- Incident-to-attack linkage is inferred only when exactly one attack matches the same date/scope; ambiguous links must be explicit.
- One area-specific incident must not combine consequences from multiple distinct districts/raions.
- Kyiv calendar dates are computed using the `Europe/Kyiv` timezone during ingestion.
- The public map is statistical/historical, not a live tactical tracker.


## Map rendering

The MapLibre canvas is resized with its container through `ResizeObserver`. This is required because the desktop layout keeps the map fixed while the left panel scrolls independently; a container-size change without `map.resize()` can stretch the WebGL canvas and visually corrupt raster tiles.


## Historical reconciliation controller

Historical incident reconstruction replays **publication dates**, not event dates.

```text
data/backfill/queue.json
        |
        +--> claim publication date P
        |
        v
find sources published on P
        |
        v
for each source: resolve original event date E
        |
        +--> create/update data/E.json
        +--> deduplicate / preserve source publishedAt
        |
        v
validate affected files + index + queue
        |
        v
checkpoint P
```

A later publication can therefore update an earlier event naturally. One publication date may touch several event dates or none.

Queue completion measures publication-replay coverage. Archive files measure stored event data. These are intentionally different metrics.

The 50 km settlement catalogue at `data/reference/kyiv-50km-settlements.json` is an optional discovery aid; it does not require hundreds of searches for every publication day.

## KOVA scope

KOVA remains a supporting source for current/recent Kyiv Oblast alert-state messages. It is not the core source for attack incidents/consequences, and public Telegram archive pagination is not relied on as the authoritative six-month historical incident or alert-timing backfill.
