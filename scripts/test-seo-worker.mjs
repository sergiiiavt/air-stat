// Runs the real Worker (transpiled) against SQLite with every migration to
// check the SEO routes end to end: SQL, redirects, 404s, sitemap, CSV, and
// that open-data numbers equal the dashboard's /api/range for the same days.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { kyivLocalDate } from '../shared/alert-levels.mjs';

const dir = mkdtempSync(join(tmpdir(), 'air-stat-seo-'));
const db = new DatabaseSync(':memory:');
try {
  mkdirSync(join(dir, 'worker'));
  cpSync(new URL('../shared', import.meta.url), join(dir, 'shared'), { recursive: true });
  cpSync(new URL('../worker/query-utils.mjs', import.meta.url), join(dir, 'worker/query-utils.mjs'));
  for (const name of ['index', 'automated-research', 'seo']) {
    const source = readFileSync(new URL(`../worker/${name}.ts`, import.meta.url), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace("from './automated-research'", "from './automated-research.mjs'")
      .replace("from './seo'", "from './seo.mjs'");
    writeFileSync(join(dir, `worker/${name}.mjs`), output);
  }
  for (const file of readdirSync(new URL('../migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }

  // Kyiv City rows for the last 12 days: two overlapping sources, one overnight alert.
  const insert = db.prepare(`INSERT INTO alert_events (external_id, scope, local_date, started_at, ended_at, source_key)
    VALUES (?, 'kyiv-city', ?, ?, ?, ?)`);
  const now = Date.now();
  let n = 0;
  for (let d = 12; d >= 1; d--) {
    for (const hour of [1, 9, 21.5]) {
      const start = Math.floor((now - d * 86_400_000) / 3_600_000) * 3_600_000 + hour * 3_600_000;
      const end = start + (40 + (d % 5) * 25) * 60_000;
      if (end >= now) continue;
      insert.run(`kd-${n}`, kyivLocalDate(start), new Date(start).toISOString(), new Date(end).toISOString(), 'kyiv_open_data');
      insert.run(`ua-${n++}`, kyivLocalDate(start + 15_000), new Date(start + 15_000).toISOString(), new Date(end + 30_000).toISOString(), 'alerts_in_ua');
    }
  }

  const DB = {
    prepare(sql) {
      let args = [];
      const query = {
        bind(...values) { args = values; return query; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args), success: true }; },
        async run() { const info = db.prepare(sql).run(...args); return { success: true, meta: { changes: info.changes } }; },
      };
      return query;
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
  const notFoundHtml = readFileSync(new URL('../public/404.html', import.meta.url), 'utf8');
  const ASSETS = {
    async fetch(request) {
      const { pathname } = new URL(typeof request === 'string' ? request : request.url);
      if (pathname === '/__not-found__') return new Response(notFoundHtml, { status: 404, headers: { 'content-type': 'text/html' } });
      return new Response('asset', { status: 200, headers: { 'content-type': 'text/plain' } });
    },
  };
  const store = new Map();
  globalThis.caches = { default: {
    async match(key) { return store.get(key.url)?.clone() ?? null; },
    async put(key, response) { store.set(key.url, response); },
  } };
  const env = { DB, ASSETS };
  const { default: worker } = await import(pathToFileURL(join(dir, 'worker/index.mjs')));
  const get = (path, host = 'air-alert-stat.com') => worker.fetch(new Request(`https://${host}${path}`), env);
  const today = kyivLocalDate(now);
  const month = today.slice(0, 7);

  // Archive pages render from real SQL; oblast history comes from migration 0024.
  for (const path of ['/stats/kyiv', `/stats/kyiv/${month}`, `/en/stats/kyiv/${month}`, '/stats/kyiv-oblast/2023', '/stats/kyiv-oblast/2024-02', `/stats/kyiv/${today.slice(0, 4)}`]) {
    const response = await get(path);
    assert.equal(response.status, 200, `${path} status`);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.ok(html.includes(`<link rel="canonical" href="https://air-alert-stat.com${path}" />`), `${path} canonical`);
    assert.ok(!/\b(NaN|undefined)\b/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), `${path} renders values`);
  }
  const oblast2023 = await (await get('/stats/kyiv-oblast/2023')).text();
  assert.match(oblast2023, /зафіксовано [\d\s ]+ (повітрян)/, 'oblast 2023 has imported alerts');
  const cached = await get('/stats/kyiv-oblast/2023');
  assert.equal(cached.status, 200, 'second request is served from the edge cache');

  // Redirects and 404s.
  assert.equal((await get('/stats')).headers.get('location'), '/stats/kyiv');
  assert.equal((await get('/en/stats/kyiv/')).headers.get('location'), '/en/stats/kyiv');
  const www = await get('/stats/kyiv', 'www.air-alert-stat.com');
  assert.equal(www.status, 301);
  assert.equal(www.headers.get('location'), 'https://air-alert-stat.com/stats/kyiv');
  for (const path of ['/stats/lviv', '/stats/kyiv/2021-12', '/stats/kyiv/2099-01', '/stats/kyiv-oblast/2022-02', '/open-data/other.csv']) {
    const response = await get(path);
    assert.equal(response.status, 404, `${path} must be 404`);
    assert.match(await response.text(), /Сторінку не знайдено/);
  }
  const dev = await get('/stats/kyiv', 'air-stat-api.example.workers.dev');
  assert.equal(dev.headers.get('x-robots-tag'), 'noindex', 'workers.dev is noindex');

  // Sitemap: static + archive URLs with month lastmod from stored rows.
  const sitemap = await (await get('/sitemap.xml')).text();
  for (const path of ['/', '/en/', '/methodology', '/en/open-data', '/stats/kyiv', `/stats/kyiv/${month}`, '/en/stats/kyiv-oblast/2022-03']) {
    assert.ok(sitemap.includes(`<loc>https://air-alert-stat.com${path}</loc>`), `sitemap has ${path}`);
  }
  assert.ok(!sitemap.includes('/stats/kyiv-oblast/2022-02<'), 'no oblast month before coverage');
  assert.match(sitemap, /<loc>https:\/\/air-alert-stat\.com\/stats\/kyiv-oblast\/2024-02<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);

  // Open data equals the dashboard API for the same days.
  const csv = (await (await get('/open-data/kyiv-city-daily.csv')).text()).trim().split('\n');
  assert.equal(csv[0], 'date,alert_count,alert_seconds,alert_hours');
  const rows = new Map(csv.slice(1).map((line) => {
    const [date, count, seconds] = line.split(',');
    return [date, { count: Number(count), seconds: Number(seconds) }];
  }));
  const from = kyivLocalDate(now - 11 * 86_400_000);
  const to = kyivLocalDate(now - 86_400_000);
  const range = await (await get(`/api/range?from=${from}&to=${to}&scope=kyiv-city`)).json();
  let compared = 0;
  for (const day of range.days) {
    const row = rows.get(day.date);
    assert.ok(row, `CSV has ${day.date}`);
    assert.equal(row.count, day.alertCount, `count on ${day.date}`);
    assert.ok(Math.abs(row.seconds - day.alertSeconds) <= 1, `seconds on ${day.date}: ${row.seconds} vs ${day.alertSeconds}`);
    compared++;
  }
  assert.ok(compared >= 10, 'compared at least ten days');

  console.log(`SEO Worker routes passed (archive, redirects, 404s, sitemap, CSV = /api/range for ${compared} days).`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
