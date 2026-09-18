# Map location precision policy

Air Alert Stat separates evidence precision from public-map precision.

## Principles

1. Never claim more precision than the source supports.
2. Preserve a source-derived location description separately from the coordinates used on the public map.
3. Recent and sensitive incidents are generalized even when an official source publishes a more specific location.
4. Exact recent strike points, air-defence positions, military sites, critical-infrastructure targets, trajectories, and private apartment/unit identifiers are never published.

## Precision ladder

| Source evidence | Public map precision | Typical radius |
|---|---|---:|
| Kyiv / Kyiv Oblast only | not shown as a map point or heatmap input | n/a |
| District / raion | district/raion centroid | 1–5 km |
| Hromada / settlement | hromada/settlement centroid | 0.5–2 km |
| Neighborhood | neighborhood centroid | 0.3–1 km |
| Street | street segment | 0.25–0.75 km |
| Exact official civilian address, <30 days | generalized address area | 0.25–0.5 km |
| Exact official civilian address, >=30 days and non-sensitive | address point may be used | 0–50 m |

## Data fields

Research JSON uses two separate objects:

- `area.sourceLocation`: what an evidence source actually reported;
- `area.map`: the sanitized public-map representation.

The public map must use `area.map`, never geocode `sourceLocation.text` directly in the browser.

## Public map eligibility

An incident is eligible for a dot, area marker, or heatmap input only when its supported map precision is at least district/raion level. The allowed public-map precision classes are:

- `district-centroid`;
- `raion-centroid`;
- `hromada-centroid`;
- `settlement-centroid`;
- `neighborhood-centroid`;
- `street-segment`;
- `address-generalized`;
- `address-point` when historical/non-sensitive rules allow it.

`city-centroid` and `oblast-centroid` records remain valid for statistics, incident lists, and provenance, but they are excluded from map markers and heatmaps. A generic city-center or oblast-center coordinate must never be presented as though it identifies an incident location.

## Recent address handling

When an official source publishes a specific address for an incident less than 30 days old:

- retain only a safely redacted description in research data;
- remove apartment/unit identifiers;
- remove building number when necessary to avoid pinpointing the impact;
- set `redacted: true`;
- use `street-segment` or `address-generalized`;
- use `displayMode: "area"`;
- use a 250–500 m display radius.

## Historical exact points

`address-point` is allowed only when the event is at least 30 days old and all of the following are true:

- the location was already publicly disclosed by an authoritative source;
- it is a civilian, non-sensitive site;
- it does not identify military, air-defence or critical infrastructure;
- publication is useful for historical/statistical analysis.

If any condition is uncertain, keep the generalized representation.

## UI

For map-eligible incidents, the map displays a precision cue around incident markers. The ring indicates uncertainty/generalization; it is not survey-grade geometry.

Incident details show:

- source-reported location text when present;
- whether the text was redacted;
- map precision class;
- approximate display radius.

This makes uncertainty explicit instead of presenting a centroid as an exact impact coordinate.
