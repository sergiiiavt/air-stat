import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema/daily-research.schema.json'), 'utf8'));
const indexPath = path.join(root, 'data/index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

if (index.schemaVersion !== 1 || !Array.isArray(index.files)) {
  throw new Error('data/index.json must contain { schemaVersion: 1, files: [...] }');
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
const seen = new Set();

for (const entry of index.files) {
  if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || typeof entry.revision !== 'string') {
    throw new Error('Each data/index.json file entry must contain { path, revision }');
  }
  const relativePath = entry.path;
  if (!/^data\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/.test(relativePath)) {
    throw new Error(`Invalid research file path in index: ${relativePath}`);
  }
  if (seen.has(relativePath)) throw new Error(`Duplicate path in data/index.json: ${relativePath}`);
  seen.add(relativePath);

  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) throw new Error(`Indexed research file does not exist: ${relativePath}`);

  const document = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (!validate(document)) {
    console.error(`Schema validation failed: ${relativePath}`);
    console.error(JSON.stringify(validate.errors, null, 2));
    process.exitCode = 1;
    continue;
  }

  if (entry.revision !== document.generatedAt) {
    console.error(`${relativePath}: index revision must equal document.generatedAt`);
    process.exitCode = 1;
  }

  const expectedDate = path.basename(relativePath, '.json');
  if (document.date !== expectedDate) {
    console.error(`${relativePath}: document.date must equal ${expectedDate}`);
    process.exitCode = 1;
  }

  const ids = new Set();
  for (const item of [...document.attacks, ...document.incidents]) {
    if (ids.has(item.id)) {
      console.error(`${relativePath}: duplicate id ${item.id}`);
      process.exitCode = 1;
    }
    ids.add(item.id);
  }

  for (const incident of document.incidents) {
    if (incident.attackId && !document.attacks.some((attack) => attack.id === incident.attackId)) {
      console.error(`${relativePath}: incident ${incident.id} references missing attackId ${incident.attackId}`);
      process.exitCode = 1;
    }
  }
}

if (!process.exitCode) {
  console.log(`Validated ${index.files.length} research file(s).`);
}
