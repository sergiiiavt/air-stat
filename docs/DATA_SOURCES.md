# Data source strategy

Air Stat has two independent evidence streams:

1. **Incidents/consequences** — the primary source for map dots, damage, casualties and attack records.
2. **Air-alert timing** — supporting data for alert counts, duration and trends.

They must not be conflated.

## Incident and consequence research

The primary incident pipeline is web/news research. It is not tied to KOVA or to one fixed API.

Discovery should include:

- official Kyiv City / Kyiv Oblast authorities;
- DSNS and National Police;
- district, hromada and municipal authorities;
- Air Force public statements when relevant to attack context;
- Suspilne, Ukrainska Pravda, Reuters/AP and reputable local media;
- Google News/search/RSS-style indexes and similar search systems;
- public local sources as lead generators when needed.

Search/index pages are discovery mechanisms. Store the underlying publisher URL whenever possible.

### Daily rule

Recent incident research re-scans a rolling seven-day publication window. It is driven by the minute Worker cron, internally throttled to roughly one successful pass per hour. Recent discovery is deliberately news-first: direct Ukrainska Pravda RSS/daily archives and Suspilne Kyiv are primary, Google News RSS is fallback discovery when direct media coverage is thin, and official KODA/Kyiv City pages are supplementary confirmation. GDELT is excluded from the recent path and remains historical-only. A recent run may proceed with one healthy news source instead of failing merely because unrelated provider families are unavailable. Only one recent scan may run at a time, enforced both in the Worker and by D1. Repeated evidence is treated as an update only when its source/area/impact signature is unambiguous; multiple physical incidents supported by the same article are kept separate. Multi-district Kyiv reports are audited against every explicitly mentioned city district before extraction is accepted.

Each publication is classified by the original event date it describes:

- same-day reporting -> create/update today's event file;
- retrospective clarification -> update the older event file;
- duplicate reporting of the same physical incident -> merge evidence without creating a duplicate; multiple distinct locations in one district/day remain separate incidents.

The job does not routinely re-search the previous N days.

### Historical rule

Historical data is rebuilt **event date by event date** by the Cloudflare-native collector. Dates already represented by the validated/imported GitHub research archive are reconciled as complete first. For each remaining date, the collector scans official KODA and Kyiv City publications through E+14, supplements discovery with one bounded GDELT query when available, and can use Google News RSS as a fallback. Provider failures degrade discovery breadth instead of failing the run when at least one provider completed successfully; only a total provider outage remains retryable. Later casualty, damage and location corrections remain attached to the original event date. Alert days are prioritised from D1 alert history.

See `docs/BACKFILL_PROCESS.md`.

## Air-alert timing

Alert timing is separate from incident research.

### Kyiv City

Kyiv Digital / Kyiv Open Data provides the main deterministic city alert state/history feed. Start/all-clear transitions are normalized into alert intervals.

### Kyiv Oblast

The official KOVA public channel is useful for current/recent whole-oblast and raion alert state messages.

The official KODA website archive is a primary central source for Kyiv Oblast incident/consequence discovery. KOVA's public Telegram search archive remains supporting current/recent context and is **not** treated as the six-month historical backfill API because archive pagination may be incomplete.

Where configured, alerts.in.ua provides additional current/recent alert context and cross-checking. Historical alert timing should use a dedicated structured historical source when available; it is not reconstructed from news articles.

## Source priority for facts

When several sources report the same fact, prefer the most direct and authoritative evidence available, but retain useful independent corroboration.

Typical order:

1. directly responsible official authority;
2. local/municipal authority with first-hand reporting;
3. DSNS / Police;
4. reputable national/local media with direct reporting;
5. international wire services;
6. local/social reports as provisional leads.

Newer authoritative corrections may replace older values while the source history remains preserved.

## Normalization rules

- Preserve source URL and publication timestamp.
- Keep event date separate from publication date.
- Reuse stable incident/attack IDs.
- Deduplicate repeated coverage.
- Never infer casualties, weapon counts or interception counts.
- Never infer “no impact” from silence.
- Keep verification/confidence explicit.
- Do not publish exact recent strike, air-defence, military or critical-infrastructure coordinates.
- Use Europe/Kyiv for calendar-date interpretation.

## Collection cadence

- Recent incident research: minute Worker cron, internally throttled to roughly hourly; a rolling seven-day publication window is re-scanned with multi-provider Ukrainian/English discovery.
- Historical incident rebuild: Cloudflare Worker minute cron with a five-minute D1 throttle; one D1-claimed event date at a time, alert days first.
- Kyiv Digital / alert sources: deterministic collector cadence independent of news research.
- KOVA: current/recent alert-state support, not the core incident pipeline.
