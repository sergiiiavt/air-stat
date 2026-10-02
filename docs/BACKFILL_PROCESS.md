# Historical research pipeline

Production historical and daily incident research is Cloudflare-native. It does not depend on a ChatGPT scheduled task and it does not require a GitHub commit for every researched day.

```text
Cloudflare cron
  every minute -> check D1 throttle / active lease -> claim at most one historical event date
          -> scan official KODA + Kyiv City publication archives
          -> supplement with one GDELT query / Google News RSS fallback
          -> provider cooldown on throttling; transient failures requeue without burning retries
          -> fetch underlying publisher pages
          -> Workers AI structured extraction
          -> deterministic validation / normalization
          -> conservative D1 upsert + evidence links
          -> done / retry / needs_review

  recent -> minute cron, internally throttled to roughly hourly
          -> discover publications from the rolling seven-day Kyiv publication window
          -> determine original event date
          -> same persistence path

D1
  automated_research_days   campaign queue and durable state
  automated_research_runs   audit trail for every run
  sources / source_items    evidence
  attacks / incidents       normalized product data
```

## Campaign

The historical campaign covers event dates `2026-03-19` through `2026-09-19`.

Each row in `automated_research_days` is one date with one of these states:

- `pending` — not processed yet;
- `running` — leased by the current Worker invocation;
- `retry` — a previous attempt failed or its lease expired;
- `done` — research completed, including valid `no-findings` days;
- `needs_review` — automatic attempts were exhausted and the date requires explicit review.

Before selection, the Worker reconciles the queue against `research_files`. Any event date already represented by a validated/imported curated GitHub research file is marked `done` with its imported timestamp and is not researched again. Backfill selection then orders the remaining dates by attempt count first, prioritises dates that have an `alert_events` row, then by date. A missing alert row is not evidence that the day was quiet.

## Historical search

For event date E the Worker searches publications from E through E+14. The first part finds reports about the event itself; the later part captures casualty, damage and location clarifications that belong to the original event date.

Historical discovery starts with the official Kyiv Oblast (KODA) publication archive and official Kyiv City publications for the event-date-through-+14-day window. One bounded GDELT query is supplementary rather than a gate; Google News RSS is used as an additional fallback when official/index coverage is incomplete or candidate volume is low. A date may complete with no findings when at least one discovery provider completed successfully; one provider outage degrades source breadth instead of failing the whole run. A hard discovery failure is reserved for the case where every provider is unavailable. An HTTP 429 places GDELT in a shared cooldown so later dates do not repeat the same failing request pattern. Temporary discovery/network failures requeue the date without consuming its per-date retry budget. Candidates are balanced across sources, publisher hydration is bounded and timed out, and redirected discovery links are resolved to their publisher URL before evidence is stored.

The extraction model receives only code-selected candidates. It cannot invent a source URL: output references candidates by integer index and runtime validation rejects indexes outside that set.

## Recent/daily search

Recent incident research is driven by the minute cron and is internally throttled to roughly one successful pass per hour. Each pass re-scans a rolling seven-day publication window. The recent path is intentionally simple and news-first: direct Ukrainska Pravda RSS/daily archives and Suspilne Kyiv are primary; Google News RSS is used only when direct news coverage is thin; KODA/Kyiv City are supplementary confirmation; GDELT is not queried for recent collection. One healthy news source is sufficient to run, so failure of an unrelated provider cannot suppress otherwise usable evidence. The recent runner is single-flight across minute cron invocations and D1 enforces that invariant with a partial unique index. Evidence-matched automated incidents are updated in place only when the evidence signature is unambiguous; if one source supports multiple same-area/same-impact incidents, their stable incident identities stay separate. For Kyiv City, every explicitly mentioned district in a source is audited for a physical consequence before extraction finishes, preventing secondary districts from being silently omitted. Up to 36 candidates are balanced with direct media first and extracted in bounded AI batches. A failed attempt can retry after 2 minutes instead of suppressing the rest of the day. The rolling window still captures later casualty/damage clarifications for earlier event dates.

Each extracted finding has an original event date:

- same-day report -> current event date;
- later clarification -> older event date;
- repeated coverage of the same physical incident -> evidence is attached without creating a duplicate; separate physical incidents in the same district/raion and day keep separate stable identities.

A successful recent pass records its attempt/success timestamps in D1 but does not mark the publication day permanently complete; later passes can still discover newly published material.

## AI boundary

Workers AI performs narrow structured extraction. It is not trusted to choose storage identity, coordinates or source URLs.

Deterministic code owns:

- candidate source URLs;
- stable generated IDs for genuinely new records;
- date and scope constraints;
- canonical area normalization;
- public map centroids/precision;
- deduplication and ambiguous-match rejection;
- D1 writes;
- leases, retries and completion state.

The model owns only evidence-grounded extracted facts such as threat type, summary, explicitly reported casualties/damage and the reported administrative area.

## Casualties and unknown values

Silence is not zero.

- Attack casualties may be `{ "killed": null, "injured": null, "status": "unknown" }`.
- Incident casualties use the same unknown/null representation when the source does not explicitly provide an area-specific total or explicitly report zero casualties.
- Numeric zero is stored only when supported by the source.
- Attack aggregate queries exclude rows with `casualty_status = 'unknown'`.

## Conservative update policy

Existing curated/verified records are protected from weaker automated output.

- New records may be created when there is no matching existing event/scope/area record.
- New evidence is attached to an existing unique match.
- Casualties may upgrade from unknown to a source-supported known value.
- Summary/verification/confidence replacement normally requires at least official evidence and must not lower the existing verification/confidence level. A one-time migration of an old automated area/day row may replace its collapsed summary with rediscovered physical-incident detail; after that migration, normal conservative-update rules resume.
- Multiple existing candidates for the same automatic match are treated as ambiguous and skipped rather than guessed.

## Location safety

The automated model never returns public coordinates.

Coordinates are assigned only by deterministic coarse mappings for canonical Kyiv districts and Kyiv Oblast raions, with broad Kyiv/Kyiv Oblast fallbacks when no narrower public administrative area is stated. The automated path does not publish exact strike addresses, military locations, air-defence positions, trajectories or critical-infrastructure locations.

Curated/manual research may still use the stricter precision rules in `docs/MAP_LOCATION_POLICY.md` for historical-safe public locations.

## Reliability

Historical backfill piggybacks on the established minute Worker cron. D1 state throttles starts to at most one roughly every five minutes, so a missed individual scheduled event does not stall the campaign and the full six-month queue can drain within hours rather than days.

A claimed date receives a 20-minute lease. On a later invocation, an expired `running` row becomes `retry`. Non-transient processing failures increment `attempts`; after five such failures the date becomes `needs_review`, allowing the campaign to continue. Provider throttling and temporary network/discovery failures do not consume this retry budget and trigger a short shared backfill cooldown instead. Curated archive reconciliation also clears obsolete retry/review state for dates that have since been imported manually.

`automated_research_runs` records start/finish status and discovery/finding/write/ambiguity counts plus any error. This makes silent stalls visible without depending on the failing process to update a GitHub file.

## Progress API

`refreshNativeResearchStatus()` projects D1 state onto the established `researchBackfill` API shape. The Worker entry point additionally attaches a daily-analysis ledger derived from `automated_research_runs`.

- native state version: `4`;
- mode: `cloudflare-native-event-date`;
- `/api/status` and `/api/progress` use this state after migration 0014 exists;
- `/progress` consumes the same API contract but presents recent daily operational health as the primary view, with historical backfill reduced to a compact secondary summary;
- archive coverage is calculated from actual `attacks`/`incidents` event dates in D1 rather than only from imported GitHub JSON files;
- `researchBackfill.dailyDays` lists every Europe/Kyiv calendar date from the first recorded daily run through today, newest first;
- each daily row is evaluated against all recent runs whose rolling seven-day publication window includes that calendar date, not only runs whose `target_date` equals the row date;
- a row is `completed` once any covering run succeeds; otherwise it is `in_progress` while a covering run is active, `failed` when covering attempts exist but none succeeded, and `pending` when no covering attempt exists;
- a later successful rolling scan therefore clears a stale failure from an earlier same-date attempt instead of leaving a permanently red historical row;
- daily rows include covering attempt/success/failure counts and the timestamps/discovery/finding/write counts from the latest successful covering run when one exists.

The daily ledger answers whether that calendar date has been covered by at least one successful rolling recent-analysis scan. It is operational status, not proof that incident coverage for that day is complete.

## Legacy/manual inbox

`data/inbox/*.json`, `scripts/research-pipeline.mjs` and `.github/workflows/research-pipeline.yml` remain as an explicit manual correction path for the curated GitHub archive.

The legacy workflow runs only on:

- a push that creates/changes `data/inbox/**`;
- manual workflow dispatch.

It has no scheduled cron and is not the production backfill scheduler.

## Deployment/validation

Runtime changes follow the normal PR flow. CI must pass the repository validators, build and Cloudflare dry-run. On merge to `main`, the deploy job:

1. applies D1 migrations;
2. deploys Worker/static assets including the Workers AI binding and crons;
3. runs production smoke checks;
4. requires native research state version 4.

Production smoke verifies the deployed recent-research model, window and code revision plus recent collector activity. A newly deployed research revision may need a later cron invocation to complete its first successful scan; that asynchronous applied-revision state is surfaced as a warning and does not block an otherwise unrelated application deploy.

After every deploy, re-read the current project docs/instructions and verify production status before considering the change complete.
