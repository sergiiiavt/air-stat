import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const DATA_FILE_PATTERN = /^data\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/;

const LOCALIZED_TEXT_KEYS = ['areaName', 'summary', 'sourceLocationText'];
const cyrillic = /[А-Яа-яІіЇїЄєҐґ]/u;
const latin = /[A-Za-z]/u;

const validatorCache = new Map();

function researchValidator(root) {
  const schemaPath = path.join(root, 'schema/daily-research.schema.json');
  const cached = validatorCache.get(schemaPath);
  if (cached) return cached;

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  validatorCache.set(schemaPath, validate);
  return validate;
}

/** Code-unit ordering, so generated file order is identical on every machine. */
export function compareStrings(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Drops the CRLF a Windows checkout introduces so content comparisons stay platform-neutral. */
export function readTextLf(fullPath) {
  return fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
}

/** Every data/YYYY/MM/YYYY-MM-DD.json present on disk, sorted by path. */
export function listArchiveFiles(root) {
  const base = path.join(root, 'data');
  if (!fs.existsSync(base)) return [];
  const out = [];

  for (const year of fs.readdirSync(base).filter((name) => /^\d{4}$/.test(name)).sort(compareStrings)) {
    const yearDir = path.join(base, year);
    if (!fs.statSync(yearDir).isDirectory()) continue;

    for (const month of fs.readdirSync(yearDir).filter((name) => /^\d{2}$/.test(name)).sort(compareStrings)) {
      const monthDir = path.join(yearDir, month);
      if (!fs.statSync(monthDir).isDirectory()) continue;

      for (const file of fs.readdirSync(monthDir).sort(compareStrings)) {
        const relative = `data/${year}/${month}/${file}`;
        if (DATA_FILE_PATTERN.test(relative)) out.push(relative);
      }
    }
  }

  return out.sort(compareStrings);
}

/** Rebuilds data/index.json from disk; revision always mirrors the document generatedAt. */
export function buildIndex(root) {
  const files = [];
  for (const relative of listArchiveFiles(root)) {
    const doc = JSON.parse(readTextLf(path.join(root, relative)));
    files.push({ path: relative, revision: doc.generatedAt });
  }
  return { schemaVersion: 1, files };
}

export function formatJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function describeAjvError(error) {
  const where = error.instancePath || '/';
  const params = error.params ?? {};

  if (error.keyword === 'enum' && Array.isArray(params.allowedValues)) {
    return `${where} must be one of [${params.allowedValues.join(', ')}]`;
  }
  if (error.keyword === 'required') {
    return `${where} is missing required property "${params.missingProperty}"`;
  }
  if (error.keyword === 'additionalProperties') {
    return `${where} has unknown property "${params.additionalProperty}"`;
  }
  if (error.keyword === 'const') {
    return `${where} must be ${JSON.stringify(params.allowedValue)}`;
  }
  return `${where} ${error.message}`;
}

/** Concise, agent-readable lines instead of a raw Ajv error dump. */
export function formatAjvErrors(errors, prefix) {
  const seen = new Set();
  const out = [];

  for (const error of errors ?? []) {
    const line = `${prefix}: ${describeAjvError(error)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }

  return out;
}

export function truncateErrors(errors, maxLines = 15, maxChars = 300) {
  const clipped = errors
    .slice(0, maxLines)
    .map((line) => (line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line));

  if (errors.length > maxLines) {
    clipped[maxLines - 1] = `and ${errors.length - maxLines + 1} more error(s)`;
  }

  return clipped;
}

/**
 * Schema, identity and attack-link validation for the whole archive, plus
 * index/disk agreement in both directions. Returns error strings instead of
 * throwing so the pipeline can feed them back to the research agent.
 */
export function validateResearchArchive(root) {
  const errors = [];
  const indexPath = path.join(root, 'data/index.json');

  if (!fs.existsSync(indexPath)) return ['data/index.json is missing'];

  let index;
  try {
    index = JSON.parse(readTextLf(indexPath));
  } catch (error) {
    return [`data/index.json is not valid JSON: ${error.message}`];
  }

  if (index.schemaVersion !== 1 || !Array.isArray(index.files)) {
    return ['data/index.json must contain { schemaVersion: 1, files: [...] }'];
  }

  const validate = researchValidator(root);
  const indexedPaths = new Set();
  const seenAttackIds = new Map();
  const seenIncidentIds = new Map();

  for (const entry of index.files) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.path !== 'string' ||
      typeof entry.revision !== 'string'
    ) {
      errors.push('data/index.json: every file entry must contain { path, revision }');
      continue;
    }

    const relativePath = entry.path;
    if (!DATA_FILE_PATTERN.test(relativePath)) {
      errors.push(`data/index.json: invalid research file path ${relativePath}`);
      continue;
    }
    if (indexedPaths.has(relativePath)) {
      errors.push(`data/index.json: duplicate path ${relativePath}`);
      continue;
    }
    indexedPaths.add(relativePath);

    const fullPath = path.join(root, relativePath);
    if (!fs.existsSync(fullPath)) {
      errors.push(`data/index.json: indexed research file does not exist: ${relativePath}`);
      continue;
    }

    let document;
    try {
      document = JSON.parse(readTextLf(fullPath));
    } catch (error) {
      errors.push(`${relativePath}: is not valid JSON: ${error.message}`);
      continue;
    }

    if (!validate(document)) {
      errors.push(...formatAjvErrors(validate.errors, relativePath));
      continue;
    }

    if (entry.revision !== document.generatedAt) {
      errors.push(`${relativePath}: index revision must equal document.generatedAt`);
    }

    const expectedDate = path.basename(relativePath, '.json');
    if (document.date !== expectedDate) {
      errors.push(`${relativePath}: document.date must equal ${expectedDate}`);
    }

    if (
      document.researchWindow.from > document.date ||
      document.researchWindow.to < document.date
    ) {
      errors.push(`${relativePath}: researchWindow must include document.date`);
    }

    const localIds = new Set();

    for (const attack of document.attacks) {
      if (localIds.has(attack.id)) {
        errors.push(`${relativePath}: duplicate id ${attack.id}`);
      }
      localIds.add(attack.id);

      if (attack.date !== document.date) {
        errors.push(`${relativePath}: attack ${attack.id} date must equal document.date`);
      }

      const previous = seenAttackIds.get(attack.id);
      if (previous) {
        errors.push(`${relativePath}: attack id ${attack.id} is already used in ${previous}`);
      } else {
        seenAttackIds.set(attack.id, relativePath);
      }
    }

    for (const incident of document.incidents) {
      if (localIds.has(incident.id)) {
        errors.push(`${relativePath}: duplicate id ${incident.id}`);
      }
      localIds.add(incident.id);

      if (incident.date !== document.date) {
        errors.push(`${relativePath}: incident ${incident.id} date must equal document.date`);
      }

      const previous = seenIncidentIds.get(incident.id);
      if (previous) {
        errors.push(`${relativePath}: incident id ${incident.id} is already used in ${previous}`);
      } else {
        seenIncidentIds.set(incident.id, relativePath);
      }

      const matchingAttacks = document.attacks.filter(
        (attack) => attack.date === incident.date && attack.scope === incident.scope,
      );

      if (incident.attackId) {
        const attack = document.attacks.find((candidate) => candidate.id === incident.attackId);
        if (!attack) {
          errors.push(
            `${relativePath}: incident ${incident.id} references missing attackId ${incident.attackId}`,
          );
        } else if (attack.date !== incident.date || attack.scope !== incident.scope) {
          errors.push(
            `${relativePath}: incident ${incident.id} attackId ${incident.attackId} has mismatched date/scope`,
          );
        }
      } else if (matchingAttacks.length > 1) {
        errors.push(
          `${relativePath}: incident ${incident.id} must set attackId because multiple attacks match its date/scope`,
        );
      }
    }
  }

  for (const relative of listArchiveFiles(root)) {
    if (!indexedPaths.has(relative)) {
      errors.push(`${relative}: research file on disk is missing from data/index.json`);
    }
  }

  return errors;
}

function localizedTextValues(localized) {
  if (!localized || typeof localized !== 'object') return [];
  const values = [];

  for (const key of LOCALIZED_TEXT_KEYS) {
    if (typeof localized[key] === 'string') values.push([key, localized[key]]);
  }
  for (const [position, item] of (localized.damage ?? []).entries()) {
    if (typeof item?.type === 'string') values.push([`damage[${position}].type`, item.type]);
    if (typeof item?.description === 'string') {
      values.push([`damage[${position}].description`, item.description]);
    }
  }

  return values;
}

/** English/Ukrainian separation for canonical and localized research text. */
export function validateLocalizedResearch(root) {
  const errors = [];

  for (const relative of listArchiveFiles(root)) {
    let doc;
    try {
      doc = JSON.parse(readTextLf(path.join(root, relative)));
    } catch {
      continue; // Unparsable files are already reported by validateResearchArchive.
    }

    for (const attack of doc.attacks ?? []) {
      if (typeof attack.summary === 'string' && cyrillic.test(attack.summary)) {
        errors.push(`${relative}: attack ${attack.id} canonical summary must be English`);
      }
    }

    for (const incident of doc.incidents ?? []) {
      if (typeof incident.summary === 'string' && cyrillic.test(incident.summary)) {
        errors.push(`${relative}: incident ${incident.id} canonical summary must be English`);
      }

      const localizations = incident.localizations;
      if (!localizations) continue;

      for (const locale of Object.keys(localizations)) {
        if (locale !== 'en' && locale !== 'uk') {
          errors.push(`${relative}: incident ${incident.id} unsupported locale ${locale}`);
        }
      }

      for (const [key, value] of localizedTextValues(localizations.en)) {
        if (cyrillic.test(value)) {
          errors.push(
            `${relative}: incident ${incident.id} localizations.en.${key} contains Cyrillic text`,
          );
        }
      }

      for (const [key, value] of localizedTextValues(localizations.uk)) {
        if (latin.test(value) && !cyrillic.test(value)) {
          errors.push(
            `${relative}: incident ${incident.id} localizations.uk.${key} has no Ukrainian text`,
          );
        }
      }
    }
  }

  return errors;
}
