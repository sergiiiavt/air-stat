# Historical publication replay

Historical incident data is rebuilt by replaying **published news/source items by publication date**. Publication replay progress is not a claim that an attack happened on every replayed date.

The replay mirrors the normal daily job:

```text
publication date P
    -> find sources published on P
    -> read relevant articles/posts
    -> determine original event date E for each source
    -> create/update data/E.json
    -> validate
    -> write immutable receipt for P
    -> advance cursor to P + 1
```

A publication on September 20 that clarifies a September 18 attack updates the September 18 research file.

## Durable state

Replay v2 deliberately does **not** keep a mutable entry for every campaign day.

The single durable control-plane file is:

`data/backfill/cursor.json`

It contains the campaign range, the next publication date, the last completed date, completion count, retry state, stale threshold, and last error. The file is intentionally small so a connector never has to reconstruct or overwrite a 185-entry queue.

Successful v2 days additionally create immutable audit receipts:

`data/backfill/runs/YYYY-MM-DD.json`

The current campaign covers publication dates `2026-03-19` through `2026-09-19`. Dates through `2026-04-09` were completed before the v2 migration. Receipts are required starting at `cursor.receiptFrom`.

## One-day transaction

Exactly **one publication date** is processed per scheduled replay run.

For publication date P:

1. Read the latest `cursor.json`; P must equal `nextPublicationDate`.
2. Search only sources published on P.
3. Search broadly across official authorities, national/local media, municipal sources, and search/news indexes.
4. Open relevant underlying articles/posts; do not rely on search snippets alone.
5. Determine the original event date E described by every relevant source.
6. Read existing `data/YYYY/MM/E.json` before editing.
7. Create/update E using stable IDs and deduplicate repeated reporting.
8. Preserve source URL and `publishedAt`.
9. Update `data/index.json` only when event research files changed.
10. Validate all affected research files plus repository backfill validation.
11. Create `data/backfill/runs/P.json` with the affected event dates and changed files.
12. Advance the cursor to the following publication date.
13. Commit the event files, index when changed, receipt, and cursor **together in one Git commit**.

A publication date may complete with zero event-data changes when the search finds no relevant publication. It still gets a receipt and cursor advance. Do not create an empty event-date research file just to represent replay progress.

## Failure and retry

Do not skip failed publication dates.

On a failed research/validation attempt:

- keep `nextPublicationDate` unchanged;
- increment `attempts`;
- set `status` to `retry`, or `blocked` when `maxAttempts` is reached;
- store a concise `lastError`;
- do not create a successful receipt;
- do not partially advance the cursor.

The next replay run retries the same publication date. A blocked cursor requires intervention rather than silently continuing with later dates.

The progress API also derives a stale condition from `staleAfterHours`. With the current hourly schedule, a cursor that has not advanced for more than three hours is visibly stalled.

## Concurrency and Git safety

Daily research and historical replay can both update older event files. Historical replay therefore must:

- begin from the current `main` head;
- construct all changes against that same base;
- commit all replay changes atomically;
- update `main` only as a non-force fast-forward;
- if `main` moved before the ref update, abandon that commit attempt, re-read the changed files, and retry rather than overwriting newer work.

Never force-update `main`.

## Search strategy

Use:

- broad Google/news/search discovery for Kyiv City and Kyiv Oblast for publication date P;
- targeted searches on high-value official and media sites;
- local/municipal searches when broad results indicate a specific raion, hromada or settlement;
- `data/reference/kyiv-50km-settlements.json` as a discovery aid when useful.

KOVA/alert feeds are supporting alert-timing/context sources, not the primary historical incident source.

## CLI

Inspect the small cursor:

```bash
npm run backfill:status
```

Show the next publication date:

```bash
npm run backfill:next
```

Validation:

```bash
npm run validate:backfill
```

The scheduled agent owns retry/advance writes; the local CLI is intentionally read-only so operators cannot accidentally claim or skip several days.

## Completion semantics

Two metrics remain separate:

- **publication replay coverage**: publication dates processed by the cursor;
- **event archive coverage**: event-date JSON files and incidents actually present/imported.

A completed publication date does not imply an event occurred on that date. A missing event-date file is not automatically converted into an empty researched day.

The campaign is complete when the cursor reaches the end date, has `status: "complete"`, all required v2 receipts exist, and repository validation passes.

## Live progress dashboard

The temporary `/progress` page polls `GET /api/progress` every 15 seconds. The Worker reads the compact cursor, synthesizes the full per-day calendar for compatibility, and returns imported archive metadata separately. Upstream GitHub responses may be cached by Cloudflare for roughly one minute.
