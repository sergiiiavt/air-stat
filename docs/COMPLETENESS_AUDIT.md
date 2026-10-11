# Independent completeness audit

Historical collection completion and data completeness are separate claims. A backfill date can be `done` even when public-source coverage was degraded, so `done` must never be treated as proof that every physical consequence was captured.

## Audit boundary

The existing independent audit currently covers the **original** 2026 slice `2026-03-19` through `2026-09-19` (not yet the full multi-year backfill, which now starts `2022-02-24`) and compares production data with discovery paths that are independent from the campaign completion state:

- production `GET /api/range` for the audited event date;
- direct Ukrainska Pravda daily archive discovery, followed by hydration of the underlying article to distinguish publication date from the original event date;
- Google News RSS discovery across independent publishers, with the RSS `pubDate` required to match the audited publication date.

The audit deliberately does not reuse `automated_research_days.status` as evidence of completeness.

## Status semantics

Each calendar day receives one status:

- `verified` — the audit found no discrepancy and all configured discovery providers were reachable. This is evidence that no gap was found, not a mathematical proof that public reporting is complete.
- `review` — discovery was degraded, an incident lacks evidence, or an unmatched external signal is not strong enough to call missing automatically.
- `missing` — a high-confidence external consequence/area signal is absent from production, or production has a hard integrity failure such as a duplicate incident ID.

A high-confidence external gap requires an explicit consequence signal, an explicit Kyiv district / Kyiv Oblast raion, and a direct Ukrainska Pravda article whose body supports the audited date as the original event date. Publication-date-only or Google News signals remain `review`; they cannot independently produce `missing`. Settlement-only mismatches also stay in `review` because a settlement can be normalized to a broader administrative area.

An air-alert day without a researched physical consequence is not itself suspicious: alerts routinely end without damage. Alert timing is therefore useful context but is not an automatic completeness failure.

## Execution

Local/self-test:

```bash
npm run test:completeness-audit
```

Full production audit:

```bash
npm run audit:completeness
```

The GitHub Actions `Completeness audit` workflow runs automatically when the audit implementation changes, can be started manually, and runs weekly. It uploads:

- `completeness-report.json` — machine-readable per-day evidence and findings;
- `completeness-summary.md` — compact human-readable summary.

The workflow fails only when at least one `missing` day is found. `review` remains visible and actionable without converting uncertainty into a false failure or a false `verified` state.

## Relationship to existing validation

`scripts/audit-research-coverage.mjs` remains the internal archive/coverage audit. It checks researched date files, record counts, geography precision and source distribution. The independent completeness audit answers a different question: whether external public reporting contains plausible consequences that production does not represent.

Both checks are required before describing the archive as independently reconciled.
