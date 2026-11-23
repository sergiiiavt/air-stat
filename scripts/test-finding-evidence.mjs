import { readFileSync } from 'node:fs';
import {
  applyHeadlineOnlyPolicy,
  DROPPABLE_FINDING_REASONS,
  isHeadlineOnlyFinding,
  summarizeInvalidFindings,
} from '../shared/finding-evidence.mjs';

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const candidates = [
  { url: 'https://news.google.com/rss/articles/a', discoveryOnly: true },
  { url: 'https://t.me/vitaliy_klitschko/8206', sourceType: 'official' },
  { url: 'https://news.google.com/rss/articles/b', discoveryOnly: true },
];

const finding = {
  eventDate: '2026-11-21',
  scope: 'kyiv-city',
  threatTypes: ['uav'],
  attackSummary: 'Kyiv reports damage in three districts after morning Russian attack',
  attackKilled: null,
  attackInjured: 2,
  attackCasualtyStatus: 'reported',
  hasIncident: true,
  incidentKey: 'three-districts',
  areaName: 'Kyiv',
  publicLocationText: '',
  publicLocationSpecificity: 'none',
  impactType: 'damage',
  incidentSummary: 'damage in three districts',
  incidentKilled: null,
  incidentInjured: 2,
  incidentCasualtyStatus: 'reported',
  damage: [{ type: 'building', count: null, description: 'damage' }],
  verification: 'confirmed',
  confidence: 'medium',
  sourceIndexes: [0, 2],
};

// Production regression (21 Nov 2026): headline-only evidence may confirm an
// attack but must not create an incident or casualty counts.
assertEqual(isHeadlineOnlyFinding(finding, candidates), true, 'Google-only finding is headline-only');
const downgraded = applyHeadlineOnlyPolicy(finding, candidates);
assertEqual(
  [downgraded.hasIncident, downgraded.incidentKey, downgraded.attackCasualtyStatus, downgraded.attackInjured,
    downgraded.incidentInjured, downgraded.damage.length, downgraded.confidence],
  [false, '', 'unknown', null, null, 0, 'low'],
  'headline-only finding is reduced to attack-level evidence',
);
assertEqual(downgraded.attackSummary, finding.attackSummary, 'attack summary is preserved');
assertEqual(downgraded.eventDate, finding.eventDate, 'event date is preserved');

// One article-body or official source keeps the finding intact.
const mixed = { ...finding, sourceIndexes: [0, 1] };
assertEqual(isHeadlineOnlyFinding(mixed, candidates), false, 'official source keeps the finding');
assertEqual(applyHeadlineOnlyPolicy(mixed, candidates), mixed, 'mixed-evidence finding is unchanged');
assertEqual(isHeadlineOnlyFinding({ sourceIndexes: [] }, candidates), false, 'no sources is not headline-only');

// Only fact-free rejections are droppable; anything else must keep aborting.
assertEqual([...DROPPABLE_FINDING_REASONS].sort(), ['empty-finding', 'no-valid-source'], 'droppable reasons');
assertEqual(
  summarizeInvalidFindings(['empty-finding', 'invalid-event-date', 'empty-finding']),
  'empty-finding×2, invalid-event-date×1',
  'invalid finding summary',
);

// Source contracts in the Worker.
const research = readFileSync(new URL('../worker/automated-research.ts', import.meta.url), 'utf8');
for (const required of [
  'discoveryOnly: true,',
  "applyHeadlineOnlyPolicy(result.finding, candidates)",
  '!DROPPABLE_FINDING_REASONS.has(reason)',
  "return { reason: hasIncident ? 'missing-attack-summary' : 'empty-finding' };",
  "return { reason: 'no-valid-source' };",
]) {
  if (!research.includes(required)) throw new Error(`automated-research.ts no longer contains ${required}`);
}
const normalizeStart = research.indexOf('function normalizeFinding(');
const normalizeEnd = research.indexOf('async function extractFindings(', normalizeStart);
if (/return null/.test(research.slice(normalizeStart, normalizeEnd))) {
  throw new Error('normalizeFinding must return a rejection reason instead of null');
}

// Data repair migration targets only the verified headline-only 21 Nov rows.
const migration = readFileSync(
  new URL('../migrations/0022_remove_headline_only_2026_11_21_incidents.sql', import.meta.url),
  'utf8',
);
const ids = [...migration.matchAll(/'(auto-incident-[^']+)'/g)].map((match) => match[1]);
assertEqual(ids.length, 6, 'migration removes exactly six rows');
if (!ids.every((id) => id.startsWith('auto-incident-20261121-kyiv-city-kyiv-'))) {
  throw new Error('migration 0022 may only remove 21 Nov city-level automated rows');
}
for (const guard of ["incident_date = '2026-11-21'", "scope = 'kyiv-city'", "admin_area = 'Kyiv'"]) {
  if (!migration.includes(guard)) throw new Error(`migration 0022 must keep guard ${guard}`);
}

console.log('Validated headline-only evidence policy, finding rejection handling and migration 0022.');
