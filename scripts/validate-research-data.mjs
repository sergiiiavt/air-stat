import { listArchiveFiles, validateResearchArchive } from './lib/research-validation.mjs';

const root = process.cwd();
const errors = validateResearchArchive(root);

if (errors.length) {
  console.error('Research data validation failed:');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}

console.log(
  `Validated ${listArchiveFiles(root).length} research file(s) with index agreement and cross-file identity/link checks.`,
);
