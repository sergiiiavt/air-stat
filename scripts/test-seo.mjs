// Offline SEO contract: static pages, metadata, hreflang, structured data,
// internal links, routing config and generated files. Production checks live
// in scripts/smoke-production-oblast.mjs and scripts/audit-seo-production.mjs.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { STATIC_PAGES, NOT_FOUND_PAGE } from '../shared/seo-static-pages.mjs';
import { parseStatsPath, periodExists } from '../shared/seo-pages.mjs';

const read = (path) => readFileSync(path, 'utf8');
const base = 'https://air-alert-stat.com';

// 1. Generated static pages are current.
execFileSync(process.execPath, ['scripts/build-seo-pages.mjs', '--check'], { stdio: 'inherit' });

// 2. Every indexable static page.
const pages = [
  { file: 'index.html', path: '/', lang: 'uk', alternates: { uk: '/', en: '/en/' } },
  ...STATIC_PAGES.map((page) => ({ file: `public/${page.file}`, path: page.path, lang: page.lang, alternates: page.alternates })),
];
const byPath = new Map(pages.map((page) => [page.path, page]));
const today = new Date().toISOString().slice(0, 10);
const workerRoutes = new Set(['/', '/progress', '/sitemap.xml', '/open-data/kyiv-city-daily.csv', '/open-data/kyiv-oblast-daily.csv']);

function linkTargetExists(path) {
  if (workerRoutes.has(path)) return true;
  const stats = parseStatsPath(path);
  if (stats) return Boolean(stats.slug) && periodExists(stats, today);
  if (path.endsWith('/')) return existsSync(`public${path}index.html`);
  return existsSync(`public${path}`) || existsSync(`public${path}.html`);
}

for (const page of pages) {
  const html = read(page.file);
  const label = `${page.file} (${page.path})`;
  assert.ok(html.includes(`<html lang="${page.lang}">`), `Wrong or missing lang: ${label}`);
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `Exactly one h1 required: ${label}`);
  const title = (html.match(/<title>([^<]+)<\/title>/) ?? [])[1] ?? '';
  assert.ok(title.length >= 20 && title.length <= 110, `Title length ${title.length}: ${label}`);
  const description = (html.match(/name="description"\s+content="([^"]+)"/) ?? [])[1] ?? '';
  assert.ok(description.length >= 70 && description.length <= 320, `Description length ${description.length}: ${label}`);
  assert.ok(html.includes(`rel="canonical" href="${base}${page.path}"`), `Canonical must be ${page.path}: ${label}`);
  assert.ok(!/href="\/[^"?#]+\.html"/.test(html), `Internal .html links are legacy redirects: ${label}`);
  assert.ok(html.includes('property="og:image" content="https://air-alert-stat.com/og-image.png"'), `Missing og:image: ${label}`);
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'), `Missing large twitter card: ${label}`);
  assert.ok(!html.includes('name="keywords"'), `Avoid obsolete keyword meta: ${label}`);
  assert.ok(html.includes('name="robots" content="index,follow'), `Indexable page needs index,follow robots meta: ${label}`);

  // hreflang: self + reciprocal alternate + x-default.
  for (const [lang, path] of Object.entries(page.alternates)) {
    assert.ok(html.includes(`hreflang="${lang}" href="${base}${path}"`), `Missing hreflang ${lang}: ${label}`);
    const other = byPath.get(path);
    assert.ok(other, `hreflang target is not a known page: ${path} from ${label}`);
    assert.deepEqual(other.alternates, page.alternates, `hreflang must be reciprocal between ${page.path} and ${path}`);
  }
  assert.ok(html.includes(`hreflang="x-default" href="${base}${page.alternates.uk}"`), `Missing x-default: ${label}`);

  // JSON-LD parses and describes the page.
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.ok(blocks.length >= 1, `Missing JSON-LD: ${label}`);
  const graph = blocks.flatMap((block) => block['@graph'] ?? [block]);
  assert.ok(graph.some((node) => node['@type'] === 'WebSite'), `JSON-LD WebSite missing: ${label}`);
  for (const node of graph.filter((n) => n['@type'] === 'Dataset')) {
    assert.ok(node.name && node.description?.length >= 50 && node.description.length <= 5000, `Dataset name/description invalid: ${label}`);
    assert.ok(node.distribution?.every((d) => d.contentUrl?.startsWith(base)), `Dataset distribution must be absolute: ${label}`);
  }

  // Internal links resolve to a static file or a Worker route.
  for (const match of html.matchAll(/href="(\/[^"#]*)"/g)) {
    const href = match[1].replace(/&amp;/g, '&');
    const path = href.split('?')[0];
    if (['/favicon.svg', '/seo.css', '/site.webmanifest'].includes(path)) continue;
    assert.ok(linkTargetExists(path), `Broken internal link ${href} in ${label}`);
  }
  if (page.path !== '/') {
    assert.ok(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').length > 1400, `Editorial page too thin: ${label}`);
  }
}

// 3. 404 page.
const notFound = read(`public/${NOT_FOUND_PAGE.file}`);
assert.ok(notFound.includes('name="robots" content="noindex,follow"'), '404 page must be noindex');
assert.ok(!notFound.includes('rel="canonical"'), '404 page must not declare a canonical URL');

// 4. Dashboard shell.
const index = read('index.html');
assert.ok(index.includes('id="pre-render-content"'), 'Dashboard needs crawlable fallback content');
assert.ok(read('src/main.tsx').includes('pre-render-content'), 'Static introduction must be removed after React boot');
assert.ok(index.includes('noindex,follow'), 'Progress must stay noindex in the client too');
assert.ok(!read('src/App.tsx').includes("'Air Alert Stat — Київ'"), 'Dashboard title must describe the page');

// 5. Crawl/routing configuration.
const robots = read('public/robots.txt');
assert.ok(robots.includes(`Sitemap: ${base}/sitemap.xml`), 'robots.txt must point to the sitemap');
assert.ok(robots.includes('Disallow: /api/'), 'robots.txt must keep /api/ out of crawling');
assert.ok(!existsSync('public/sitemap.xml'), 'The sitemap is generated by the Worker; a static copy would go stale');
const wrangler = read('wrangler.jsonc');
assert.ok(wrangler.includes('"not_found_handling": "404-page"'), 'Unknown URLs must return 404, not the SPA shell (soft 404)');
for (const route of ['"/"', '"/progress"', '"/sitemap.xml"', '"/stats/*"', '"/en/stats/*"', '"/open-data/*"']) {
  assert.ok(wrangler.includes(route), `run_worker_first must include ${route}`);
}
const redirects = read('public/_redirects');
for (const legacy of ['kyiv-air-alerts', 'kyiv-oblast-alerts', 'methodology']) {
  assert.ok(redirects.includes(`/${legacy}.html /${legacy} 301`), `Legacy redirect missing for ${legacy}.html`);
}
assert.ok(read('public/_headers').includes('X-Robots-Tag: noindex'), 'workers.dev host must be noindex');

// 6. IndexNow key file matches the Worker constant.
const key = (read('worker/seo.ts').match(/INDEXNOW_KEY = '([0-9a-f]{32})'/) ?? [])[1];
assert.ok(key, 'IndexNow key constant missing');
assert.equal(read(`public/${key}.txt`).trim(), key, 'IndexNow key file must contain the key');

// 7. Share image is a 1200x630 PNG.
const png = readFileSync('public/og-image.png');
assert.equal(png.readUInt32BE(16), 1200, 'og-image width');
assert.equal(png.readUInt32BE(20), 630, 'og-image height');

console.log(`SEO contract passed for ${pages.length} indexable static pages.`);
