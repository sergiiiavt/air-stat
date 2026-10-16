import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const base = 'https://air-alert-stat.com';
const routes = ['/', '/kyiv-air-alerts.html', '/kyiv-oblast-alerts.html', '/methodology.html'];
const sitemap = read('public/sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.deepEqual(locs, routes.map((path) => base + path), 'Sitemap must list only canonical public pages');
const robots = read('public/robots.txt');
assert.ok(robots.includes('Sitemap: ' + base + '/sitemap.xml'));
assert.ok(robots.includes('Disallow: /api/'));
for (const route of routes) {
  const html = read(route === '/' ? 'index.html' : 'public' + route);
  assert.ok(html.includes('<html lang="uk">'), 'Wrong locale: ' + route);
  assert.ok(html.includes('<h1>'), 'Missing source-level heading: ' + route);
  assert.ok(html.includes('name="description"'), 'Missing description: ' + route);
  assert.ok(html.includes('rel="canonical" href="' + base + route + '"'), 'Missing canonical: ' + route);
  assert.ok(html.includes('property="og:title"'), 'Missing social title: ' + route);
  assert.ok(html.includes('application/ld+json'), 'Missing schema: ' + route);
  assert.ok(html.includes('<title>'), 'Missing title: ' + route);
  assert.ok(!html.includes('name="keywords"'), 'Avoid obsolete keyword stuffing: ' + route);
  if (route !== '/') {
    assert.ok(html.replace(/<[^>]+>/g, ' ').length > 1100, 'Editorial page too thin: ' + route);
    for (const match of html.matchAll(/href="(\/[^"?#]+)"/g)) {
      const path = match[1];
      if (path === '/progress') continue; // SPA route
      assert.ok(existsSync(path === '/' ? 'index.html' : 'public' + path), 'Broken link ' + path + ' in ' + route);
    }
  }
}
assert.ok(read('src/main.tsx').includes('pre-render-content'), 'Static introduction must be removed after React boot');
assert.ok(read('index.html').includes('noindex,follow'), 'Progress must be noindex');
assert.ok(!locs.includes(base + '/progress'), 'Progress must not be indexed via sitemap');
console.log('SEO metadata, sitemap, static content and link validation passed.');
