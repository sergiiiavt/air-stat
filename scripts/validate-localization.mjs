import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const index = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json'), 'utf8'));
const cyrillic = /[А-Яа-яІіЇїЄєҐґ]/u;
const latin = /[A-Za-z]/u;
const errors = [];

function textValues(localized) {
  if (!localized || typeof localized !== 'object') return [];
  const values = [];
  for (const key of ['areaName', 'summary', 'sourceLocationText']) {
    if (typeof localized[key] === 'string') values.push([key, localized[key]]);
  }
  for (const [index, item] of (localized.damage ?? []).entries()) {
    if (typeof item?.type === 'string') values.push([`damage[${index}].type`, item.type]);
    if (typeof item?.description === 'string') {
      values.push([`damage[${index}].description`, item.description]);
    }
  }
  return values;
}

for (const entry of index.files ?? []) {
  const file = path.join(root, entry.path);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const attack of doc.attacks ?? []) {
    if (typeof attack.summary === 'string' && cyrillic.test(attack.summary)) {
      errors.push(`${entry.path}: attack ${attack.id} canonical summary must be English`);
    }
  }

  for (const incident of doc.incidents ?? []) {
    if (typeof incident.summary === 'string' && cyrillic.test(incident.summary)) {
      errors.push(`${entry.path}: incident ${incident.id} canonical summary must be English`);
    }

    const localizations = incident.localizations;
    if (!localizations) continue;

    for (const locale of Object.keys(localizations)) {
      if (locale !== 'en' && locale !== 'uk') {
        errors.push(`${entry.path}: incident ${incident.id} unsupported locale ${locale}`);
      }
    }

    for (const [key, value] of textValues(localizations.en)) {
      if (cyrillic.test(value)) {
        errors.push(`${entry.path}: incident ${incident.id} localizations.en.${key} contains Cyrillic text`);
      }
    }

    for (const [key, value] of textValues(localizations.uk)) {
      if (latin.test(value) && !cyrillic.test(value)) {
        errors.push(`${entry.path}: incident ${incident.id} localizations.uk.${key} has no Ukrainian text`);
      }
    }
  }
}

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
