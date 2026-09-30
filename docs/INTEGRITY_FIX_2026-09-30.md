# Recent research integrity hardening — 2026-09-30

This change closes two integrity gaps in the rolling recent-news collector.

1. **Single-flight is now a database invariant.** The Worker still avoids starting a second daily research run, but D1 also has a partial unique index that permits at most one `daily` row with `status = 'running'`. The migration closes older duplicate running rows before creating the index. The Worker claims a daily run with a conditional insert so a race is a clean no-op rather than a failed cron invocation.
2. **Evidence-based idempotency no longer merges ambiguous physical incidents.** Source/area/impact matching is used only when that exact evidence signature supports one extracted incident. When one article supports multiple incidents with the same area and impact class, their stable `incidentKey` identities remain separate.

Production smoke verifies that the running daily-research count is present and never exceeds one, and that recent/range incident IDs are unique. The research revision is bumped so the next successful rolling scan applies the new extraction/persistence behavior.
