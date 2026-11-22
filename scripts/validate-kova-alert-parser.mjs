import { readFileSync } from 'node:fs';
import {
  buildKovaIntervals,
  kovaAlertEvent,
  kovaAlertKind,
} from '../shared/kova-alerts.mjs';

const cases = [
  ['🔴 Повітряна тривога в Київській області.', { kind: 'start', adminArea: 'Kyiv Oblast' }],
  ['🟢 Відбій повітряної тривоги в Київській області.', { kind: 'clear', adminArea: 'Kyiv Oblast' }],
  ['🔴 Київська область - повітряна тривога!', { kind: 'start', adminArea: 'Kyiv Oblast' }],
  ['🟢 Київська область - відбій повітряної тривоги!', { kind: 'clear', adminArea: 'Kyiv Oblast' }],
  ['Білоцерківський район — повітряна тривога', { kind: 'start', adminArea: 'Білоцерківський район' }],
  ['Бориспільський район — повітряна тривога', { kind: 'start', adminArea: 'Бориспільський район' }],
  ['Броварський район — відбій повітряної тривоги', { kind: 'clear', adminArea: 'Броварський район' }],
  ['Бучанський район - повітряна тривога', { kind: 'start', adminArea: 'Бучанський район' }],
  ['🟡 Бучанський район — повітряна тривога, жовтий рівень: Дронова загроза (жовтий рівень)', { kind: 'start', adminArea: 'Бучанський район' }],
  ['🟡 Білоцерківський район — повітряна тривога, жовтий рівень: Дронова загроза (жовтий рівень)', { kind: 'start', adminArea: 'Білоцерківський район' }],
  ['Вишгородський район: повітряна тривога', { kind: 'start', adminArea: 'Вишгородський район' }],
  ['Обухівський район — відбій повітряної тривоги', { kind: 'clear', adminArea: 'Обухівський район' }],
  ['Фастівський район — повітряна тривога', { kind: 'start', adminArea: 'Фастівський район' }],
  [
    'Більше п’яти годин тривала повітряна тривога. Внаслідок атаки у Київській області пошкоджено будинки.',
    null,
  ],
];

for (const [text, expected] of cases) {
  const actual = kovaAlertEvent(text);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `KOVA parser mismatch for "${text}": expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }

  const expectedKind = expected?.kind ?? null;
  const actualKind = kovaAlertKind(text);
  if (actualKind !== expectedKind) {
    throw new Error(
      `KOVA kind mismatch for "${text}": expected ${String(expectedKind)}, got ${String(actualKind)}`,
    );
  }
}

const footerCases = [
  [
    '🟢 Бориспільський район — відбій повітряної тривоги⚠️ Зверніть увагу, повітряна тривога досі триває у:- Броварський район',
    { kind: 'clear', adminArea: 'Бориспільський район' },
  ],
  [
    '🟢 Обухівський район — відбій повітряної тривоги\n⚠️ Зверніть увагу, повітряна тривога досі триває у:\n- Вишгородський район',
    { kind: 'clear', adminArea: 'Обухівський район' },
  ],
  ['🔴 Київська область — повітряна тривога, червоний рівень: Ракетна загроза (червоний рівень)', { kind: 'start', adminArea: 'Kyiv Oblast' }],
  ['🟢 Київська область — відбій повітряної тривоги', { kind: 'clear', adminArea: 'Kyiv Oblast' }],
];
for (const [text, expected] of footerCases) {
  const actual = kovaAlertEvent(text);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`KOVA footer case mismatch for "${text}": expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const post = (number, time, text) => ({
  id: `kyivoda/${number}`,
  time,
  text,
  url: `https://t.me/kyivoda/${number}`,
});
const RED_OBLAST = '🔴 Київська область — повітряна тривога, червоний рівень: Ракетна загроза (червоний рівень)';
const nowMs = Date.parse('2026-11-22T20:00:00Z');

// Production regression, KOVA posts 61910/61911 (19 Oct 2026): a whole-oblast
// start followed by a whole-oblast clear must close every raion interval.
const wholeOblastClear = buildKovaIntervals([
  post(61910, '2026-10-18T23:59:01.000Z', RED_OBLAST),
  post(61911, '2026-10-19T00:47:16.000Z', '🟢 Київська область — відбій повітряної тривоги'),
], { nowMs });
assertEqual(wholeOblastClear.length, 7, 'whole-oblast start expands to every raion');
assertEqual(
  wholeOblastClear.every((item) => item.endedAt === '2026-10-19T00:47:16.000Z'),
  true,
  'whole-oblast clear closes all expanded raion intervals',
);
assertEqual(
  new Set(wholeOblastClear.map((item) => item.externalId)).size,
  7,
  'expanded whole-oblast intervals have distinct external IDs',
);

// Production regression, KOVA post 61923 (19 Oct 2026): a whole-oblast start
// ended by per-raion clears only. No raion may stay open past its own clear.
const perRaionClears = buildKovaIntervals([
  post(61923, '2026-10-19T03:40:07.000Z', RED_OBLAST),
  post(61924, '2026-10-19T04:05:29.000Z', '🟢 Обухівський район — відбій повітряної тривоги'),
  post(61926, '2026-10-19T04:09:58.000Z', '🟢 Фастівський район — відбій повітряної тривоги'),
  post(61927, '2026-10-19T04:11:38.000Z', '🟢 Бучанський район — відбій повітряної тривоги'),
  post(61928, '2026-10-19T04:13:09.000Z', '🟢 Броварський район — відбій повітряної тривоги'),
  post(61929, '2026-10-19T04:13:28.000Z', '🟡 Вишгородський район — повітряна тривога, жовтий рівень: Дронова загроза (жовтий рівень)'),
  post(61941, '2026-10-19T06:40:09.000Z', '🟢 Білоцерківський район — відбій повітряної тривоги'),
  post(61942, '2026-10-19T06:41:20.000Z', '🟢 Бориспільський район — відбій повітряної тривоги⚠️ Зверніть увагу, повітряна тривога досі триває у:- Вишгородський район'),
  post(61950, '2026-10-19T07:50:00.000Z', '🟢 Вишгородський район — відбій повітряної тривоги'),
], { nowMs });
const endByArea = Object.fromEntries(
  perRaionClears
    .map((item) => [item.adminArea, item.endedAt])
    .sort(([a], [b]) => a.localeCompare(b, 'uk')),
);
assertEqual(endByArea, {
  'Білоцерківський район': '2026-10-19T06:40:09.000Z',
  'Бориспільський район': '2026-10-19T06:41:20.000Z',
  'Броварський район': '2026-10-19T04:13:09.000Z',
  'Бучанський район': '2026-10-19T04:11:38.000Z',
  'Вишгородський район': '2026-10-19T07:50:00.000Z',
  'Обухівський район': '2026-10-19T04:05:29.000Z',
  'Фастівський район': '2026-10-19T04:09:58.000Z',
}, 'per-raion clears close the expanded whole-oblast intervals');
assertEqual(perRaionClears.some((item) => item.endedAt === null), false, 'no interval remains open');

// Production regression, KOVA post 67210 (22 Nov 2026): the final footer-less
// clear of an episode must close the raion's interval.
const finalClear = buildKovaIntervals([
  post(67197, '2026-11-22T13:56:13.000Z', '🟡 Вишгородський район — повітряна тривога, жовтий рівень: Дронова загроза (жовтий рівень)'),
  post(67209, '2026-11-22T16:40:00.000Z', '🟢 Бучанський район — відбій повітряної тривоги⚠️ Зверніть увагу, повітряна тривога досі триває у:- Вишгородський район'),
  post(67210, '2026-11-22T16:44:45.000Z', '🟢 Вишгородський район — відбій повітряної тривоги'),
], { nowMs });
assertEqual(finalClear.map((item) => [item.adminArea, item.endedAt]), [
  ['Вишгородський район', '2026-11-22T16:44:45.000Z'],
], 'footer-less final clear closes the last raion');

// Unmatched starts older than the open window are dropped, never given an
// invented end; recent unmatched starts stay open.
const unmatched = buildKovaIntervals([
  post(1, '2026-11-01T10:00:00.000Z', '🔴 Фастівський район — повітряна тривога'),
  post(2, '2026-11-22T19:00:00.000Z', '🔴 Бучанський район — повітряна тривога'),
], { nowMs });
assertEqual(unmatched.map((item) => [item.adminArea, item.endedAt]), [
  ['Бучанський район', null],
], 'stale unmatched starts are dropped; recent ones stay open');

// Source contract: the Worker must read the plain feed. A Telegram search for
// "повітряна тривога" omits footer-less clear posts (root cause of the
// 19 Oct – 22 Nov 2026 stuck Kyiv Oblast interval).
const worker = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
const fetchStart = worker.indexOf('async function fetchKovaPage');
const fetchEnd = worker.indexOf('\n}\n', fetchStart);
if (fetchStart < 0 || fetchEnd < 0) throw new Error('Unable to locate fetchKovaPage in worker/index.ts');
if (/searchParams\.set\(\s*['"]q['"]/.test(worker.slice(fetchStart, fetchEnd))) {
  throw new Error('fetchKovaPage must read the plain KOVA feed, not a Telegram search (q=)');
}
for (const required of ['buildKovaIntervals(', 'kovaStartAreas(event)', 'fetchKovaPostsSinceCheckpoint(env)']) {
  if (!worker.includes(required)) throw new Error(`worker/index.ts no longer uses ${required}`);
}

console.log(
  `Validated ${cases.length + footerCases.length} KOVA alert parser cases and 5 interval regression scenarios.`,
);
