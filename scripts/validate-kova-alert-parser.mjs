import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
const start = source.indexOf('function kovaAlertKind');
const end = source.indexOf('\n}\n\nfunction kovaThreatTypes', start);

if (start < 0 || end < 0) {
  throw new Error('Unable to locate kovaAlertKind in worker/index.ts');
}

const functionSource = source
  .slice(start, end + 2)
  .replace(
    "function kovaAlertKind(text: string): 'start' | 'clear' | null",
    'function kovaAlertKind(text)',
  );

const kovaAlertKind = new Function(
  functionSource + '\nreturn kovaAlertKind;',
)();

const cases = [
  ['🔴 Повітряна тривога в Київській області.', 'start'],
  ['🟢 Відбій повітряної тривоги в Київській області.', 'clear'],
  ['🔴 Київська область - повітряна тривога!', 'start'],
  ['🟢 Київська область - відбій повітряної тривоги!', 'clear'],
  [
    'Більше п’яти годин тривала повітряна тривога. Внаслідок атаки у Київській області пошкоджено будинки.',
    null,
  ],
  ['Бучанський район - відбій повітряної тривоги.', null],
];

for (const [text, expected] of cases) {
  const actual = kovaAlertKind(text);
  if (actual !== expected) {
    throw new Error(
      `KOVA parser mismatch for "${text}": expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

console.log(`Validated ${cases.length} KOVA alert parser regression cases.`);
