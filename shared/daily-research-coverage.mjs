function addDays(date, amount) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function latestRun(runs) {
  return runs.reduce((latest, run) => {
    if (!latest) return run;
    return Number(run.id) > Number(latest.id) ? run : latest;
  }, null);
}

export function summarizeDailyResearchCoverage(runs, date, windowDays) {
  if (!Number.isInteger(windowDays) || windowDays < 1) {
    throw new Error('windowDays must be a positive integer');
  }

  const lastCoveringTarget = addDays(date, windowDays - 1);
  const coveringRuns = runs.filter((run) =>
    run.target_date >= date && run.target_date <= lastCoveringTarget
  );
  const successfulRuns = coveringRuns.filter((run) => run.status === 'success');
  const runningRuns = coveringRuns.filter((run) => run.status === 'running');
  const failedRuns = coveringRuns.filter((run) => run.status === 'error');

  const status = successfulRuns.length > 0
    ? 'completed'
    : runningRuns.length > 0
      ? 'in_progress'
      : failedRuns.length > 0
        ? 'failed'
        : 'pending';

  const summaryRun = status === 'completed'
    ? latestRun(successfulRuns)
    : status === 'in_progress'
      ? latestRun(runningRuns)
      : status === 'failed'
        ? latestRun(failedRuns)
        : null;

  return {
    status,
    attempts: coveringRuns.length,
    successfulRuns: successfulRuns.length,
    failedRuns: failedRuns.length,
    lastStartedAt: summaryRun?.started_at ?? null,
    lastFinishedAt: summaryRun?.finished_at ?? null,
    lastError: status === 'failed' ? summaryRun?.error_message ?? null : null,
    discoveredCount: Number(summaryRun?.discovered_count ?? 0),
    findingCount: Number(summaryRun?.finding_count ?? 0),
    attackWriteCount: Number(summaryRun?.attack_write_count ?? 0),
    incidentWriteCount: Number(summaryRun?.incident_write_count ?? 0),
  };
}
