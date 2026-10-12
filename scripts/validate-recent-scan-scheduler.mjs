import assert from 'node:assert/strict';
import { selectNextRecentScanDate } from '../shared/recent-scan-scheduler.mjs';

const choose = (attempts, today = '2026-10-12') =>
  selectNextRecentScanDate(today, 7, attempts.map(([target_date, last_attempt_at]) => ({
    target_date, last_attempt_at,
  })));

assert.equal(choose([]), '2026-10-12', 'First run must scan the current day');
assert.equal(choose([['2026-10-12', '2026-10-12 09:00:00']]), '2026-10-11',
  'After today, scan the next missing publication day');
assert.equal(choose([
  ['2026-10-12', '2026-10-12 09:00:00'],
  ['2026-10-11', '2026-10-12 10:00:00'],
  ['2026-10-10', '2026-10-12 11:00:00'],
]), '2026-10-09', 'All unscanned days must eventually be selected');

const sevenDays = Array.from({ length: 7 }, (_, i) => {
  const day = new Date('2026-10-12T00:00:00Z');
  day.setUTCDate(day.getUTCDate() - i);
  return [day.toISOString().slice(0, 10), `2026-10-12 ${String(9 + i).padStart(2, '0')}:00:00`];
});
assert.equal(choose(sevenDays), '2026-10-12', 'Rotate to oldest attempted day');
assert.equal(choose(sevenDays.slice(1)), '2026-10-12',
  'Missing today must take precedence over previously scanned days');
assert.equal(choose([
  ['2026-10-12', '2026-10-12 16:00:00'],
  ['2026-10-11', '2026-10-12 08:00:00'],
  ['2026-10-11', '2026-10-12 12:00:00'],
  ...sevenDays.slice(2),
]), '2026-10-10', 'Duplicate day attempts use the most recent time');
assert.equal(selectNextRecentScanDate('2026-03-01', 3, []), '2026-03-01');
assert.equal(selectNextRecentScanDate('2026-03-01', 3, [
  { target_date: '2026-03-01', last_attempt_at: '2026-03-01 09:00:00' },
]), '2026-02-28', 'UTC month boundary must be handled');
assert.throws(() => selectNextRecentScanDate('bad', 7, []));

console.log('Date-scoped recent research scheduler validation passed.');
