import assert from 'node:assert/strict';
import { summarizeDailyResearchCoverage } from '../shared/daily-research-coverage.mjs';

function run(id, targetDate, status, overrides = {}) {
  return {
    id,
    target_date: targetDate,
    started_at: `${targetDate} 10:00:00`,
    finished_at: status === 'running' ? null : `${targetDate} 10:01:00`,
    status,
    discovered_count: 10,
    finding_count: 2,
    attack_write_count: 1,
    incident_write_count: 2,
    error_message: status === 'error' ? 'provider failure' : null,
    ...overrides,
  };
}

const failedOnly = summarizeDailyResearchCoverage(
  [run(1, '2026-09-28', 'error')],
  '2026-09-28',
  7,
);
assert.equal(failedOnly.status, 'failed');
assert.equal(failedOnly.lastError, 'provider failure');

const recoveredLater = summarizeDailyResearchCoverage(
  [
    run(1, '2026-09-28', 'error'),
    run(2, '2026-09-29', 'success', { finding_count: 5 }),
  ],
  '2026-09-28',
  7,
);
assert.equal(recoveredLater.status, 'completed');
assert.equal(recoveredLater.successfulRuns, 1);
assert.equal(recoveredLater.failedRuns, 1);
assert.equal(recoveredLater.attempts, 2);
assert.equal(recoveredLater.findingCount, 5);
assert.equal(recoveredLater.lastError, null);

const successBeatsLaterRunning = summarizeDailyResearchCoverage(
  [
    run(10, '2026-09-29', 'success'),
    run(11, '2026-09-30', 'running'),
  ],
  '2026-09-28',
  7,
);
assert.equal(successBeatsLaterRunning.status, 'completed');
assert.equal(successBeatsLaterRunning.lastStartedAt, '2026-09-29 10:00:00');

const runningWithoutSuccess = summarizeDailyResearchCoverage(
  [run(20, '2026-09-30', 'running')],
  '2026-09-28',
  7,
);
assert.equal(runningWithoutSuccess.status, 'in_progress');

const outsideWindowIgnored = summarizeDailyResearchCoverage(
  [run(30, '2026-10-05', 'success')],
  '2026-09-28',
  7,
);
assert.equal(outsideWindowIgnored.status, 'pending');
assert.equal(outsideWindowIgnored.attempts, 0);

const latestSuccessWins = summarizeDailyResearchCoverage(
  [
    run(40, '2026-09-29', 'success', { finding_count: 3 }),
    run(42, '2026-10-01', 'success', { finding_count: 7 }),
    run(41, '2026-09-30', 'success', { finding_count: 4 }),
  ],
  '2026-09-28',
  7,
);
assert.equal(latestSuccessWins.status, 'completed');
assert.equal(latestSuccessWins.findingCount, 7);
assert.equal(latestSuccessWins.attempts, 3);

console.log('Daily research rolling coverage validation passed.');
