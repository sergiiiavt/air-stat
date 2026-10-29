import assert from 'node:assert/strict';
import { ballisticDays, ballisticTime } from '../shared/ballistic-stats.mjs';
assert.deepEqual(ballisticTime('2026-10-01T21:35:00Z', '2026-10-02'), { label: '00:35', minuteOfDay: 35 });
assert.equal(ballisticTime('2026-10-01T21:35:00Z', '2026-10-01'), null);
assert.equal(ballisticTime(null, '2026-10-02'), null);
assert.equal(ballisticTime('2026-10-02', '2026-10-02'), null);
assert.equal(ballisticTime('2026-10-02T05:00:00', '2026-10-02'), null);
assert.deepEqual(ballisticTime('2026-10-29T22:59:00Z', '2026-10-30'), { label: '00:59', minuteOfDay: 59 });
const days = ballisticDays([
 { id: 'a', date: '2026-10-01', startedAt: null },
 { id: 'b', date: '2026-10-02', startedAt: '2026-10-01T21:35:00Z' },
 { id: 'c', date: '2026-10-02', startedAt: null },
]);
assert.deepEqual(days.map((d) => [d.date, d.attacks.length, d.timed]), [
 ['2026-10-02', 2, 1], ['2026-10-01', 1, 0],
]);
console.log('Ballistic time and grouping tests passed.');
