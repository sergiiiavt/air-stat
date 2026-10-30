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
import { VERIFIED_BALLISTIC_EVENTS, explicitlyBallisticResearch, mergeBallisticEvidence } from '../shared/ballistic-catalog.mjs';
assert.equal(VERIFIED_BALLISTIC_EVENTS.length, 10, 'Ten confirmed, sourced Kyiv dates in October 2026');
assert.equal(new Set(VERIFIED_BALLISTIC_EVENTS.map(x => x.date)).size, VERIFIED_BALLISTIC_EVENTS.length);
assert.ok(VERIFIED_BALLISTIC_EVENTS.some(x => x.date === '2026-10-29'));
for (const e of VERIFIED_BALLISTIC_EVENTS) {
  assert.match(e.date, /^\\d{4}-\\d{2}-\\d{2}$/);
  assert.ok(e.sources.length > 0);
  assert.ok(e.sources.every(s => /^https:\/\//.test(s.url)));
  assert.equal(e.verification, 'confirmed');
  assert.equal(e.confidence, 'high');
  assert.equal(e.provenance, 'curated');
  assert.equal(e.timeEvidence, e.startedAt === null ? 'date-only' : 'reported-strike');
  if (e.startedAt) assert.ok(ballisticTime(e.startedAt, e.date));
}
assert.equal(explicitlyBallisticResearch('A combined drone and ballistic missile strike hit Kyiv', ['combined']), true);
assert.equal(explicitlyBallisticResearch('Missile threat alerts in Kyiv', ['unknown']), false);
assert.equal(explicitlyBallisticResearch('Russian ballistic threat alert', ['unknown']), false);
assert.equal(explicitlyBallisticResearch('Drone attack on Kyiv', ['uav']), false);
assert.equal(explicitlyBallisticResearch('Attack occurred', ['ballistic']), true);
const matched = mergeBallisticEvidence([
  { id: 'archive-duplicate', date: '2026-10-12' },
  { id: 'other-day', date: '2026-10-01' },
], VERIFIED_BALLISTIC_EVENTS, '2026-10-01', '2026-10-30');
assert.equal(matched.length, 11, 'Curated day suppresses duplicate daily research row');
assert.ok(!matched.some(x=>x.id === 'archive-duplicate'));
assert.equal(mergeBallisticEvidence([], VERIFIED_BALLISTIC_EVENTS, '2026-10-24', '2026-10-30').length, 3);
console.log('Ballistic time, evidence and grouping tests passed.');
