# Historical research pipeline

Historical incident data is rebuilt **event date by event date** by a deterministic GitHub Actions pipeline. The research agent is a stateless worker: it reads one small assignment file, researches one date, and creates exactly one submission file. Everything else — merging, validating, counting, committing — is code.

```text
agent run                       repository pipeline
  read data/pipeline/next.json    process every data/inbox/*.json
  research task.eventDate         merge by id into data/YYYY/MM/*.json
  create data/inbox/backfill-E    regenerate data/index.json from disk
        |                         validate the whole archive in-process
        |                         invalid -> restore originals, record the errors
        +-----------------------> delete the submission, append to log.json
                                  lease check -> timeouts, rotation
                                  plan the next date -> next.json
                                  one atomic commit, push with rebase retry
```

The agent creates no branches, opens no pull requests, and edits nothing else. A run that dies halfway leaves nothing behind.

## Files

| Path | Written by | Purpose |
|---|---|---|
| `data/inbox/` | agent only | Submissions. The pipeline deletes each one after processing |
| `data/pipeline/state.json` | pipeline only | Campaign state, the source of truth |
| `data/pipeline/next.json` | pipeline only | The current assignment. Small, so connector reads stay reliable |
| `data/pipeline/log.json` | pipeline only | Last 50 processed submissions with result and concise errors |
| `data/pipeline/alert-days.json` | pipeline only | Alert-day snapshot from the production API, used for prioritisation |

## Campaign

Event dates `2026-03-19` through `2026-09-19`, 185 days. Each day is `pending`, `done` or `needs_review`.

The earlier publication-date replay (36 days, stopped 2026-09-24) is recorded in `state.json.previousCampaigns` and is **not** treated as done: the event-date pass is a different and stronger search. That campaign's cursor and receipts remain in git history up to `98b2b46`.

Research for event date E has two sweeps:

- **event sweep** — Ukrainian and English queries with date variants (`24 квітня`, `24.04.2026`, `April 24 2026`) plus Kyiv/Київщина and attack, damage or debris terms, against official sources and local media;
- **clarification sweep** — publications from E+1 to E+14 about the attacks found, for casualty updates and later damage totals.

**Prioritisation.** `alert-days.json` is refreshed from `GET /api/days` (both scopes, split into windows because the endpoint has `LIMIT 180`) when it is older than 24 h, and only when the pipeline is about to plan. Dates with a recorded alert are tier 0 and go first; everything else is tier 1. A row exists **only** for a day with alerts, so a missing row means "no alert record", not "quiet" — this is why `next.json` reports `alerts: null` rather than zeros for such a date. If the fetch fails the previous snapshot is kept, and with no snapshot every date is tier 1. Planning never fails because of the network.

## Submission format

`data/inbox/backfill-YYYY-MM-DD.json` or `data/inbox/daily-YYYY-MM-DD-HHMM.json`. Any `*.json` in the directory is processed; the names are a convention, not a requirement.

```json
{
  "schemaVersion": 1,
  "kind": "backfill",
  "taskDate": "2026-04-24",
  "submittedAt": "2026-09-25T10:15:00Z",
  "outcome": "updated",
  "searchSummary": "Short free text: queries and sites checked.",
  "documents": [
    {
      "date": "2026-04-24",
      "attacks": [],
      "incidents": [],
      "removeIds": []
    }
  ]
}
```

- `kind` is `backfill` or `daily`. For `backfill`, `taskDate` is the assigned event date and must fall inside the campaign. For `daily`, `taskDate` is the publication day, and documents may target any event date up to today — that is how a retrospective clarification lands in an older file.
- `outcome` is `updated` or `no-findings`. `no-findings` allows empty `documents`; `updated` needs at least one record or one `removeIds` entry.

## Merge semantics

Per submitted document:

1. Load the existing `data/YYYY/MM/<date>.json`, or start from a skeleton with empty `attacks`/`incidents`.
2. Apply `removeIds`.
3. For each submitted attack or incident: fill `date` if missing; if the id already exists, **replace the record but union `sources` by URL** (submitted sources first, then existing ones not resubmitted) so evidence is never silently dropped; otherwise append.
4. If the document ends with zero attacks and zero incidents, delete the file. Empty event files are never kept.
5. A byte-identical resubmission is a no-op. Any real content change sets `generatedAt` to the run time, which is also the index revision the Worker imports on.
6. Regenerate `data/index.json` from disk, sorted by path.
7. Validate the whole archive in-process. On any error, restore every touched file **and** the index to their original bytes, then record a rejection.

A submission is also rejected for unparsable JSON, a bad envelope, an unknown `kind`, a backfill `taskDate` outside the campaign, a document date in the future, or an id that duplicates an id in another date file.

Errors fed back to the agent are concise JSON-pointer lines such as `data/2026/04/2026-04-24.json: /incidents/0/area/map/precision must be one of [...]`, capped at 15 lines of about 300 characters.

Because the pipeline judges each submission on the errors it *adds*, a pre-existing archive defect cannot silently reject every date. Such a defect is reported as a warning in the Actions log, and CI on `main` fails on it independently.

## State machine

**Accepted backfill.** The day becomes `done` with its `outcome`, `completedAt` and `changedFiles`; `lastError` is cleared; `lastAcceptedAt` moves. An accepted submission for a `needs_review` or already-`done` day still applies, and the day ends up `done`.

**Rejected backfill.** `rejections += 1`, and the errors are stored on the day. The assignment **stays on the same date**, with its lease refreshed, so the next agent run sees the errors and fixes them. At `rejections >= maxAttempts` (3) the day becomes `needs_review` and the assignment is released.

**Lease.** An assignment expires after `leaseHours` (3). On expiry `timeouts += 1` and the assignment is released; at `timeouts >= maxAttempts` the day becomes `needs_review`. This is what makes a silent agent death countable — the dying run does not have to record anything.

**Planning.** Among `pending` days, the pipeline sorts by `timeouts` ascending, then tier, then date. Sorting on `timeouts` first means a timed-out date **rotates to the back**: a date that always kills the agent run never blocks the campaign, and if the agent is offline entirely it takes a full queue cycle before any date reaches a second timeout.

**Daily submissions** change data and append a log entry. They never change campaign state.

## Operating it

```bash
npm run pipeline:status                      # campaign summary
npm run pipeline:run                         # process the inbox locally
npm run pipeline:requeue -- 2026-04-24       # needs_review -> pending, counters cleared
npm run validate:backfill                    # validate the control plane
npm run test:pipeline                        # pipeline regression suite
```

`pipeline:run` accepts `--root <dir>`, `--now <iso>`, `--offline` and `--message-file <path>`. The workflow uses `--message-file` to hand the commit subject to git.

## Workflow

`.github/workflows/research-pipeline.yml` runs on a push touching `data/inbox/**`, every 30 minutes, and on manual dispatch, under a `research-pipeline` concurrency group so two runs never interleave.

- Pushes made with `GITHUB_TOKEN` do not trigger other workflows, so there is no loop and `ci.yml` does not run on pipeline commits. That is acceptable because the pipeline validates before committing, and the same validators run in CI on every other commit.
- If a push fails, nothing is lost: the submissions are still on `main` and the next run redoes them idempotently.
- The job stages `data/` only. The repository deliberately has no lockfile, and the pipeline never touches application code.
- Idle runs write nothing, so they produce no commit.

## Completion semantics

Two metrics stay separate:

- **campaign progress** — event dates the pipeline has researched;
- **event archive coverage** — event-date files and incidents actually present and imported.

A completed date does not imply an event occurred on it, and a missing event-date file is unknown coverage rather than a researched empty day. The campaign is complete when no `pending` days remain.

## Live progress dashboard

`/progress` polls `GET /api/progress` every 15 seconds. The Worker reads `data/pipeline/state.json`, projects it onto the existing `researchBackfill` response shape, and returns imported archive metadata separately. Day status maps as `done` → `completed`, `needs_review` → `needs_review`, the leased date → `in_progress`, a pending date with rejections or timeouts → `retry`, otherwise `pending`. A campaign with no accepted submission within `staleAfterHours` (6) is shown as stalled. Upstream GitHub responses may be cached by Cloudflare for roughly one minute.
