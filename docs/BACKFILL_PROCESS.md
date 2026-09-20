# Historical publication replay

Historical incident data is rebuilt by replaying **published news/source items by publication date**. The queue does not mean “re-research the event that happened on this date”.

This mirrors the normal daily job:

```text
publication date P
    -> find sources published on P
    -> read relevant articles/posts
    -> determine original event date E for each source
    -> create/update data/E.json
    -> checkpoint P
```

A publication on September 20 that clarifies a September 18 attack updates the September 18 research file.

## Queue

Durable state lives in:

`data/backfill/queue.json`

The current campaign covers publication dates `2026-03-19` through `2026-09-19`.

Each queue entry uses `date` as the **publication date to replay** and has one of these states:

- `pending`
- `in_progress`
- `retry`
- `completed`
- `needs_review`
- `failed`

One publication date is the atomic checkpoint. A run may claim at most five dates, but each claimed date must be researched, persisted and checkpointed independently.

The legacy `existingResearchFile` flag is informational only. A file with the same calendar date neither proves nor prevents completion of a publication-day replay.

## Per-publication-day algorithm

For publication date P:

1. Search for **sources published on P only**.
2. Search broadly across official authorities, national/local media, municipal sources, and search/news indexes.
3. Open relevant underlying articles/posts; do not rely on search snippets alone.
4. For every relevant source, determine the **original event date E** described by the source.
5. Read any existing `data/YYYY/MM/E.json` before editing it.
6. Create a new attack/incident or update an existing one using stable IDs.
7. If the source is a later clarification, update E; do not create a duplicate event under P.
8. Deduplicate multiple publications describing the same incident.
9. Preserve source URL and `publishedAt`.
10. Validate every affected research file and `data/index.json`.
11. Mark publication date P complete even when it produced no data change, provided the publication-day search itself was completed.
12. Do **not** create an empty event-date JSON merely because publication date P had no relevant articles.

If a source published on P discusses several older incidents, one replay day may update several historical event files.

## Search strategy

Keep the process simple:

- broad Google/news/search discovery for Kyiv City and Kyiv Oblast with publication date P;
- targeted searches on high-value official and media sites;
- local/municipal searches when broad results indicate a specific raion, hromada or settlement;
- use `data/reference/kyiv-50km-settlements.json` as a discovery aid when useful, not as a requirement to launch hundreds of searches every day.

KOVA/alert feeds are not the primary historical incident source. They are supporting alert-timing/context sources only.

## CLI

Inspect progress:

```bash
npm run backfill:status
```

Preview the next publication dates:

```bash
npm run backfill:next
```

Claim up to five publication dates:

```bash
node scripts/backfill-queue.mjs claim --count 5
```

Complete one publication date:

```bash
node scripts/backfill-queue.mjs complete --date 2026-03-19
```

Retry or escalate only the failed publication date:

```bash
node scripts/backfill-queue.mjs retry --date 2026-03-20 --error "search/source failure"
node scripts/backfill-queue.mjs review --date 2026-03-21 --reason "conflicting evidence"
```

## Completion semantics

Two concepts remain separate:

- **publication replay coverage**: every publication date in the campaign has been processed;
- **event archive coverage**: historical event-date JSON files and incidents actually present in the archive.

A completed publication date does not imply that an event happened on that date. A missing event-date file is not automatically converted into an empty researched day.

The campaign is complete when every queued publication date is completed/resolved, no failed items remain, and repository validation passes.


## Live progress dashboard

The temporary `/progress` page visualizes this queue directly. It polls `GET /api/progress` every 15 seconds. The endpoint refreshes the GitHub queue snapshot before responding and returns per-day states plus imported archive metadata. Upstream GitHub responses may be cached by Cloudflare for roughly one minute.
