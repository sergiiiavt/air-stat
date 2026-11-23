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
assertEqual([...DROPPABLE_FINDING_REASONS].sort(), ['empty-finding', 'event-date-mismatch', 'no-valid-source'], 'droppable reasons');
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
  'if (attackSummary.length < 5 && hasIncident && incidentSummary.length >= 5) {',
]) {
  if (!research.includes(required)) throw new Error(`automated-research.ts no longer contains ${required}`);
}
const fallbackAt = research.indexOf('attackSummary = incidentSummary;');
const missingSummaryAt = research.indexOf("'missing-attack-summary'");
if (fallbackAt < 0 || missingSummaryAt < 0 || fallbackAt > missingSummaryAt) {
  throw new Error('an incident-backed attack summary fallback must run before the missing-attack-summary reject');
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

// Evidence rebuild migration: only automated rows whose every source is a
// Google News headline; requeue before delete; casualties become unknown.
const rebuild = readFileSync(
  new URL('../migrations/0023_rebuild_headline_only_evidence.sql', import.meta.url),
  'utf8',
);
const statements = rebuild
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);
assertEqual(
  statements.map((statement) => statement.split(/\s+/).slice(0, 2).join(' ')),
  ['UPDATE automated_research_days', 'UPDATE attacks', 'DELETE FROM'],
  'migration 0023 requeues, resets casualties, then deletes',
);
for (const statement of statements.slice(1)) {
  if (!statement.includes("LIKE 'auto-")) throw new Error('migration 0023 must only touch automated rows');
  if (!statement.includes("si.url NOT LIKE 'https://news.google.com/%'")) {
    throw new Error('migration 0023 must keep the headline-only predicate');
  }
}
if (!statements[1].includes("casualty_status = 'unknown'")) {
  throw new Error('headline-only casualty counts must become unknown, not zero');
}

// Historical discovery reads the dated Pravda archive and no longer the
// latest-news Kyiv City page for old windows.
for (const required of [
  ': fetchPravdaKyivLinks(from, addDays(from, 1) < to ? addDays(from, 1) : to, perSourceLimit);',
  'currentPublicationDay && to >= addDays(kyivDate(), -2)',
  '[kodaCandidates, pravdaCandidates, kyivCityCandidates, gdeltCandidates, googleCandidates]',
]) {
  if (!research.includes(required)) throw new Error(`automated-research.ts no longer contains ${required}`);
}
console.log('Validated evidence rebuild migration 0023 and historical Pravda discovery.');
