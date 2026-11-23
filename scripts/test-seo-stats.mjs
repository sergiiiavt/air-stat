// Archive statistics must equal the dashboard method, and archive pages must
// render complete, crawlable HTML for every route in the sitemap inventory.
import assert from 'node:assert/strict';
import { dailyAlertLevelSeconds, kyivLocalDate, partitionAlertWindows } from '../shared/alert-levels.mjs';
import { computeAlertHistory, createKyivClock } from '../shared/seo-stats.mjs';
import {
  computeRangeFor, historyCsv, parseStatsPath, periodExists, renderSitemap, renderStatsPage,
  statsInventory,
} from '../shared/seo-pages.mjs';

let seed = 20260224;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const NOW = '2026-11-23T20:40:00.000Z';
const nowMs = Date.parse(NOW);

function syntheticRows(from, density = 5) {
  const rows = [];
  let t = Date.parse(`${from}T00:00:00Z`) - 6 * 3600e3;
  while (t < nowMs) {
    t += random() * density * 3600e3 + 120e3;
    if (t >= nowMs) break;
    const duration = (3 + random() * 150) * 60e3;
    const open = t + duration > nowMs || random() < 0.0005;
    rows.push({ started_at: new Date(t).toISOString(), ended_at: open ? null : new Date(t + duration).toISOString(), local_date: kyivLocalDate(t) });
    // Second source reporting the same alert a few seconds later (overlap).
    if (random() < 0.35) {
      const s = t + random() * 40e3;
      rows.push({ started_at: new Date(s).toISOString(), ended_at: open ? null : new Date(s + duration + random() * 60e3).toISOString(), local_date: kyivLocalDate(s) });
    }
  }
  // Explicit edge cases: across midnight, across both DST switches, touching intervals.
  const edge = (start, end) => rows.push({ started_at: start, ended_at: end, local_date: kyivLocalDate(Date.parse(start)) });
  edge('2025-03-29T22:30:00.000Z', '2025-03-30T02:10:00.000Z');
  edge('2025-10-25T23:40:00.000Z', '2025-10-26T03:20:00.000Z');
  edge('2026-01-10T21:30:00.000Z', '2026-01-10T22:40:00.000Z');
  edge('2026-01-10T22:40:00.000Z', '2026-01-10T23:00:00.000Z');
  return rows;
}

// 1. Kyiv clock agrees with Intl on DST days.
const clock = createKyivClock(Date.parse('2022-01-01'), nowMs);
for (const iso of ['2025-03-30T00:59:59Z', '2025-03-30T01:00:00Z', '2025-10-26T00:59:59Z', '2025-10-26T01:00:00Z', '2026-07-01T12:00:00Z', '2026-01-01T00:00:00Z']) {
  assert.equal(clock.localDate(Date.parse(iso)), kyivLocalDate(iso), `Kyiv date mismatch at ${iso}`);
}
assert.equal(clock.midnight('2025-03-30'), Date.parse('2025-03-29T22:00:00Z'));
assert.equal(clock.midnight('2025-03-31'), Date.parse('2025-03-30T21:00:00Z'));

// 2. Equal to dashboard helpers (alert time) and daily_stats (counts).
const from = '2024-01-01';
const rows = syntheticRows(from);
const history = computeAlertHistory(rows, { coverageFrom: from, now: NOW });
const windows = partitionAlertWindows(rows.map((row, i) => ({
  id: String(i), scope: 'kyiv-city', localDate: row.local_date, startedAt: row.started_at,
  endedAt: row.ended_at ?? NOW, isActive: !row.ended_at, alertType: 'air_raid', alertLevel: 'unknown', threatTypes: [],
})), [], NOW);
const reference = new Map(dailyAlertLevelSeconds(windows, from, history.today).map((d) => [d.date, d.yellow + d.red + d.unknown]));
const referenceCounts = new Map();
for (const date of new Set(rows.map((row) => row.local_date))) {
  const list = rows.filter((row) => row.local_date === date)
    .map((row) => ({ s: Date.parse(row.started_at), e: Math.min(row.ended_at ? Date.parse(row.ended_at) : nowMs, nowMs) }))
    .sort((a, b) => a.s - b.s || a.e - b.e);
  let count = 0;
  let maxEnd = -Infinity;
  for (const item of list) {
    if (item.s > maxEnd) count++;
    maxEnd = Math.max(maxEnd, item.e);
  }
  referenceCounts.set(date, count);
}
for (const day of history.days) {
  assert.ok(Math.abs((reference.get(day.date) ?? 0) - day.alertSeconds) <= 1, `alert seconds differ on ${day.date}`);
  assert.equal(day.alertCount, referenceCounts.get(day.date) ?? 0, `alert count differs on ${day.date}`);
}
const hourTotal = history.total.hourSeconds.reduce((a, b) => a + b, 0);
assert.ok(Math.abs(hourTotal - history.total.alertSeconds) <= history.days.length, 'hour-of-day seconds must add up to alert time');
assert.equal(history.months.reduce((a, m) => a + m.alertCount, 0), history.total.alertCount, 'monthly counts add up');
assert.ok(history.total.longest && history.total.longest.seconds > 0, 'longest alert computed');

// 3. CPU guard: a full oblast-sized history (~15k rows) stays cheap.
const big = syntheticRows('2022-03-15', 2.2);
const started = performance.now();
computeAlertHistory(big, { coverageFrom: '2022-03-15', now: NOW });
const elapsed = performance.now() - started;
assert.ok(elapsed < 600, `history computation too slow: ${elapsed.toFixed(0)} ms for ${big.length} rows`);

// 4. Routing.
assert.deepEqual(parseStatsPath('/stats'), { redirect: '/stats/kyiv' });
assert.deepEqual(parseStatsPath('/en/stats/'), { redirect: '/en/stats/kyiv' });
assert.deepEqual(parseStatsPath('/stats/kyiv/2026-10/'), { redirect: '/stats/kyiv/2026-10' });
assert.equal(parseStatsPath('/stats/lviv')?.notFound, true);
assert.equal(parseStatsPath('/stats/kyiv/2026-13')?.notFound, true);
assert.equal(parseStatsPath('/statistics'), null);
assert.equal(periodExists(parseStatsPath('/stats/kyiv/2022-01'), '2026-11-23'), false, 'before coverage');
assert.equal(periodExists(parseStatsPath('/stats/kyiv/2026-12'), '2026-11-23'), false, 'future month');
assert.equal(periodExists(parseStatsPath('/stats/kyiv-oblast/2022-02'), '2026-11-23'), false, 'oblast starts in March 2022');
assert.equal(periodExists(parseStatsPath('/stats/kyiv/2022-02'), '2026-11-23'), true);

// 5. Every inventory URL renders a complete page.
const today = '2026-11-23';
const inventory = statsInventory(today);
assert.equal(new Set(inventory.map((e) => e.path)).size, inventory.length, 'inventory URLs are unique');
const allRows = syntheticRows('2022-02-25', 6);
const sample = inventory.filter((entry, index) => index % 7 === 0 || /\/(2022-0[23]|2026-1[01]|2026)$/.test(entry.path) || !/\d/.test(entry.path));
for (const entry of sample) {
  const route = parseStatsPath(entry.path);
  assert.ok(route?.slug && periodExists(route, today), `inventory route must exist: ${entry.path}`);
  const range = computeRangeFor(route, today);
  const h = computeAlertHistory(allRows.filter((r) => r.local_date >= range.from && r.local_date <= range.until), { coverageFrom: range.from, until: range.until, now: NOW });
  const page = renderStatsPage(route, h);
  assert.ok(page, `no page for ${entry.path}`);
  const { html } = page;
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  assert.ok(!/\b(undefined|NaN|null)\b|\[object/.test(text), `bad token in ${entry.path}`);
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `one h1: ${entry.path}`);
  assert.ok(html.includes(`<link rel="canonical" href="https://air-alert-stat.com${entry.path}" />`), `canonical: ${entry.path}`);
  assert.ok(html.includes(`hreflang="uk" href="https://air-alert-stat.com${entry.alternates.uk}"`), `hreflang uk: ${entry.path}`);
  assert.ok(html.includes(`hreflang="en" href="https://air-alert-stat.com${entry.alternates.en}"`), `hreflang en: ${entry.path}`);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.ok(ld['@graph'].some((n) => n['@type'] === 'BreadcrumbList'), `breadcrumbs: ${entry.path}`);
  assert.ok(text.length > 1500, `thin page: ${entry.path}`);
  if (entry.path.endsWith('/2022-02')) assert.ok(html.includes('до початку архіву') || html.includes('before the archive starts'), 'days before coverage are labelled');
}

// 6. Sitemap and CSV.
const xml = renderSitemap(inventory);
assert.equal((xml.match(/<url>/g) ?? []).length, inventory.length);
assert.ok(xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
const csv = historyCsv(history).trim().split('\n');
assert.equal(csv[0], 'date,alert_count,alert_seconds,alert_hours');
assert.equal(csv.length - 1, history.days.length);

console.log(`SEO archive tests passed (${inventory.length} archive URLs, ${sample.length} rendered, full history ${elapsed.toFixed(0)} ms).`);
