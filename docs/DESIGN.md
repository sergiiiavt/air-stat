# Interface design

Air Alert Stat is a historical data tool. The visual hierarchy should help readers choose a period, understand totals, and inspect source-linked incidents.

## Design review — September 2026

| Finding | Change |
| --- | --- |
| Dates, sources, legends and descriptions were frequently 7–10 px | System font; 14–15 px body text, 12–13 px supporting text, 11 px minimum for dense chart/calendar labels |
| Uppercase labels, repeated headings, icons and nested cards gave every item similar emphasis | Sentence-case headings, flat metric groups and list dividers; remove decorative labels and redundant icons |
| The full area list pushed incidents far below the first screen | Expandable area picker; incident list is immediately below the period summary |
| Active geographic filtering was difficult to understand and clear | Show the selected area/date beside a reset action; retain the canonical scope-aware selection contract |
| Theme colors were duplicated across component overrides, with pale text on light surfaces | One semantic palette shared by dashboard, charts, details and progress |
| Chart text became tiny as fixed SVG coordinates were scaled | Measure the rendered SVG width and keep chart coordinates and text at readable sizes |
| The publication calendar repeated tiny status labels in every cell | Month grids with weekday headings, visible day numbers and accessible status text |
| Root overflow rules prevented the long progress page from scrolling on desktop | Constrain the dashboard itself to the viewport; leave the progress document scrollable |
| A WebGL initialization failure unmounted the whole dashboard | Isolate map startup failure; keep data and area filtering available and offer the daily view |

## Visual rules

- Use the operating system's sans-serif font. No external font requests.
- Keep the restrained amber accent for selection and alert charts. Use consequence/status colors only when they communicate data.
- Use solid surfaces, simple separators and small corner radii. Gradients are reserved for the heatmap scale.
- Navigation uses an underline; geographic and period controls retain clear pressed states.
- Keep source links, verification, confidence and location precision available in incident details.
- Place methodology and archive metadata behind native, keyboard-accessible disclosure controls.
- Keep data-collection internals out of the main dashboard. Link to `/progress` from the header at every screen size.
- Honor the saved locale/theme and the existing Ukrainian/90-day first-visit default.

## Responsive behavior

Desktop keeps the map/chart beside an independently scrollable incident panel. Phones place the visualization above the incident list and allow normal document scrolling. Dense daily charts scroll horizontally instead of reducing text to fit an entire month. Trend charts resize to their actual container width.

The progress page uses three, two or one calendar columns according to available width. Both themes use the same spacing, type scale and interaction states.

## Verification

For interface changes, check Map, By day, Trends, incident drill-down and `/progress` in both locales and themes. Check keyboard focus, selected-area counts/reset, date presets, calendar scrolling, narrow layouts, and the map-unavailable fallback. Run the validation/build/deployment checks listed in the README.

No research facts, casualty calculations, map-location eligibility, aggregation identity or alert calculations change as part of this visual revision.
