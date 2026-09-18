# Historical backfill

Initial backfill covers 2026-06-18 through 2026-09-17.

The temporary scheduled task works in 7-day chunks, newest to oldest. It must read `data/backfill-state.json` before every run.

For each run:

1. Take `cursor.nextTo` as the end of the next chunk.
2. Research up to 7 calendar days ending on that date, without going earlier than `target.from`.
3. Research both events that happened in the chunk and later-published clarifications about those events.
4. Update/create the corresponding event-date JSON files and `data/index.json`.
5. Validate all changed research JSON.
6. Commit meaningful changes.
7. Regardless of whether the chunk contains attacks, record the chunk as processed in `backfill-state.json` only after research completed successfully.
8. Move `cursor.nextTo` to the day before the processed chunk.
9. When the range is exhausted, set `status` to `complete` and `cursor.nextTo` to null.

A failed/incomplete run must not advance the cursor.

This state file exists so that days with no attacks are distinguishable from days that were never researched.


## Progress reporting contract

Before researching a chunk, update `data/backfill-state.json` and commit the state transition:

- set `status` to `running`;
- set `currentChunk` to the exact `from` / `to` dates being processed;
- set `lastStartedAt` to the current Europe/Kyiv timestamp;
- clear `lastError`;
- update `updatedAt`.

After a successful chunk:

- append the chunk to `processedChunks`;
- move `cursor.nextTo` backward;
- clear `currentChunk`;
- set `lastCompletedAt`;
- set `status` to `pending`, or `complete` when the target range is exhausted;
- update `updatedAt`.

If a run fails after it has marked itself running:

- do not advance the cursor;
- keep the same chunk eligible for retry;
- set `status` to `pending`;
- clear `currentChunk`;
- set `lastError` to a concise failure reason;
- update `updatedAt`.

The website reads this state through `/api/status` and refreshes it periodically.
