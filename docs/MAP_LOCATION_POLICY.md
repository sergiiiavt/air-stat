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
| Kyiv / Kyiv Oblast only | keep in statistics/list; do not plot an incident point or heat input | — |
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

City- and oblast-only incidents are not rendered as map indicators and do not contribute to the heatmap. Point/heatmap eligibility begins at district/raion precision and continues through hromada, settlement, neighborhood, street, and safely generalized/historical address precision. Broad incidents remain visible in statistics and incident lists.

The map displays a precision cue around eligible incident markers. The ring indicates uncertainty/generalization; it is not survey-grade geometry.

Incident details show:

- source-reported location text when a version for the selected UI locale is available; otherwise the localized canonical administrative area is shown instead of leaking text from the other locale;
- whether the underlying source location was redacted;
- localized map-precision wording;
- approximate display radius.

This makes both uncertainty and language boundaries explicit instead of presenting a centroid as an exact impact coordinate or mixing English/Ukrainian narrative text.
