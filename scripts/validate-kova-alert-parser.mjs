import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
const start = source.indexOf('const KOVA_RAIONS');
const end = source.indexOf('\n}\n\nfunction kovaThreatTypes', start);

if (start < 0 || end < 0) {
  throw new Error('Unable to locate KOVA parser in worker/index.ts');
}

const functionSource = source
  .slice(start, end + 2)
  .replace('] as const;', '];')
  .replace(
    'function kovaAlertEvent(text: string): KovaAlertEvent | null',
    'function kovaAlertEvent(text)',
  )
  .replace(
    "function kovaAlertKind(text: string): 'start' | 'clear' | null",
    'function kovaAlertKind(text)',
  );

const { kovaAlertEvent, kovaAlertKind } = new Function(
  functionSource + '\nreturn { kovaAlertEvent, kovaAlertKind };',
)();

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

console.log(`Validated ${cases.length} KOVA alert parser regression cases.`);
