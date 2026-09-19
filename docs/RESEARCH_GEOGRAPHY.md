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

For daily and historical research:

1. Cover Kyiv City and all Kyiv Oblast sources normally.
2. Additionally sweep every settlement in the 50 km ring.
3. Search the settlement name together with the relevant date/date range and attack-consequence terms.
4. Also search by hromada and raion because official sources often publish only that level.
5. Follow aggregator/search results to the underlying source before treating a claim as evidence.
6. If later official reporting becomes more specific, upgrade an existing broad incident instead of creating a duplicate.

Useful Ukrainian consequence terms include:

- `атака`, `обстріл`, `БпЛА`, `дрон`, `ракета`, `балістика`;
- `влучання`, `уламки`, `падіння уламків`;
- `пошкоджено`, `зруйновано`, `пожежа`;
- `постраждав`, `поранено`, `загинув`.

## Map safety

Settlement coordinates are research/navigation metadata, not strike coordinates.

When a source reports only a settlement, publish a sanitized `settlement-centroid`/area representation. Never convert a settlement search hit into an exact strike point. More precise public map locations still follow `docs/MAP_LOCATION_POLICY.md`.
