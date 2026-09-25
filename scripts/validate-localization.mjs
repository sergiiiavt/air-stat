import fs from 'node:fs';
import path from 'node:path';
import { validateLocalizedResearch } from './lib/research-validation.mjs';

const root = process.cwd();
const errors = validateLocalizedResearch(root);

for (const relative of ['src/App.tsx', 'src/components/MapPanel.tsx']) {
  const content = fs.readFileSync(path.join(root, relative), 'utf8');
  if (/\bincident\.summary\b/.test(content)) {
    errors.push(`${relative}: raw incident.summary must go through localized-content helpers`);
  }
  if (/\.textContent\s*=\s*incident\.verification/.test(content)) {
    errors.push(`${relative}: raw verification status must be localized`);
  }
}

if (errors.length) {
  console.error('Localization validation failed:');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}

console.log('Localization validation passed.');
