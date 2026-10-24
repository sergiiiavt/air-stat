import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import {
  alertLevelFromCauses, dailyAlertLevelSeconds, normalizeKyivEvents,
  parseKyivTimestamp, partitionAlertWindows,
} from '../shared/alert-levels.mjs';

assert.equal(alertLevelFromCauses(['drone']), 'yellow');
assert.equal(alertLevelFromCauses(['missile']), 'red');
assert.equal(alertLevelFromCauses(['massive-drone']), 'red', 'Mass drone attacks must never be yellow');
assert.equal(alertLevelFromCauses(['missile-drone']), 'red');
assert.equal(alertLevelFromCauses([]), 'unknown');
assert.equal(alertLevelFromCauses(['new-provider-value']), 'unknown');
assert.equal(alertLevelFromCauses(['drone', 'missile']), 'unknown', 'Mixed archive has no transition times');
assert.equal(alertLevelFromCauses(['drone', 'missile'], 'missile'), 'red');
assert.equal(alertLevelFromCauses(['drone', 'missile'], 'drone'), 'yellow', 'Use the latest active cause, not the maximum');
assert.equal(alertLevelFromCauses(['drone'], 'missile'), 'unknown', 'Reject an inactive last_cause');
assert.equal(parseKyivTimestamp('2026-10-24 12:00:00'), '2026-10-24T09:00:00.000Z');
assert.equal(parseKyivTimestamp('2026-10-26 12:00:00'), '2026-10-26T10:00:00.000Z');
assert.equal(parseKyivTimestamp('2026-10-24T12:00:00+03:00'), '2026-10-24T09:00:00.000Z');
assert.equal(parseKyivTimestamp('bad'), null);
assert.deepEqual(normalizeKyivEvents([
  { state: 0, created_at: '2026-09-20 14:00:00', causes: [] },
  { state: 1, created_at: '2026-09-20 13:00:00', cause: 'drone' },
  { state: 1, created_at: 'bad', causes: ['missile'] },
  { state: 7, created_at: '2026-09-20 12:00:00' },
]).map((e) => [e.at, e.state, e.level]), [
  ['2026-09-20T10:00:00.000Z', 1, 'yellow'], ['2026-09-20T11:00:00.000Z', 0, 'unknown'],
]);

const start = '2026-09-20T10:00:00.000Z';
const end = '2026-09-20T11:00:00.000Z';
const base = { id: 'official', scope: 'kyiv-city', localDate: '2026-09-20', startedAt: start,
  endedAt: end, isActive: false, alertType: 'air_raid', alertLevel: 'unknown',
  sourceKey: 'kyiv_open_data', threatTypes: ['uav'] };
const observation = (at, last, level) => ({ episodeStartedAt: start,
  observedAt: `2026-09-20T${at}.000Z`, lastObservedAt: `2026-09-20T${last}.000Z`, alertLevel: level });
const observations = [observation('10:00:00', '10:19:50', 'yellow'),
  observation('10:20:00', '10:39:50', 'red'), observation('10:40:00', '10:59:30', 'yellow')];
const duplicate = { ...base, id: 'other-source', sourceKey: 'alerts_in_ua' };
const colored = partitionAlertWindows([base, duplicate], observations, end);
assert.deepEqual(colored.map((w) => w.alertLevel), ['yellow', 'red', 'yellow']);
const daily = dailyAlertLevelSeconds(colored, '2026-09-20', '2026-09-20');
assert.deepEqual(daily, [{ date: '2026-09-20', scope: 'kyiv-city', yellow: 2400, red: 1200, unknown: 0 }]);
assert.equal(colored.reduce((s, w) => s + Date.parse(w.endedAt) - Date.parse(w.startedAt), 0), 3600000,
  'Source duplicates and level changes must not add alert time');
assert.ok(colored.every((w, i) => !i || w.startedAt >= colored[i - 1].endedAt));
const outage = partitionAlertWindows([{ ...base, alertLevel: 'yellow' }], [
  observation('10:00:00', '10:01:00', 'yellow'), observation('10:10:00', '10:59:00', 'red'),
], end);
assert.equal(outage[1].alertLevel, 'unknown');
assert.equal(outage[1].startedAt, '2026-09-20T10:03:30.000Z');
assert.equal(outage[1].endedAt, '2026-09-20T10:10:00.000Z');
const separatedScopes = partitionAlertWindows([base, { ...base, scope: 'kyiv-oblast', alertLevel: 'red' }], observations, end);
assert.equal(dailyAlertLevelSeconds(separatedScopes, '2026-09-20', '2026-09-20').find((d) => d.scope === 'kyiv-oblast').red, 3600);
assert.deepEqual(partitionAlertWindows([{ ...base, endedAt: start }]), []);
assert.equal(partitionAlertWindows([{ ...base, alertLevel: undefined }], [], end)[0].alertLevel, 'unknown');

const overnight = partitionAlertWindows([{ ...base, startedAt: '2026-10-24T20:30:00Z', endedAt: '2026-10-24T21:30:00Z', alertLevel: 'red' }], [], '2026-11-01T00:00:00Z');
assert.deepEqual(dailyAlertLevelSeconds(overnight, '2026-10-24', '2026-10-25').map((d) => [d.date, d.red]),
  [['2026-10-24', 1800], ['2026-10-25', 1800]]);
assert.equal(dailyAlertLevelSeconds(overnight, '2026-10-25', '2026-10-25')[0].red, 1800);
for (const [date, next, hours] of [['2026-10-25', '2026-10-26', 25], ['2026-03-29', '2026-03-30', 23]]) {
  const windows = partitionAlertWindows([{ ...base, startedAt: parseKyivTimestamp(`${date} 00:00:00`),
    endedAt: parseKyivTimestamp(`${next} 00:00:00`), alertLevel: 'yellow' }], [], '2026-11-01T00:00:00Z');
  assert.equal(dailyAlertLevelSeconds(windows, date, date)[0].yellow, hours * 3600, 'DST must use elapsed seconds');
}

// Exercise the actual Worker SQL and collector writes with all real migrations.
const dir = mkdtempSync(join(tmpdir(), 'air-stat-levels-'));
const db = new DatabaseSync(':memory:');
const realFetch = globalThis.fetch;
const RealDate = globalThis.Date;
try {
  mkdirSync(join(dir, 'worker'));
  cpSync(new URL('../shared', import.meta.url), join(dir, 'shared'), { recursive: true });
  cpSync(new URL('../worker/query-utils.mjs', import.meta.url), join(dir, 'worker/query-utils.mjs'));
  for (const name of ['index', 'automated-research']) {
    let source = readFileSync(new URL(`../worker/${name}.ts`, import.meta.url), 'utf8');
    if (name === 'index') source += '\nexport { syncKyivCityHistory, syncKyivCityState };';
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext } }).outputText.replace("from './automated-research'", "from './automated-research.mjs'");
    writeFileSync(join(dir, `worker/${name}.mjs`), output);
  }
  for (const file of readdirSync(new URL('../migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  const DB = {
    prepare(sql) {
      let args = [];
      const query = {
        bind(...values) { args = values; return query; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args), success: true }; },
        async run() { const info = db.prepare(sql).run(...args); return { success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } }; },
      };
      return query;
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
  const env = { DB };
  const { default: worker, syncKyivCityHistory, syncKyivCityState } = await import(pathToFileURL(join(dir, 'worker/index.mjs')));
  let current = { state: 1, causes: ['drone'], last_cause: 'drone', created_at: '2026-09-20 13:00:00' };
  globalThis.fetch = async (url) => Response.json(String(url).endsWith('/history') ? { items: [
    { state: 0, causes: [], created_at: '2026-09-20 14:00:00' },
    { state: 1, causes: ['drone', 'missile'], created_at: '2026-09-20 13:00:00' },
  ] } : { current });
  await syncKyivCityHistory(env);
  assert.equal(db.prepare('SELECT alert_level FROM alert_events').get().alert_level, 'unknown');
  await syncKyivCityHistory(env);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM alert_events').get().n, 1, 'History import is idempotent');
  assert.equal(db.prepare("SELECT value FROM ingestion_state WHERE key='kyiv_alert_levels_history_revision'").get().value, '1');

  let testNow = '2026-09-20T10:00:00.000Z';
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [testNow])); }
    static now() { return RealDate.parse(testNow); }
  };
  for (const [at, cause] of [['10:00:00', 'drone'], ['10:01:00', 'drone'], ['10:02:00', 'missile'], ['10:03:00', 'drone']]) {
    testNow = `2026-09-20T${at}.000Z`;
    current = { ...current, causes: ['drone', 'missile'], last_cause: cause };
    await syncKyivCityState(env);
  }
  assert.deepEqual(db.prepare('SELECT alert_level FROM kyiv_alert_level_observations ORDER BY id').all().map((r) => r.alert_level), ['yellow', 'red', 'yellow']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM alert_events').get().n, 1, 'Level changes must not create more alerts');
  assert.equal(db.prepare('SELECT ended_at FROM alert_events').get().ended_at, end, 'Current polling cannot reopen a closed historical row');
  globalThis.Date = RealDate;
  db.exec('DELETE FROM kyiv_alert_level_observations');
  const putObservation = db.prepare('INSERT INTO kyiv_alert_level_observations (episode_started_at, observed_at, last_observed_at, alert_level, causes_json) VALUES (?, ?, ?, ?, ?)');
  for (const o of observations) putObservation.run(o.episodeStartedAt, o.observedAt, o.lastObservedAt, o.alertLevel, '[]');
  db.prepare("INSERT INTO alert_events (external_id, scope, local_date, started_at, ended_at, source_key) VALUES ('duplicate', 'kyiv-city', '2026-09-20', ?, ?, 'alerts_in_ua')").run(start, end);
  const request = async (from, to, scope = 'kyiv-city') => {
    const response = await worker.fetch(new Request(`https://example.test/api/range?from=${from}&to=${to}&scope=${scope}`), env);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  };
  const payload = await request('2026-09-20', '2026-09-20');
  assert.equal(payload.stats.alertCount, 1);
  assert.equal(payload.stats.alertSeconds, 3600);
  assert.deepEqual(payload.stats.alertLevelSeconds, { yellow: 2400, red: 1200, unknown: 0 });
  assert.deepEqual(payload.days[0].alertLevelSeconds, payload.stats.alertLevelSeconds);
  assert.deepEqual(payload.alertWindows.map((w) => w.alertLevel), ['yellow', 'red', 'yellow']);
  if (process.env.ALERT_LEVEL_FIXTURE_PATH) writeFileSync(process.env.ALERT_LEVEL_FIXTURE_PATH, JSON.stringify(payload));
  db.exec('DELETE FROM alert_events; DELETE FROM kyiv_alert_level_observations');
  db.prepare("INSERT INTO alert_events (external_id, scope, local_date, started_at, ended_at, alert_level) VALUES ('overnight', 'kyiv-city', '2026-09-20', ?, ?, 'red')").run('2026-09-20T20:30:00.000Z', '2026-09-20T21:30:00.000Z');
  const nextDay = await request('2026-09-21', '2026-09-21');
  assert.equal(nextDay.stats.alertSeconds, 1800, 'Include alerts begun before the selected day');
  assert.equal(nextDay.days[0].alertLevelSeconds.red, 1800, 'Create a continuation day missing from daily_stats');
  const bothDays = await request('2026-09-20', '2026-09-21');
  assert.equal(bothDays.stats.alertCount, 1, 'An overnight episode is still one alert');
  assert.equal(bothDays.stats.alertSeconds, 3600);
  assert.equal(bothDays.days.reduce((s, d) => s + d.alertSeconds, 0), bothDays.stats.alertSeconds);
} finally {
  globalThis.fetch = realFetch;
  globalThis.Date = RealDate;
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log('Alert levels: classification, transitions, duplicate-source union, outage gaps, midnight/DST, migrations, collectors and range API passed.');
