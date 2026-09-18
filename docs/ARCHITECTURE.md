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
official APIs / public sources
        |
        v
scheduled collectors
        |
        v
raw source_items
        |
        v
normalization + validation
        |
        +--> alert_events
        +--> incidents
        +--> incident_updates
        |
        v
derived daily_stats / API responses
```

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

Returns map-eligible administrative-area features or generalized markers for incidents supported to at least district/raion precision. City-only and oblast-only incidents remain in statistics but are omitted from map points and heatmaps. Do not return precise recent strike coordinates.

## Data integrity principles

- Raw source evidence is immutable.
- Normalized facts point back to source items.
- Consequence updates are append-only history with one current value.
- Daily aggregates are derived and rebuildable.
- Kyiv calendar dates are computed using the `Europe/Kyiv` timezone during ingestion.
- The public map is statistical/historical, not a live tactical tracker.
