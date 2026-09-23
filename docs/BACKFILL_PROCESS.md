# Historical publication replay

Historical incident data is rebuilt by replaying **published news/source items by publication date**. Publication replay progress is not a claim that an attack happened on every replayed date.

The replay mirrors the normal daily job:

```text
publication date P
    -> find sources published on P
    -> read relevant articles/posts
    -> determine original event date E for each source
    -> prepare event/index/receipt/cursor changes on replay branch
    -> open one replay PR
    -> repository CI validates the complete change set
    -> merge PR atomically
    -> cursor on main advances to P + 1
```

A publication on September 20 that clarifies a September 18 attack updates the September 18 research file.

## Durable state

The durable control-plane file is:

`data/backfill/cursor.json`

It contains the campaign range, the next publication date, the last completed date, completion count, retry state, stale threshold, and last error. It is intentionally small so connector reads/writes stay reliable.

Successful replay days additionally create immutable audit receipts:

`data/backfill/runs/YYYY-MM-DD.json`

The current campaign covers publication dates `2026-03-19` through `2026-09-19`. Dates through `2026-04-09` were completed before the v2 migration. Receipts are required starting at `cursor.receiptFrom`.

## One-day PR transaction

Exactly **one publication date** is owned by a replay transaction.

For publication date P:

1. Read the latest `cursor.json`; P must equal `nextPublicationDate`.
2. Before starting new work, look for an existing open replay PR for P.
3. If such a PR exists, inspect its CI/merge state instead of creating duplicate work.
4. Otherwise create a branch from the current `main`, conventionally `replay/YYYY-MM-DD`.
5. Search only sources published on P.
6. Search broadly across official authorities, national/local media, municipal sources, and search/news indexes.
7. Open relevant underlying articles/posts; do not rely on search snippets alone.
8. Determine the original event date E described by every relevant source.
9. Read existing `data/YYYY/MM/E.json` before editing.
10. Create/update E using stable IDs and deduplicate repeated reporting.
11. Preserve source URL and `publishedAt`.
12. Update `data/index.json` only when event research files changed.
13. Create `data/backfill/runs/P.json` with the affected event dates and changed files.
14. Advance the cursor **on the replay branch**, not directly on `main`.
15. Open one PR containing the complete publication-day change set.
16. Let repository CI run the normal validators, including `npm run validate:backfill`.
17. Merge only when CI is successful and the PR is mergeable.

The PR merge is the transaction boundary. The scheduled research runtime does not need local shell/npm access and does not need low-level multi-file Git commit APIs.

A publication date may complete with zero event-data changes when the search finds no relevant publication. It still gets a receipt and cursor advance in the replay PR. Do not create an empty event-date research file just to represent replay progress.

## Existing replay PR handling

At the start of each run, the agent must search for an open PR for the current P.

- CI pending: do not create another branch/PR; leave the cursor unchanged.
- CI successful + mergeable: merge the PR; completion becomes visible on `main` atomically.
- CI failed: inspect the failing validation, update the same replay branch when possible, and let CI rerun.
- Merge conflict / branch based on stale data: do not force or overwrite `main`; rebuild the replay changes from current `main` and replace the stale PR workflow rather than skipping P.

This prevents duplicate replay work across hourly runs.

## Failure and retry

Research/search failure **before a replay PR is ready** does not skip the date.

When a durable failure checkpoint is useful, the small cursor on `main` may be updated independently:

- keep `nextPublicationDate` unchanged;
- increment `attempts`;
- set `status` to `retry`, or `blocked` when `maxAttempts` is reached;
- store a concise `lastError`;
- do not create a success receipt.

A tooling limitation that is solved by the PR workflow is not a research failure and should not consume a retry attempt.

The progress API derives a stale condition from `staleAfterHours`. With the hourly schedule, a cursor that has not advanced for more than three hours is visibly stalled.

## Concurrency and Git safety

Daily research and historical replay can both update older event files. Therefore:

- replay branches start from the latest `main`;
- successful replay state is never pieced together by several direct commits to `main`;
- GitHub PR merge applies the validated day as one repository transition;
- never force-update `main`;
- if a replay PR conflicts with newer daily-research changes, re-read the latest files and reconcile them before merge.

## Search strategy

Use:

- broad Google/news/search discovery for Kyiv City and Kyiv Oblast for publication date P;
- targeted searches on high-value official and media sites;
- local/municipal searches when broad results indicate a specific raion, hromada or settlement;
- `data/reference/kyiv-50km-settlements.json` as a discovery aid when useful.

KOVA/alert feeds are supporting alert-timing/context sources, not the primary historical incident source.

## CLI and CI

Local/operator inspection remains:

```bash
npm run backfill:status
npm run backfill:next
npm run validate:backfill
```

The **scheduled research agent does not need to execute npm locally**. Repository CI is authoritative for replay PR validation before merge.

## Completion semantics

Two metrics remain separate:

- **publication replay coverage**: publication dates merged/completed by the cursor;
- **event archive coverage**: event-date JSON files and incidents actually present/imported.

A completed publication date does not imply an event occurred on that date. A missing event-date file is not automatically converted into an empty researched day.

The campaign is complete when the cursor reaches the end date, has `status: "complete"`, all required v2 receipts exist, and repository validation passes.

## Live progress dashboard

The temporary `/progress` page polls `GET /api/progress` every 15 seconds. The Worker reads the compact cursor, synthesizes the full per-day calendar for compatibility, and returns imported archive metadata separately. Upstream GitHub responses may be cached by Cloudflare for roughly one minute.
