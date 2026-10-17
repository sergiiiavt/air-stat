import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Both headers must expose one native, keyboard-accessible link around the
// entire logo and site name, not two separate click targets.
const homeLink = /<a className="brand" href="\/">\s*<span className="brand-mark">\s*<BrandMark \/>\s*<\/span>\s*<strong>Air Alert Stat<\/strong>\s*<\/a>/;

for (const component of ['App.tsx', 'ProgressPage.tsx']) {
  const source = readFileSync(new URL(`../src/${component}`, import.meta.url), 'utf8');
  assert.match(source, homeLink, `${component}: logo and title must link to the homepage together`);
}

console.log('Brand navigation tests passed.');
