/**
 * One definition of "how is the research campaign doing", shared by the Worker
 * that serves /api/progress and by the pipeline CLI, so the progress page and
 * `npm run pipeline:status` can never tell different stories.
 *
 * The distinction that matters operationally: a campaign sitting at 0% because
 * the research agent has never delivered anything looks identical, in every
 * number on the page, to one that was collecting and then stopped. The fix for
 * each is completely different — the first is a dead agent task, the second is
 * a campaign that ran into trouble — so they are reported as different states.
 */

const HOUR_MS = 60 * 60 * 1000;

/**
 * True once the agent has delivered anything at all, accepted or rejected.
 * A rejection still proves the agent is alive and reaching the repository.
 */
export function submissionsSeen(state) {
  if (state.lastAcceptedAt) return true;
  return (state.days ?? []).some((day) => (day.rejections ?? 0) > 0);
}

/** Hours since the last accepted result, or since the campaign started. */
export function hoursSinceProgress(state, nowMs = Date.now()) {
  const sinceMs = new Date(state.lastAcceptedAt ?? state.createdAt).getTime();
  if (!Number.isFinite(sinceMs)) return null;
  return (nowMs - sinceMs) / HOUR_MS;
}

/**
 * - `complete`        every date is researched or parked for review
 * - `active`          a result was accepted within the stale threshold
 * - `no-submissions`  nothing has ever arrived from the agent
 * - `stalled`         it was collecting, and has now gone quiet
 */
export function campaignHealth(state, nowMs = Date.now()) {
  if (!(state.days ?? []).some((day) => day.status === 'pending')) return 'complete';

  const elapsed = hoursSinceProgress(state, nowMs);
  if (elapsed === null || elapsed <= state.staleAfterHours) return 'active';

  return submissionsSeen(state) ? 'stalled' : 'no-submissions';
}
