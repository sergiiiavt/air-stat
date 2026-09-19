# Historical backfill process

The six-month historical reconciliation is intentionally bounded and resumable. It must never run as one monolithic research task.

## Campaign state

Durable state lives in:

`data/backfill/queue.json`

The current campaign covers every calendar day from `2026-03-19` through `2026-09-19`.

Each day has one of these states:

- `pending` — not processed in the current reconciliation campaign;
- `in_progress` — currently claimed by a worker/agent;
- `retry` — a previous attempt failed and may be retried;
- `completed` — the day was fully re-researched and its output was validated;
- `needs_review` — conflicting or ambiguous evidence requires a targeted review;
- `failed` — maximum automatic attempts were exhausted.

Existing historical JSON does **not** make a queue item completed. This campaign deliberately rechecks old records.

## Work unit

One calendar day is the atomic work unit.

A run may claim at most five dates. The dates are still researched, validated, persisted and marked complete one by one.

Default controls:

- batch size: 5 days;
- maximum attempts per day: 3;
- stale claim timeout: 120 minutes.

A stale `in_progress` item automatically becomes `retry` (or `failed` when attempts are exhausted) the next time the queue CLI is run.

## CLI

Inspect progress:

```bash
npm run backfill:status
```

Preview the next batch without changing state:

```bash
npm run backfill:next
```

Claim the next batch:

```bash
node scripts/backfill-queue.mjs claim --count 5
```

Complete one day after its research file and manifest entry have been written and validated:

```bash
node scripts/backfill-queue.mjs complete \
  --date 2026-03-19 \
  --revision 2026-09-19T15:30:00Z
```

Retry only the failed day:

```bash
node scripts/backfill-queue.mjs retry \
  --date 2026-03-20 \
  --error "source archive temporarily unavailable"
```

Escalate a conflicting day:

```bash
node scripts/backfill-queue.mjs review \
  --date 2026-03-21 \
  --reason "official casualty totals conflict"
```

## Per-day algorithm

For each claimed date, complete the following sequence before moving to the next date:

1. **Discovery**
   - official Kyiv City/Kyiv Oblast sources;
   - DSNS and National Police;
   - district/hromada/municipal sources;
   - alerts.in.ua context when available;
   - reputable national/local media;
   - aggregator/search discovery;
   - 50 km settlement sweep from `data/reference/kyiv-50km-settlements.json`.

2. **Candidate normalization**
   - normalize date;
   - normalize scope;
   - normalize place/hromada/raion;
   - attach candidate source URLs;
   - do not publish candidates yet.

3. **Verification**
   - open the underlying source rather than relying on an aggregator snippet;
   - reconcile later corrections;
   - record only supported threat, location, casualty and damage facts;
   - keep uncertain local-only claims provisional or omit them.

4. **Deduplication**
   - match an existing incident by date + attack + normalized geography + consequence;
   - update an existing broad record when later evidence adds specificity;
   - do not create a second incident merely because another source reports the same event.

5. **Persistence**
   - create/update `data/YYYY/MM/YYYY-MM-DD.json`;
   - create an empty researched-day document if the full sweep found no qualifying incident;
   - update `data/index.json`;
   - never create an empty day only to improve the progress percentage.

6. **Validation**
   - `npm run validate:data`;
   - `npm run validate:backfill`;
   - `npm run audit:data`.

7. **Checkpoint**
   - mark only that date `completed`;
   - persist queue state;
   - then continue to the next claimed date.

If one date fails, mark only that date `retry`/ `needs_review`. Other completed dates remain complete.

## Source fan-out

Do not issue 175 independent full searches for every day.

Use a cascading strategy:

1. broad date + Kyiv/Kyiv Oblast discovery;
2. identify affected raions/hromadas;
3. deepen searches inside affected geography;
4. perform a lighter settlement-name sweep across the 50 km catalogue to catch locally reported events missed by broad searches.

This keeps the normal path bounded while preserving recall.

## Progress semantics

There are two different metrics:

- **archive coverage**: a dated JSON file exists;
- **campaign completion**: the date was actually re-researched under the current process.

Only the second metric proves the six-month reconciliation is complete.

`GET /api/status` exposes the synchronized queue summary as `researchBackfill` after the Worker has polled the main branch.

## Completion

The campaign is complete only when:

- all 185 dates are `completed`, or explicitly resolved from `needs_review`;
- `failed = 0`;
- research-data and queue validation pass;
- the coverage audit reports no unresearched campaign dates;
- broad city/oblast records have received a targeted reconciliation pass where more specific public evidence exists.
