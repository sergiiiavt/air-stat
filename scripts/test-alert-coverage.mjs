import { readFileSync } from 'node:fs';
import { ALERT_COVERAGE, alertCoverageIncomplete, alertCoverageStart } from '../shared/alert-coverage.mjs';
import {
  buildMigration, KOVA_COVERAGE_START, kyivDate, kyivOblastIntervals, parseCsv,
} from './build-kyiv-oblast-alert-history.mjs';

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Coverage starts verified in D1 on 23 Nov 2026.
assertEqual(alertCoverageStart('kyiv-city'), '2022-02-25', 'Kyiv City coverage start');
assertEqual(alertCoverageStart('kyiv-oblast'), '2022-03-15', 'Kyiv Oblast coverage start');
assertEqual(alertCoverageStart('both'), '2022-03-15', 'combined scope uses the later start');
assertEqual(alertCoverageIncomplete('kyiv-oblast', '2022-03-01'), true, 'pre-coverage oblast period is flagged');
assertEqual(alertCoverageIncomplete('kyiv-oblast', '2022-03-15'), false, 'covered period is not flagged');
assertEqual(alertCoverageIncomplete('kyiv-city', '2022-03-01'), false, 'city is covered in March 2022');
assertEqual(ALERT_COVERAGE.map((entry) => entry.scope), ['kyiv-city', 'kyiv-oblast'], 'coverage scopes');

// Parser and generator behaviour on a dataset-shaped fixture.
const csv = [
  'oblast,raion,hromada,level,started_at,finished_at,source',
  'Київська область,,,oblast,2022-03-27 22:30:00+00:00,2022-03-27 23:10:00+00:00,official',
  'Київська область,,,oblast,2022-03-27 22:30:00+00:00,2022-03-27 23:10:00+00:00,official',
  'Київська область,Вишгородський район,,raion,2025-10-26 00:30:00+00:00,2025-10-26 01:30:00+00:00,official',
  'Київська область,,"м. Біла Церква, test",hromada,2022-04-01 10:00:00+00:00,2022-04-01 10:20:00+00:00,official',
  'Київська область,Бучанський район,,raion,2026-05-17 10:00:00+00:00,2026-05-17 11:00:00+00:00,official',
  'м. Київ,,,oblast,2022-03-27 22:30:00+00:00,2022-03-27 23:10:00+00:00,official',
].join('\n');
const intervals = kyivOblastIntervals(parseCsv(csv));
assertEqual(intervals.map((item) => item.externalId), [
  'sirens:oblast:Kyiv Oblast:2022-03-27T22:30:00.000Z',
  'sirens:hromada:м. Біла Церква, test:2022-04-01T10:00:00.000Z',
  'sirens:raion:Вишгородський район:2025-10-26T00:30:00.000Z',
], 'duplicates, other oblasts and post-KOVA rows are excluded; quoted commas parse');
// DST: 2022-03-27 22:30 UTC is already 28 March in Kyiv (UTC+3); 2025-10-26
// 00:30 UTC is 03:30 on 26 October (UTC+3 until 01:00 UTC).
assertEqual(intervals.map((item) => item.localDate), ['2022-03-28', '2022-04-01', '2025-10-26'], 'Europe/Kyiv dates');
assertEqual(kyivDate('2025-10-26T01:30:00.000Z'), '2025-10-26', 'post-DST-change date');
const sql = buildMigration(intervals, 'a'.repeat(40));
if (!sql.includes("'м. Біла Церква, test'") || !sql.includes('INSERT OR IGNORE INTO alert_events')) {
  throw new Error('generated SQL must quote values and insert idempotently');
}

// Committed migration contract.
const migration = readFileSync(new URL('../migrations/0024_import_kyiv_oblast_alert_history.sql', import.meta.url), 'utf8');
const rows = [...migration.matchAll(/^\('(sirens:[^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)', 'air_raid', '\[\]', 'air_raid_sirens_dataset', '([^']+)', '((?:[^']|'')+)', 'unknown'\)[,;]$/gmu)];
assertEqual(rows.length, 5184, 'migration row count');
if (new Set(rows.map((row) => row[1])).size !== rows.length) throw new Error('migration external IDs must be unique');
for (const row of rows) {
  const [, , scope, startedAt, endedAt, localDate, sourceUrl] = row;
  if (scope !== 'kyiv-oblast') throw new Error(`unexpected scope ${scope}`);
  if (!(startedAt < KOVA_COVERAGE_START)) throw new Error(`row starts inside KOVA coverage: ${startedAt}`);
  if (!(endedAt > startedAt)) throw new Error(`non-positive interval ${startedAt}`);
  if (kyivDate(startedAt) !== localDate) throw new Error(`wrong local_date for ${startedAt}`);
  if (!sourceUrl.startsWith('https://github.com/Vadimkin/ukrainian-air-raid-sirens-dataset/blob/71e44427923fa0a0d0dbf39e4a3405f51fef2b1d/')) {
    throw new Error('rows must carry the pinned dataset provenance URL');
  }
}
for (const statement of migration.split(';\n')) {
  if (Buffer.byteLength(statement) > 95_000) throw new Error('migration statement exceeds the D1 statement size budget');
}
assertEqual(rows[0][3], '2022-03-15T16:17:20.000Z', 'first imported interval');

console.log(`Validated alert coverage, dataset generator and ${rows.length}-row Kyiv Oblast history migration.`);
