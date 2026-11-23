// Weekly production SEO audit: crawls every sitemap URL like a search engine
// would and checks status, canonical, robots, hreflang reciprocity, titles,
// descriptions, structured data and host/redirect hygiene.
//   node scripts/audit-seo-production.mjs [--base https://air-alert-stat.com] [--limit N]
// Prints a summary (also to $GITHUB_STEP_SUMMARY) and exits 1 on errors.
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const BASE = option('--base', process.env.PRODUCTION_BASE_URL || 'https://air-alert-stat.com').replace(/\/$/, '');
const LIMIT = Number(option('--limit', '0')) || Infinity;
const UA = 'air-stat-seo-audit/1.0 (+https://github.com/sergiiiavt/air-stat)';

const errors = [];
const warnings = [];
const stats = { urls: 0, bytes: 0, slowest: { url: '', ms: 0 } };

async function get(url, init = {}) {
  const started = performance.now();
  const response = await fetch(url, { redirect: 'manual', ...init, headers: { 'user-agent': UA, accept: 'text/html,application/xml;q=0.9,*/*;q=0.8', ...(init.headers || {}) } });
  const ms = performance.now() - started;
  return { response, ms };
}

function attr(html, regex) {
  return (html.match(regex) ?? [])[1] ?? null;
}

async function auditPage(loc, alternatesFromSitemap, seen) {
  const { response, ms } = await get(loc);
  stats.urls++;
  if (ms > stats.slowest.ms) stats.slowest = { url: loc, ms };
  if (response.status !== 200) {
    errors.push(`${loc}: HTTP ${response.status}${response.headers.get('location') ? ` → ${response.headers.get('location')}` : ''}`);
    return;
  }
  const html = await response.text();
  stats.bytes += html.length;
  const canonical = attr(html, /<link\s+rel="canonical"\s+href="([^"]+)"/);
  if (canonical !== loc) errors.push(`${loc}: canonical is ${canonical}`);
  const robots = attr(html, /<meta\s+name="robots"\s+content="([^"]+)"/) ?? '';
  if (/noindex/.test(robots) || /noindex/.test(response.headers.get('x-robots-tag') ?? '')) errors.push(`${loc}: noindex on a sitemap URL`);
  const title = attr(html, /<title>([^<]*)<\/title>/) ?? '';
  if (title.length < 20) errors.push(`${loc}: title too short (${title.length})`);
  else if (title.length > 100) warnings.push(`${loc}: long title (${title.length} chars)`);
  if (seen.titles.has(title)) warnings.push(`${loc}: duplicate title with ${seen.titles.get(title)}`);
  seen.titles.set(title, loc);
  // Attributes may be split over lines (index.html is hand-formatted).
  const description = attr(html, /<meta\s+name="description"\s+content="([^"]*)"/) ?? '';
  if (description.length < 70) errors.push(`${loc}: description too short (${description.length})`);
  else if (description.length > 320) warnings.push(`${loc}: long description (${description.length})`);
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1s !== 1) warnings.push(`${loc}: ${h1s} h1 elements in server HTML`);
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); } catch { errors.push(`${loc}: invalid JSON-LD`); }
  }
  const hreflang = Object.fromEntries([...html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  for (const [lang, href] of Object.entries(alternatesFromSitemap)) {
    if (hreflang[lang] !== href) errors.push(`${loc}: hreflang ${lang} is ${hreflang[lang] ?? 'missing'}, sitemap says ${href}`);
  }
  seen.hreflang.set(loc, hreflang);
  if (!html.includes('property="og:image"')) warnings.push(`${loc}: no og:image`);
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  if (/\b(undefined|NaN)\b/.test(text)) errors.push(`${loc}: broken value in visible text`);
}

async function main() {
  // Host and protocol hygiene.
  const checks = [
    ['www redirects to apex', `${BASE.replace('://', '://www.')}/stats/kyiv`, (r) => [301, 308].includes(r.status) && (r.headers.get('location') || '').startsWith(BASE)],
    ['legacy .html redirects', `${BASE}/methodology.html`, (r) => [301, 307, 308].includes(r.status)],
    ['unknown URL is 404', `${BASE}/no-such-page-${Date.now()}`, (r) => r.status === 404],
    ['/progress is noindex', `${BASE}/progress`, (r) => (r.headers.get('x-robots-tag') || '').includes('noindex')],
    ['robots.txt reachable', `${BASE}/robots.txt`, (r) => r.status === 200],
    ['share image reachable', `${BASE}/og-image.png`, (r) => r.status === 200],
  ];
  for (const [label, url, ok] of checks) {
    try {
      const { response } = await get(url);
      if (!ok(response)) errors.push(`${label}: ${url} → HTTP ${response.status} ${response.headers.get('location') ?? ''}`.trim());
    } catch (error) {
      errors.push(`${label}: ${url} failed (${error.message})`);
    }
  }
  const robots = await (await get(`${BASE}/robots.txt`)).response.text();
  if (!robots.includes(`Sitemap: ${BASE}/sitemap.xml`)) errors.push('robots.txt does not reference the sitemap');
  if (/^Disallow:\s*\/\s*$/m.test(robots)) errors.push('robots.txt blocks the whole site');

  const sitemapResponse = (await get(`${BASE}/sitemap.xml`)).response;
  if (sitemapResponse.status !== 200) throw new Error(`sitemap.xml HTTP ${sitemapResponse.status}`);
  const xml = await sitemapResponse.text();
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: attr(m[1], /<loc>([^<]+)<\/loc>/),
    alternates: Object.fromEntries([...m[1].matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((x) => [x[1], x[2]])),
  })).slice(0, LIMIT);
  if (!entries.length) throw new Error('sitemap.xml has no URLs');

  const seen = { titles: new Map(), hreflang: new Map() };
  const queue = [...entries];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      try { await auditPage(entry.loc, entry.alternates, seen); } catch (error) { errors.push(`${entry.loc}: ${error.message}`); }
    }
  });
  await Promise.all(workers);

  // hreflang reciprocity across crawled pages.
  for (const [loc, alternates] of seen.hreflang) {
    for (const [lang, href] of Object.entries(alternates)) {
      if (lang === 'x-default' || href === loc) continue;
      const back = seen.hreflang.get(href);
      if (back && !Object.values(back).includes(loc)) errors.push(`${loc}: hreflang ${lang} → ${href} is not reciprocal`);
    }
  }

  const summary = [
    `## SEO audit for ${BASE}`,
    '',
    `- Sitemap URLs crawled: ${stats.urls}`,
    `- HTML bytes: ${Math.round(stats.bytes / 1024)} KiB; slowest: ${stats.slowest.url} (${Math.round(stats.slowest.ms)} ms)`,
    `- Errors: ${errors.length}`,
    `- Warnings: ${warnings.length}`,
    '',
    ...errors.slice(0, 100).map((e) => `- ❌ ${e}`),
    ...warnings.slice(0, 100).map((w) => `- ⚠️ ${w}`),
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (errors.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
