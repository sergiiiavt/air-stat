# AirAlert Kyiv — MVP starter

Single-page prototype for historical air-raid alert and consequence statistics for Kyiv City / Kyiv Oblast. The bundled records are explicitly mock data for UI development, not factual event reporting.

## UX model

1. **Left panel — Days**: date, number of alert windows, total alert duration, short consequence summary.
2. **Second panel — Day details**: every alert window with threat type, then consequence/incidents with casualty and damage data.
3. **Right — Map**: visual incidents. Prototype intentionally uses district/community centroids rather than exact strike coordinates.
4. **Scope switch**: Kyiv City / Kyiv Oblast.

## Run

```bash
npm install
npm run dev
```

## Proposed production stack

- Frontend: React + TypeScript + Vite
- Map: MapLibre GL + GeoJSON administrative boundaries
- API/ingestion: Cloudflare Workers
- Database: Cloudflare D1 (SQLite)
- Scheduled ingestion: Cloudflare Cron Triggers; optionally a separate scraper for sources that are unreliable from Workers
- Raw-source archive: R2 or D1 text snapshots

## Core production tables

- `alert_events`: source alert start/end, DST-safe Europe/Kyiv `local_date`, and threat metadata
- `incidents`: consequence event / affected administrative area
- `incident_updates`: changing casualty and damage reports over time
- `sources`: canonical source catalog
- `source_items`: every fetched article/post with raw text, publish time and hash
- `incident_sources`: many-to-many evidence links
- `daily_stats`: derived cache/view, reproducible from raw events

Never make `daily_stats` the source of truth.

## Important publishing rule

Do not display live or precise strike / air-defence coordinates. Store and publish district/community-level geometry for current/recent incidents and only data that official sources have already made public. This site should be historical/statistical, not a tactical tracker.

## Next implementation steps

1. Replace mock data with D1-backed API responses.
2. Add `/api/days`, `/api/days/:date`, and `/api/map`.
3. Add alerts.in.ua ingestion and persist alert history locally.
4. Add official consequence-source ingestion and normalized extraction.
5. Add confidence / verification workflow and source citations.
6. Load Kyiv district + Kyiv Oblast community GeoJSON and implement choropleth layers.
7. Add aggregate statistics and filtering.
