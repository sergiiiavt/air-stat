import assert from 'node:assert/strict';
import { buildShareUrl, readSharedState } from '../src/share-url.mjs';

const today = '2026-10-15';
const root = 'https://air-alert-stat.com/';

assert.equal(readSharedState('', today), null, 'No link state should keep existing browser preferences');

const daily = readSharedState('?view=daily&days=30', today);
assert.deepEqual(daily, {
  viewMode: 'timeline',
  scope: 'kyiv-city',
  from: '2026-09-16',
  to: today,
  presetDays: 30,
}, 'Shared rolling 30-day view must use inclusive calendar dates');
assert.equal(readSharedState('?view=timeline&days=30', today)?.viewMode, 'timeline');

const originalMap = readSharedState('?view=map&scope=both&days=7', today);
assert.equal(originalMap.scope, 'both');
assert.equal(readSharedState('?view=daily&scope=both&days=7', today).scope, 'kyiv-city');

const fixed = readSharedState('?view=hours&from=2026-09-01&to=2026-09-30', today);
assert.deepEqual(fixed, {
  viewMode: 'hours', scope: 'kyiv-city', from: '2026-09-01', to: '2026-09-30', presetDays: null,
});
assert.equal(readSharedState('?view=trends&from=2026-02-29&to=2026-03-02', today)?.presetDays, 7);
assert.equal(readSharedState('?view=daily&from=2026-10-16&to=2026-10-20', today)?.presetDays, 7);
assert.equal(readSharedState('?view=daily&from=2026-10-10&to=2026-10-09', today)?.presetDays, 7);
assert.equal(readSharedState('?view=daily&days=999', today)?.presetDays, 7);

const rollingUrl = buildShareUrl(root, daily);
assert.equal(rollingUrl, 'https://air-alert-stat.com/?view=daily&days=30');
assert.deepEqual(readSharedState(new URL(rollingUrl).search, today), daily);
assert.equal(buildShareUrl(
  root + '?view=map&scope=both&days=7&utm_source=test#section',
  fixed,
), 'https://air-alert-stat.com/?utm_source=test&view=hours&from=2026-09-01&to=2026-09-30#section',
'Changing views must remove stale date/scope params, but preserve unrelated query and fragment');
assert.equal(buildShareUrl(root, originalMap),
  'https://air-alert-stat.com/?view=map&days=7&scope=both');
assert.equal(buildShareUrl(root, fixed).includes('days='), false);

console.log('Shareable dashboard URL tests passed.');
