// Search-engine facing routes: archive pages (/stats/...), sitemap, open-data
// CSV, the dashboard shell with a live server-rendered summary, /progress
// noindex and IndexNow submission. Anything that fails here degrades to the
// plain static asset instead of a JSON 500.
import { computeAlertHistory, addDays } from '../shared/seo-stats.mjs';
import {
  STATS_SCOPES, computeRangeFor, coverageStartFor, historyCsv, parseStatsPath, periodExists,
  renderSitemap, renderStatsPage, statsInventory, statsPath,
} from '../shared/seo-pages.mjs';
import { CONTENT_UPDATED, STATIC_PAGES } from '../shared/seo-static-pages.mjs';
import { esc, formatDate, formatDuration, formatNumber, pluralUk, SITE_ORIGIN } from '../shared/seo-layout.mjs';

type SeoEnv = {
  DB: D1Database;
  ASSETS: Fetcher;
};

type StatsSlug = keyof typeof STATS_SCOPES;

export const CANONICAL_HOST = 'air-alert-stat.com';
// Public by design: search engines fetch /<key>.txt to verify submissions.
export const INDEXNOW_KEY = 'a4556c5c8191c37591ebf699ba911c0f';
// Bump when page templates change so edge-cached HTML is not served stale.
const RENDER_VERSION = '2026-11-24.2';
const INDEXNOW_STATE_KEY = 'seo_indexnow_submitted_on';

const kyivDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
});

function kyivToday(now = new Date()) {
  return kyivDateFormat.format(now);
}

function cacheKey(path: string) {
  return new Request(`${SITE_ORIGIN}${path}${path.includes('?') ? '&' : '?'}__v=${RENDER_VERSION}`);
}

/** Edge-cache a successful response for ttlSeconds; browsers get a short max-age. */
async function cached(path: string, ttlSeconds: number, browserSeconds: number, build: () => Promise<Response>) {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = cacheKey(path);
  const hit = await cache.match(key);
  if (hit) {
    const fresh = new Response(hit.body, hit);
    fresh.headers.set('cache-control', `public, max-age=${browserSeconds}`);
    return fresh;
  }
  const response = await build();
  if (response.status !== 200) return response;
  const body = await response.arrayBuffer();
  const stored = new Response(body, response);
  stored.headers.set('cache-control', `public, max-age=${ttlSeconds}`);
  await cache.put(key, stored.clone());
  const returned = new Response(body, response);
  returned.headers.set('cache-control', `public, max-age=${browserSeconds}`);
  return returned;
}

async function loadHistory(env: SeoEnv, slug: StatsSlug, from: string, until: string) {
  const scope = STATS_SCOPES[slug].scope;
  const rows = await env.DB.prepare(
    `SELECT started_at, ended_at, local_date
     FROM alert_events
     WHERE alert_type = 'air_raid' AND scope = ? AND local_date >= ? AND local_date <= ?`,
  ).bind(scope, addDays(from, -3), until).all<{ started_at: string; ended_at: string | null; local_date: string }>();
  return computeAlertHistory(rows.results, { coverageFrom: from, until, now: new Date().toISOString() });
}

async function notFound(env: SeoEnv, request: Request) {
  // Unknown paths fall through to the static 404 page (assets not_found_handling).
  const response = await env.ASSETS.fetch(new Request(new URL('/__not-found__', request.url), { method: 'GET' }));
  return new Response(response.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } });
}

function redirect(location: string, status = 301) {
  return new Response(null, { status, headers: { location, 'cache-control': 'public, max-age=3600' } });
}

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function statsPage(env: SeoEnv, pathname: string, request: Request) {
  const route = parseStatsPath(pathname);
  if (!route) return null;
  if ('redirect' in route && route.redirect) return redirect(route.redirect);
  if ('notFound' in route || !('slug' in route)) return notFound(env, request);
  const today = kyivToday();
  if (!periodExists(route, today)) return notFound(env, request);
  const range = computeRangeFor(route, today);
  const current = route.kind === 'hub'
    || (route.kind === 'year' && route.period === today.slice(0, 4))
    || (route.kind === 'month' && route.period === today.slice(0, 7));
  return cached(pathname, current ? 1800 : 6 * 3600, 300, async () => {
    const history = await loadHistory(env, route.slug as StatsSlug, range.from, range.until);
    const page = renderStatsPage(route, history);
    if (!page) return notFound(env, request);
    return html(page.html);
  });
}

async function monthLastmods(env: SeoEnv) {
  const rows = await env.DB.prepare(
    `SELECT scope, substr(local_date, 1, 7) AS month, MAX(created_at) AS updated
     FROM alert_events
     WHERE alert_type = 'air_raid'
     GROUP BY scope, month`,
  ).all<{ scope: string; month: string; updated: string | null }>();
  const map = new Map<string, string>();
  for (const row of rows.results) {
    if (row.updated) map.set(`${row.scope}:${row.month}`, row.updated.slice(0, 10));
  }
  return map;
}

export function staticSitemapEntries() {
  const entries: Array<{ path: string; lang: string; alternates?: Record<string, string>; lastmod: string }> = [
    { path: '/', lang: 'uk', alternates: { uk: '/', en: '/en/' }, lastmod: CONTENT_UPDATED },
  ];
  for (const page of STATIC_PAGES) {
    entries.push({ path: page.path, lang: page.lang, alternates: page.alternates, lastmod: CONTENT_UPDATED });
  }
  return entries;
}

async function allSitemapEntries(env: SeoEnv) {
  const today = kyivToday();
  return [...staticSitemapEntries(), ...statsInventory(today, await monthLastmods(env))];
}

async function sitemap(env: SeoEnv) {
  return cached('/sitemap.xml', 3600, 3600, async () => {
    const xml = renderSitemap(await allSitemapEntries(env));
    return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
  });
}

async function openDataCsv(env: SeoEnv, slug: StatsSlug) {
  return cached(`/open-data/${slug === 'kyiv' ? 'kyiv-city' : 'kyiv-oblast'}-daily.csv`, 3 * 3600, 1800, async () => {
    const today = kyivToday();
    const history = await loadHistory(env, slug, coverageStartFor(slug), today);
    return new Response(historyCsv(history), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `inline; filename="${slug === 'kyiv' ? 'kyiv-city' : 'kyiv-oblast'}-daily.csv"`,
        'access-control-allow-origin': '*',
      },
    });
  });
}

/** Server-rendered summary added to the dashboard's pre-render block (crawlers without JS see real numbers). */
async function homeSummaryHtml(env: SeoEnv) {
  const response = await cached('/__seo/home-summary', 1800, 0, async () => {
    const today = kyivToday();
    const from30 = addDays(today, -29);
    const [city, oblast] = await Promise.all([
      loadHistory(env, 'kyiv', coverageStartFor('kyiv'), today),
      loadHistory(env, 'kyiv-oblast', from30 < coverageStartFor('kyiv-oblast') ? coverageStartFor('kyiv-oblast') : from30, today),
    ]);
    const last30 = (days: Array<{ date: string; alertCount: number; alertSeconds: number }>) => days
      .filter((day) => day.date >= from30)
      .reduce((acc, day) => ({ count: acc.count + day.alertCount, seconds: acc.seconds + day.alertSeconds }), { count: 0, seconds: 0 });
    const alerts = (n: number) => `${formatNumber(n, 'uk')} ${pluralUk(n, 'тривога', 'тривоги', 'тривог')}`;
    const c30 = last30(city.days);
    const o30 = last30(oblast.days);
    const body = `<section aria-label="Підсумки"><h2>Повітряні тривоги: останні 30 днів</h2>
<ul>
<li>Київ: ${alerts(c30.count)}, ${esc(formatDuration(c30.seconds, 'uk'))}.</li>
<li>Київська область: ${alerts(o30.count)}, ${esc(formatDuration(o30.seconds, 'uk'))}.</li>
<li>Київ з ${esc(formatDate(coverageStartFor('kyiv'), 'uk'))}: ${alerts(city.total.alertCount)}, ${esc(formatDuration(city.total.alertSeconds, 'uk'))}.</li>
</ul>
<p>Детальніше: <a href="${statsPath('uk', 'kyiv')}">статистика тривог у Києві по роках і місяцях</a> · <a href="${statsPath('uk', 'kyiv', today.slice(0, 7))}">поточний місяць</a> · <a href="${statsPath('uk', 'kyiv-oblast')}">Київська область</a> · <a href="/open-data">відкриті дані</a> · <a href="/en/">English</a>.</p></section>`;
    return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  return response.text();
}

async function dashboardHome(env: SeoEnv, request: Request) {
  const asset = await env.ASSETS.fetch(request);
  if (asset.status !== 200 || !(asset.headers.get('content-type') ?? '').includes('text/html')) return asset;
  let summary = '';
  try {
    summary = await homeSummaryHtml(env);
  } catch (error) {
    console.error('home summary failed', error);
    return asset;
  }
  const response = new HTMLRewriter()
    .on('#pre-render-content', {
      element(element) {
        element.append(summary, { html: true });
      },
    })
    .transform(asset);
  const headers = new Headers(response.headers);
  headers.delete('etag');
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  return new Response(response.body, { status: 200, headers });
}

async function progressShell(env: SeoEnv, request: Request) {
  const asset = await env.ASSETS.fetch(new Request(new URL('/', request.url), request));
  const response = new HTMLRewriter()
    .on('meta[name="robots"]', { element(element) { element.setAttribute('content', 'noindex,follow'); } })
    .on('link[rel="canonical"]', { element(element) { element.remove(); } })
    .on('link[rel="alternate"]', { element(element) { element.remove(); } })
    .on('title', { element(element) { element.setInnerContent('Стан збору даних | Air Alert Stat'); } })
    .transform(asset);
  const headers = new Headers(response.headers);
  headers.delete('etag');
  headers.set('x-robots-tag', 'noindex');
  return new Response(response.body, { status: asset.status, headers });
}

/**
 * Handles SEO routes. Returns null when the request is not an SEO route, so the
 * caller can fall back to static assets.
 */
export async function handleSeoRequest(request: Request, env: SeoEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;

  // One canonical host for every Worker-rendered page (static assets carry canonical tags).
  if (url.hostname === `www.${CANONICAL_HOST}`) {
    url.hostname = CANONICAL_HOST;
    return redirect(url.toString());
  }

  const response = await routeSeo(request, env, url);
  if (response && url.hostname.endsWith('.workers.dev')) {
    // The workers.dev hostname duplicates the site; keep it out of search results.
    const copy = new Response(response.body, response);
    copy.headers.set('x-robots-tag', 'noindex');
    return copy;
  }
  return response;
}

async function routeSeo(request: Request, env: SeoEnv, url: URL): Promise<Response | null> {
  const { pathname } = url;
  try {
    if (pathname === '/') return await dashboardHome(env, request);
    if (pathname === '/progress' || pathname === '/progress/') return await progressShell(env, request);
    if (pathname === '/sitemap.xml') return await sitemap(env);
    if (pathname === '/open-data/kyiv-city-daily.csv') return await openDataCsv(env, 'kyiv');
    if (pathname === '/open-data/kyiv-oblast-daily.csv') return await openDataCsv(env, 'kyiv-oblast');
    if (pathname.startsWith('/open-data/')) return await notFound(env, request);
    const stats = await statsPage(env, pathname, request);
    if (stats) return stats;
  } catch (error) {
    console.error('SEO route failed', pathname, error);
    if (pathname === '/' || pathname.startsWith('/progress')) return env.ASSETS.fetch(request);
    return new Response('Temporarily unavailable', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '120', 'cache-control': 'no-store' },
    });
  }
  return null;
}

const INDEXNOW_ATTEMPT_KEY = 'seo_indexnow_last_attempt';
const INDEXNOW_RETRY_MS = 55 * 60_000;

async function stateValue(env: SeoEnv, key: string) {
  return (await env.DB.prepare('SELECT value FROM ingestion_state WHERE key = ?')
    .bind(key).first<{ value: string | null }>())?.value ?? null;
}

async function setState(env: SeoEnv, key: string, value: string) {
  await env.DB.prepare(
    `INSERT INTO ingestion_state(key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
  ).bind(key, value).run();
}

/**
 * Tell IndexNow engines (Bing, Yandex, Seznam, Naver…) which URLs changed since
 * the last successful submission. Every attempt is recorded in
 * ingestion_state.seo_indexnow_last_attempt (status, response excerpt or
 * error) because Workers logs are not persisted for this Worker.
 */
export async function submitIndexNow(env: SeoEnv) {
  const at = new Date().toISOString();
  const today = kyivToday();
  let urls: string[] = [];
  try {
    const last = await stateValue(env, INDEXNOW_STATE_KEY);
    const entries = await allSitemapEntries(env);
    urls = entries
      .filter((entry) => !last || (entry.lastmod ?? '') >= last)
      .map((entry) => `${SITE_ORIGIN}${entry.path}`)
      .slice(0, 10_000);
    if (!urls.length) {
      await setState(env, INDEXNOW_STATE_KEY, today);
      await setState(env, INDEXNOW_ATTEMPT_KEY, JSON.stringify({ at, status: 'nothing-to-submit', urls: 0 }));
      return { submitted: 0, status: 'nothing-to-submit' };
    }
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'user-agent': `air-alert-stat-indexnow/1.0 (+${SITE_ORIGIN}/)`,
      },
      body: JSON.stringify({
        host: CANONICAL_HOST,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });
    const body = (await response.text()).slice(0, 300);
    await setState(env, INDEXNOW_ATTEMPT_KEY, JSON.stringify({ at, status: response.status, urls: urls.length, body }));
    if (response.status !== 200 && response.status !== 202) {
      console.error('IndexNow submission failed', response.status, body);
      return { submitted: 0, status: response.status };
    }
    await setState(env, INDEXNOW_STATE_KEY, today);
    return { submitted: urls.length, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('IndexNow submission threw', message);
    await setState(env, INDEXNOW_ATTEMPT_KEY, JSON.stringify({ at, status: 'error', urls: urls.length, error: message.slice(0, 300) }))
      .catch(() => undefined);
    return { submitted: 0, status: 'error' };
  }
}

/** Called hourly from the minute cron: submit once per Kyiv day, retrying failures hourly. */
export async function maybeSubmitIndexNow(env: SeoEnv) {
  if ((await stateValue(env, INDEXNOW_STATE_KEY)) === kyivToday()) return { skipped: 'already-submitted' };
  const attempt = await stateValue(env, INDEXNOW_ATTEMPT_KEY);
  let lastAt = NaN;
  try {
    lastAt = attempt ? Date.parse(JSON.parse(attempt).at ?? '') : NaN;
  } catch {
    // A malformed record must not block submissions.
  }
  if (Number.isFinite(lastAt) && Date.now() - lastAt < INDEXNOW_RETRY_MS) return { skipped: 'recent-attempt' };
  return submitIndexNow(env);
}
