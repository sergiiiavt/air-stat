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

The daily job searches only publications newly published **today**.

Each publication is classified by the original event date it describes:

- same-day reporting -> create/update today's event file;
- retrospective clarification -> update the older event file;
- duplicate reporting -> merge evidence without creating a duplicate incident.

The job does not routinely re-search the previous N days.

### Historical rule

Historical data uses a chronological **publication-date replay**. For each historical publication day, search the publications from that day and apply them to their actual event dates. This naturally reconstructs later casualty/damage/location clarifications without repeatedly researching old event dates.

See `docs/BACKFILL_PROCESS.md`.

## Air-alert timing

Alert timing is separate from incident research.

### Kyiv City

Kyiv Digital / Kyiv Open Data provides the main deterministic city alert state/history feed. Start/all-clear transitions are normalized into alert intervals.

### Kyiv Oblast

The official KOVA public channel is useful for current/recent whole-oblast and raion alert state messages.

KOVA is **not** the primary source for attack incidents or consequences. Its public Telegram search archive is also not treated as a reliable six-month historical backfill API because archive pagination may be incomplete.

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

- Daily incident research: today's newly published sources only.
- Historical incident rebuild: queued publication dates replayed chronologically.
- Kyiv Digital / alert sources: deterministic collector cadence independent of news research.
- KOVA: current/recent alert-state support, not the core incident pipeline.
