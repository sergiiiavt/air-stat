import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema/daily-research.schema.json'), 'utf8'));
const indexPath = path.join(root, 'data/index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

if (index.schemaVersion !== 1 || !Array.isArray(index.files)) {
  throw new Error('data/index.json must contain { schemaVersion: 1, files: [...] }');
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
const seenPaths = new Set();
const seenAttackIds = new Map();
const seenIncidentIds = new Map();

function error(message) {
  console.error(message);
  process.exitCode = 1;
}

for (const entry of index.files) {
  if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || typeof entry.revision !== 'string') {
    throw new Error('Each data/index.json file entry must contain { path, revision }');
  }

  const relativePath = entry.path;
  if (!/^data\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/.test(relativePath)) {
    throw new Error(`Invalid research file path in index: ${relativePath}`);
  }
  if (seenPaths.has(relativePath)) {
    throw new Error(`Duplicate path in data/index.json: ${relativePath}`);
  }
  seenPaths.add(relativePath);

  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Indexed research file does not exist: ${relativePath}`);
  }

  const document = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (!validate(document)) {
    console.error(`Schema validation failed: ${relativePath}`);
    console.error(JSON.stringify(validate.errors, null, 2));
    process.exitCode = 1;
    continue;
  }

  if (entry.revision !== document.generatedAt) {
    error(`${relativePath}: index revision must equal document.generatedAt`);
  }

  const expectedDate = path.basename(relativePath, '.json');
  if (document.date !== expectedDate) {
    error(`${relativePath}: document.date must equal ${expectedDate}`);
  }

  if (document.researchWindow.from > document.date || document.researchWindow.to < document.date) {
    error(`${relativePath}: researchWindow must include document.date`);
  }

  const localIds = new Set();

  for (const attack of document.attacks) {
    if (localIds.has(attack.id)) {
      error(`${relativePath}: duplicate id ${attack.id}`);
    }
    localIds.add(attack.id);

    if (attack.date !== document.date) {
      error(`${relativePath}: attack ${attack.id} date must equal document.date`);
    }

    const previous = seenAttackIds.get(attack.id);
    if (previous) {
      error(`${relativePath}: attack id ${attack.id} is already used in ${previous}`);
    } else {
      seenAttackIds.set(attack.id, relativePath);
    }
  }

  for (const incident of document.incidents) {
    if (localIds.has(incident.id)) {
      error(`${relativePath}: duplicate id ${incident.id}`);
    }
    localIds.add(incident.id);

    if (incident.date !== document.date) {
      error(`${relativePath}: incident ${incident.id} date must equal document.date`);
    }

    const previous = seenIncidentIds.get(incident.id);
    if (previous) {
      error(`${relativePath}: incident id ${incident.id} is already used in ${previous}`);
    } else {
      seenIncidentIds.set(incident.id, relativePath);
    }

    const matchingAttacks = document.attacks.filter(
      (attack) => attack.date === incident.date && attack.scope === incident.scope,
    );

    if (incident.attackId) {
      const attack = document.attacks.find((candidate) => candidate.id === incident.attackId);
      if (!attack) {
        error(`${relativePath}: incident ${incident.id} references missing attackId ${incident.attackId}`);
      } else if (attack.date !== incident.date || attack.scope !== incident.scope) {
        error(
          `${relativePath}: incident ${incident.id} attackId ${incident.attackId} has mismatched date/scope`,
        );
      }
    } else if (matchingAttacks.length > 1) {
      error(
        `${relativePath}: incident ${incident.id} must set attackId because multiple attacks match its date/scope`,
      );
    }
  }
}

if (!process.exitCode) {
  console.log(`Validated ${index.files.length} research file(s) with cross-file identity/link checks.`);
}
