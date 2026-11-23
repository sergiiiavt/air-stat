// Generates the static editorial pages in public/ from shared/seo-static-pages.mjs.
//   node scripts/build-seo-pages.mjs          write files
//   node scripts/build-seo-pages.mjs --check  fail if any file is stale
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderDocument } from '../shared/seo-layout.mjs';
import { CONTENT_UPDATED, NOT_FOUND_PAGE, STATIC_PAGES } from '../shared/seo-static-pages.mjs';

const check = process.argv.includes('--check');
const stale = [];

for (const page of [...STATIC_PAGES, NOT_FOUND_PAGE]) {
  const html = renderDocument({ dateModified: page.noCanonical ? undefined : CONTENT_UPDATED, ...page });
  const file = join('public', page.file);
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== html) stale.push(file);
    continue;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log('wrote', file);
}

if (check && stale.length) {
  console.error(`Stale generated SEO pages (run npm run build:seo-pages): ${stale.join(', ')}`);
  process.exit(1);
}
if (check) console.log('Generated SEO pages are up to date.');
