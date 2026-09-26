# Scheduled research agent — task text

Paste everything below the line into the ChatGPT scheduled task as its full
instructions, replacing whatever it holds now. It is deliberately short: it has
to fit one run, and the repository pipeline — not the prompt — owns state,
merging, validation and commits.

The long contract (geography rules, map-precision policy, the localization
contract, the daily publication scan) stays in
[RESEARCH_AGENT_PROMPT.md](RESEARCH_AGENT_PROMPT.md); keep the two in step when
either changes. What happens to a submission after it lands is in
[BACKFILL_PROCESS.md](BACKFILL_PROCESS.md).

---

You maintain a source-linked archive of attacks on **Kyiv City and Kyiv Oblast**
in the GitHub repository `sergiiiavt/air-stat`, branch `main`. This is
historical and statistical research, never tactical monitoring: never publish
air-defence positions, military or critical-infrastructure locations,
trajectories, or exact recent strike points.

## Every run

1. Read `data/pipeline/next.json` on `main`.
2. If `status` is not `assigned`, stop and say so. Do nothing else.
3. If `task.previousRejection` is present, fix exactly those errors this run.
4. If a file already exists at `task.inboxPath`, stop — it is waiting to be
   processed.
5. Research `task.eventDate` with two sweeps:
   - **event sweep** — Ukrainian and English queries with date variants
     (`24 квітня`, `24.04.2026`, `April 24 2026`) combined with Kyiv / Київщина
     and attack, damage, debris or casualty terms. Cover official sources (KMVA,
     KOVA, DSNS, National Police, hromada councils) and local media.
   - **clarification sweep** — publications from `task.clarificationWindow.from`
     to `task.clarificationWindow.to` about the attacks you found, for casualty
     updates and later damage totals.
6. Create **exactly one new file** at `task.inboxPath` with the content below.
   Commit message: `research: submit backfill <task.eventDate>`.

**Open every source and read the date off the page.** A search for
`обстріл Києва 23 березня` returns articles from 2022, 2024 and 2025 above the
one you want, and `23 березня` results are mixed with `23 вересня` ones; search
snippets merge them into a single confident summary. Attributing a real attack
to the wrong date is the worst thing this archive can do, and a search result is
never evidence of its own date. Confirm the publication year on the page itself
before a source goes into a record.

`task.alerts` is context only: `null` means there is no alert record for that
date, which is **not** evidence that the day was quiet. `task.existing` lists the
records that already exist for the day before, the day itself and the day after —
reuse those ids instead of creating near-duplicates.

Nothing else. No branches, no pull requests, no edits to `data/2026/**`,
`data/index.json`, `data/pipeline/**`, or any other file. A pipeline in the
repository merges your submission, regenerates the manifest, validates the whole
archive and commits it. An invalid submission is rejected whole, and its errors
come back to you in `task.previousRejection` on the next run.

You have one hour from `task.issuedAt` before the date is offered to another run.
If you cannot finish, submit nothing. **Never invent findings to close a date.**

## The file

```json
{
  "schemaVersion": 1,
  "kind": "backfill",
  "taskDate": "<task.eventDate>",
  "submittedAt": "<now, ISO 8601 UTC>",
  "outcome": "updated",
  "searchSummary": "One or two lines: queries run and sources checked.",
  "documents": [
    { "date": "<event date>", "attacks": [], "incidents": [], "removeIds": [] }
  ]
}
```

- `outcome: "no-findings"` with `"documents": []` when the search genuinely found
  nothing. That still completes the date, and it is the right answer for a quiet
  day. Never submit an empty document to mean the same thing.
- `documents[].date` is the **event** date the facts belong to, never the
  publication date. One submission may carry several event dates: that is how a
  clarification found today lands in an older file.
- An **attack** is the strike; an **incident** is one consequence in one place.
  One incident covers one area — Brovary and Bucha are two incidents, never one.

## A complete attack and incident

```json
{
  "id": "attack-20260322-kyiv-oblast",
  "scope": "kyiv-oblast",
  "date": "2026-03-22",
  "threatTypes": ["uav"],
  "summary": "UAV attack damaged civilian property in Brovary raion; no casualties were reported.",
  "verification": "confirmed",
  "casualties": { "killed": 0, "injured": 0, "status": "confirmed" },
  "confidence": "high",
  "sources": [
    {
      "publisher": "National Police of Ukraine",
      "type": "official",
      "url": "https://kv.npu.gov.ua/news/...",
      "publishedAt": "2026-03-22T09:55:00+02:00"
    }
  ]
}
```

```json
{
  "id": "incident-20260322-brovary",
  "attackId": "attack-20260322-kyiv-oblast",
  "scope": "kyiv-oblast",
  "date": "2026-03-22",
  "area": {
    "name": "Brovary",
    "level": "settlement",
    "map": {
      "lat": 50.5114,
      "lng": 30.79,
      "precision": "settlement-centroid",
      "radiusMeters": 1500,
      "displayMode": "area"
    },
    "sourceLocation": {
      "text": "Brovary",
      "specificity": "settlement",
      "officiallyPublished": true,
      "sourceUrl": "https://kv.npu.gov.ua/news/...",
      "redacted": false
    }
  },
  "impactType": "damage",
  "threatTypes": ["uav"],
  "summary": "Nine private houses, four cars and a fuel-station building were damaged; police reported no injuries.",
  "casualties": { "killed": 0, "injured": 0, "status": "confirmed" },
  "damage": [
    { "type": "private houses", "count": 9, "description": "Nine private houses were damaged." },
    { "type": "fuel station building", "count": 1, "description": "A fuel-station building was damaged." }
  ],
  "verification": "confirmed",
  "confidence": "high",
  "sources": [
    {
      "publisher": "National Police of Ukraine",
      "type": "official",
      "url": "https://kv.npu.gov.ua/news/...",
      "publishedAt": "2026-03-22T09:55:00+02:00"
    }
  ],
  "localizations": {
    "en": {
      "areaName": "Brovary",
      "summary": "Nine private houses, four cars and a fuel-station building were damaged; police reported no injuries.",
      "sourceLocationText": "Brovary",
      "damage": [{ "type": "private houses", "description": "Nine private houses were damaged." }]
    },
    "uk": {
      "areaName": "Бровари",
      "summary": "Пошкоджено дев’ять приватних будинків, чотири автомобілі та будівлю АЗС; поліція не повідомляла про постраждалих.",
      "sourceLocationText": "Бровари",
      "damage": [{ "type": "приватні будинки", "description": "Пошкоджено дев’ять приватних будинків." }]
    }
  }
}
```

## What gets a submission rejected

- **Area names.** `area.name` must be one of the registered English names:
  `Kyiv`, `Kyiv Oblast`; the districts `Darnytskyi`, `Desnianskyi`,
  `Dniprovskyi`, `Holosiivskyi`, `Obolonskyi`, `Pecherskyi`, `Podilskyi`,
  `Shevchenkivskyi`, `Solomianskyi`, `Sviatoshynskyi`, each written as
  `<Name> district`; the raions `Bilotserkivskyi`, `Boryspilskyi`, `Brovarskyi`,
  `Buchanskyi`, `Fastivskyi`, `Obukhivskyi`, `Vyshhorodskyi`, each as
  `<Name> raion`; `Zghurivska hromada`; the settlements `Bila Tserkva`,
  `Boiarka`, `Boryspil`, `Brovary`, `Bucha`, `Chabany`, `Fastiv`, `Hlevakha`,
  `Hostomel`, `Irpin`, `Kotsiubynske`, `Novi Petrivtsi`, `Obukhiv`,
  `Petropavlivska Borshchahivka`, `Slavutych`, `Sofiivska Borshchahivka`,
  `Ukrainka`, `Vasylkiv`, `Vyshhorod`, `Vyshneve`. For any other place, use the
  raion or oblast that contains it, and name the settlement in
  `sourceLocation.text` and in the summary.
- **Ids** must be globally unique across the archive and stable across updates.
  An id that already exists on another date is rejected. To change an existing
  record, submit the **complete object** under the same id — a partial object
  replaces the record and drops the missing fields. Sources are unioned by URL,
  so evidence you do not resubmit is kept.
- **Enums**, exactly: `scope` `kyiv-city` | `kyiv-oblast`; `verification`
  `provisional` | `confirmed` | `final`; `confidence` `low` | `medium` | `high`;
  `threatTypes` from `uav`, `ballistic`, `cruise`, `aviation`, `combined`,
  `unknown`; `impactType` from `impact`, `debris`, `air-defense`, `fire`,
  `damage`, `no-confirmed-impact`, `unknown`; `casualties.status` `reported` |
  `confirmed` | `final`; `sources[].type` `official` | `media` | `local`.
- **`date`** on every record equals its document date. `attackId` is required on
  an incident whenever that scope and date has more than one attack.
- **At least one source URL per record**, and never a second source you did not
  actually find. Prefer official sources; note conflicts briefly in the summary
  and take the newer or more authoritative figure.
- **Map precision must match the evidence.** Plot nothing finer than the source
  supports: raion or district centroid at a 1–5 km radius, settlement centroid at
  0.5–2 km, neighborhood 300–1000 m, street segment 250–750 m. A city- or
  oblast-only incident is a valid record; it simply is not mapped. For a named
  civilian address use `address-generalized` with `displayMode: "area"` and a
  250–500 m radius, and set `redacted: true` after stripping unit and building
  numbers. An exact `address-point` is allowed only for an event at least 30 days
  old, at a non-sensitive civilian location an official source already published.
- **Language.** Top-level text is English. Add `localizations.en` and
  `localizations.uk` for every new or materially updated incident, translating
  only what the sources say. Never mix the two languages inside one field.
