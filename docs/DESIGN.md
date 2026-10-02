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
| Wide timelines and progress tables forced horizontal scrolling on phones | Reflow daily data into width-bound grids, stack 24-hour labels above full-width lanes, and reshape the progress table into a compact mobile grid |
| A WebGL initialization failure unmounted the whole dashboard | Isolate map startup failure; keep data and area filtering available and offer the daily view |

## Visual rules

- Use the operating system's sans-serif font. No external font requests.
- Keep the restrained amber accent for selection and non-severity alert charts. The 24-hour alert windows use the semantic danger red until the data model exposes a verified alert severity that can support a factual yellow/red distinction.
- Use consequence/status colors only when they communicate data.
- Use solid surfaces, simple separators and small corner radii. Avoid decorative gradients.
- The Kyiv map uses a restrained but clearly visible administrative fill and outline for district boundaries so aggregate marker numbers have geographic context without competing with incident markers. Hovering a district increases its fill and outline emphasis locally; this is navigation context, not an incident/severity signal.
- Kyiv district geometry is a bundled same-origin GeoJSON asset. The administrative overlay must not depend on a third-party runtime request, so it remains available even when an external basemap or GIS host is unavailable.
- Navigation uses an underline; geographic and period controls retain clear pressed states.
- Keep source links, verification, confidence and location precision available in incident details.
- Place methodology and archive metadata behind native, keyboard-accessible disclosure controls.
- Keep data-collection internals out of the main dashboard. Link to `/progress` from the header at every screen size.
- Honor the saved locale/theme/view. First visit defaults to By day, Kyiv City and the latest 7 days.

## Responsive behavior

Desktop keeps the map/chart beside an independently scrollable incident panel. Phones place the visualization above the incident list and use normal document scrolling. On phones, the By day view reflows each month into a seven-column grid, the 24-hour view stacks scope labels above a full-width 00–24 lane, and trend charts fit the available container. These views must not require horizontal page or nested chart scrolling.

The progress page keeps its operational monitoring cards and historical summary responsive. Its six-field daily-processing table becomes a compact three-column mobile grid while retaining date, status, last run, attempts, findings and writes. Both themes use the same spacing, type scale and interaction states.

## Verification

For interface changes, check Map, By day, 24 hours, Trends, incident drill-down and `/progress` in both locales and themes. Check keyboard focus, selected-area counts/reset, date presets, seven-column calendar wrapping, 24-hour lane readability, the progress daily-processing grid, narrow layouts, the map-unavailable fallback, and the independent startup/recovery fallback. Confirm the document and each visualization have no unintended horizontal overflow at phone widths. For Kyiv City map changes, verify that district boundaries remain visible on both themes and that mouse hover emphasizes only the district under the pointer. Also verify the district overlay still loads when third-party GIS access is unavailable; the bundled GeoJSON must be validated in CI. Also verify that blocked or throwing browser storage does not prevent either page from rendering; preferences may fall back to defaults. Incident detail and summary rendering must tolerate legacy damage records, while the API normalizes them to the structured damage shape. Production smoke must also fetch the built root document and its linked JavaScript/CSS assets and validate incident damage items. Run the validation/build/deployment checks listed in the README.

No research facts, casualty calculations, map-location eligibility, aggregation identity or alert calculations change as part of this visual revision.
