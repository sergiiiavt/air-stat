# Research data

Daily AI-researched attack/consequence records live under `data/YYYY/MM/YYYY-MM-DD.json`. Every published file must be listed in `data/index.json` and validate against `schema/daily-research.schema.json`.

Do not store exact recent strike or air-defence coordinates. Public map coordinates must follow `docs/MAP_LOCATION_POLICY.md`: city/oblast-only records are not plotted, while district/raion or more specific locations use sanitized centroids or generalized historical-safe locations.
