import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const value = process.argv[i];
  if (!value.startsWith('--')) continue;
  args.set(value.slice(2), process.argv[i + 1]?.startsWith('--') ? 'true' : process.argv[++i]);
}

function parseDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

function shiftMonths(date, months) {
  const d = new Date(date + 'T12:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

function datesBetween(from, to) {
  const out = [];
  const cursor = new Date(from + 'T12:00:00Z');
  const end = new Date(to + 'T12:00:00Z');
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

const index = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json'), 'utf8'));
if (index.schemaVersion !== 1 || !Array.isArray(index.files)) {
  throw new Error('Invalid data/index.json');
}

const manifestDates = index.files
  .map((entry) => entry.path.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
  .filter(Boolean)
  .sort();

if (!manifestDates.length) {
  console.log(JSON.stringify({ files: 0, message: 'No research files' }, null, 2));
  process.exit(0);
}

const latest = manifestDates.at(-1);
const months = Number(args.get('months') ?? 6);
const defaultFrom = shiftMonths(latest, -months);
const from = parseDate(args.get('from') ?? defaultFrom, 'from date');
const to = parseDate(args.get('to') ?? latest, 'to date');

const mappable = new Set([
  'district-centroid',
  'raion-centroid',
  'hromada-centroid',
  'settlement-centroid',
  'neighborhood-centroid',
  'street-segment',
  'address-generalized',
  'address-point',
]);

const filesInRange = [];
const coveredDates = new Set();
const sourceTypes = new Map();
const publishers = new Map();
const precision = new Map();
const areaLevels = new Map();
let attacks = 0;
let incidents = 0;
let mappableIncidents = 0;
let broadIncidents = 0;

for (const entry of index.files) {
  const date = entry.path.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
  if (!date || date < from || date > to) continue;

  const fullPath = path.join(root, entry.path);
  const doc = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  filesInRange.push(entry.path);
  coveredDates.add(date);
  attacks += doc.attacks?.length ?? 0;
  incidents += doc.incidents?.length ?? 0;

  for (const record of [...(doc.attacks ?? []), ...(doc.incidents ?? [])]) {
    for (const source of record.sources ?? []) {
      sourceTypes.set(source.type, (sourceTypes.get(source.type) ?? 0) + 1);
      publishers.set(source.publisher, (publishers.get(source.publisher) ?? 0) + 1);
    }
  }

  for (const incident of doc.incidents ?? []) {
    const p = incident.area?.map?.precision ?? 'missing';
    const level = incident.area?.level ?? 'missing';
    precision.set(p, (precision.get(p) ?? 0) + 1);
    areaLevels.set(level, (areaLevels.get(level) ?? 0) + 1);
    if (mappable.has(p)) mappableIncidents += 1;
    else broadIncidents += 1;
  }
}

const expectedDates = datesBetween(from, to);
const missingDates = expectedDates.filter((date) => !coveredDates.has(date));
const broadShare = incidents ? broadIncidents / incidents : 0;

let backfill = null;
const backfillPath = path.join(root, 'data/backfill/queue.json');
if (fs.existsSync(backfillPath)) {
  const queue = JSON.parse(fs.readFileSync(backfillPath, 'utf8'));
  const statuses = ['pending', 'in_progress', 'retry', 'completed', 'needs_review', 'failed'];
  const counts = Object.fromEntries(
    statuses.map((status) => [
      status,
      queue.days.filter((day) => day.status === status).length,
    ]),
  );
  backfill = {
    campaign: queue.campaign,
    from: queue.from,
    to: queue.to,
    batchSize: queue.batchSize,
    maxAttempts: queue.maxAttempts,
    total: queue.days.length,
    ...counts,
    completionPercent: queue.days.length
      ? Number(((counts.completed / queue.days.length) * 100).toFixed(1))
      : 0,
    nextDates: queue.days
      .filter((day) => day.status === 'retry' || day.status === 'pending')
      .slice(0, queue.batchSize)
      .map((day) => day.date),
  };
}

const report = {
  window: { from, to, days: expectedDates.length },
  backfill,
  coverage: {
    researchedDayFiles: coveredDates.size,
    missingDayFiles: missingDates.length,
    coveragePercent: Number(((coveredDates.size / expectedDates.length) * 100).toFixed(1)),
    missingDates,
  },
  records: {
    files: filesInRange.length,
    attacks,
    incidents,
    mappableIncidents,
    broadIncidents,
    broadIncidentPercent: Number((broadShare * 100).toFixed(1)),
  },
  geography: {
    precision: Object.fromEntries([...precision.entries()].sort((a, b) => b[1] - a[1])),
    areaLevels: Object.fromEntries([...areaLevels.entries()].sort((a, b) => b[1] - a[1])),
  },
  sources: {
    byType: Object.fromEntries([...sourceTypes.entries()].sort((a, b) => b[1] - a[1])),
    topPublishers: [...publishers.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([publisher, references]) => ({ publisher, references })),
  },
  interpretation: {
    missingDayFile:
      'No dated research file exists. This is unknown coverage, not evidence that no attack or consequence occurred.',
    broadIncident:
      'City/oblast centroid incidents are intentionally excluded from map dots and heatmap.',
  },
};

console.log(JSON.stringify(report, null, 2));
