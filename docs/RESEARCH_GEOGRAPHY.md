# Research geography

Air Alert Stat covers all of Kyiv City and Kyiv Oblast. The 50 km ring around central Kyiv is an **exhaustive high-priority research zone**, not a replacement for oblast-wide coverage.

## 50 km reference ring

Reference point:

- Maidan Nezalezhnosti, Kyiv
- latitude: `50.4503`
- longitude: `30.5234`
- distance: straight-line Haversine distance
- inclusion rule: settlement representative coordinate <= `50.0 km`

Do not maintain this zone as a hand-written city whitelist. It must include every settlement type represented by the administrative/geographic source, including cities, towns, urban-type settlements where present, villages and small settlements.

Examples that must not be missed include:

- Bucha;
- Irpin;
- Hostomel;
- Vorzel;
- Kotsiubynske;
- Vyshneve;
- Kriukivshchyna;
- Myla;
- Dmytrivka;
- Bilohorodka;
- Brovary;
- Boryspil;
- Vyshhorod;
- Boyarka;
- Vasylkiv;
- Ukrainka;
- Obukhiv;
- Kozyn.

The examples above are regression checks only. They are **not** the complete list.

## Administrative names and coordinates

Use current KATOTTG administrative naming as the identity baseline. Coordinates may be enriched from OpenStreetMap or another open geodata source.

A practical open-data source is `bnotezz/ua-settlements`, which combines KATOTTG, OSM, Wikidata and decentralization data and exposes settlement coordinates. Another useful geometry source is `darmat1/ukraine-geo-data`.

For a generated settlement catalogue, retain at least:

- current Ukrainian settlement name;
- settlement type;
- KATOTTG code when available;
- hromada;
- raion;
- representative latitude/longitude;
- calculated distance from the reference point;
- aliases/old names when available.

Same-name settlements must be disambiguated by hromada/raion or KATOTTG identifier.

## Research use

For daily and historical publication-day research:

1. Start with broad Kyiv City / Kyiv Oblast news and official-source discovery for the publication date being processed.
2. Use settlement, hromada and raion searches when broad results, source context, or a known local report indicates that geography needs deeper checking.
3. Use the 50 km catalogue as a discovery/reference aid and regression set, not as a requirement to launch a separate deep search for every settlement on every publication day.
4. Follow aggregator/search results to the underlying source before treating a claim as evidence.
5. Determine the original event date described by each publication; later clarifications update the older event record.
6. If later reporting becomes more specific, upgrade the existing broad incident instead of creating a duplicate.

Useful Ukrainian consequence terms include:

- `атака`, `обстріл`, `БпЛА`, `дрон`, `ракета`, `балістика`;
- `влучання`, `уламки`, `падіння уламків`;
- `пошкоджено`, `зруйновано`, `пожежа`;
- `постраждав`, `поранено`, `загинув`.

## Map safety

Settlement coordinates are research/navigation metadata, not strike coordinates.

When a source reports only a settlement, publish a sanitized `settlement-centroid`/area representation. Never convert a settlement search hit into an exact strike point. More precise public map locations still follow `docs/MAP_LOCATION_POLICY.md`.
