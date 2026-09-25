/**
 * Regression tests for the research pipeline.
 *
 * Every scenario copies data/ + schema/ into a throwaway directory and drives
 * scripts/research-pipeline.mjs with --offline --now, so no scenario depends on
 * the network, on the clock, or on another scenario.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  listArchiveFiles,
  readTextLf,
  validateLocalizedResearch,
  validateResearchArchive,
} from './lib/research-validation.mjs';

const repoRoot = process.cwd();
const pipelineScript = path.join(repoRoot, 'scripts/research-pipeline.mjs');

/** A small, stable fixture: one attack, one incident, two sources on the incident. */
const FIXTURE_DATE = '2026-03-25';
const FIXTURE_INCIDENT_ID = 'incident-2026-03-25-slavutych-power-outage';

const workspaces = [];
let failures = 0;
let checks = 0;

function ok(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
    return true;
  }
  failures += 1;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` -> ${detail}`}`);
  return false;
}

function equal(label, actual, expected) {
  return ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-stat-pipeline-'));
  fs.cpSync(path.join(repoRoot, 'data'), path.join(dir, 'data'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'schema'), path.join(dir, 'schema'), { recursive: true });
  workspaces.push(dir);
  return dir;
}

function runPipeline(dir, now, extra = []) {
  const result = spawnSync(
    process.execPath,
    [pipelineScript, 'run', '--root', dir, '--now', now, '--offline', ...extra],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`pipeline run failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function readJson(dir, relative) {
  return JSON.parse(readTextLf(path.join(dir, relative)));
}

function writeJson(dir, relative, value) {
  const target = path.join(dir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
}

function exists(dir, relative) {
  return fs.existsSync(path.join(dir, relative));
}

/** Byte-level snapshot of everything a submission is allowed to touch. */
function dataSnapshot(dir) {
  const snapshot = new Map();
  for (const relative of [...listArchiveFiles(dir), 'data/index.json']) {
    snapshot.set(relative, readTextLf(path.join(dir, relative)));
  }
  return snapshot;
}

function snapshotsEqual(before, after) {
  if (before.size !== after.size) return false;
  for (const [relative, content] of before) {
    if (after.get(relative) !== content) return false;
  }
  return true;
}

function archiveErrors(dir) {
  return [...validateResearchArchive(dir), ...validateLocalizedResearch(dir)];
}

function inboxCount(dir) {
  const inbox = path.join(dir, 'data/inbox');
  if (!fs.existsSync(inbox)) return 0;
  return fs.readdirSync(inbox).filter((name) => name.toLowerCase().endsWith('.json')).length;
}

function dayState(dir, date) {
  return readJson(dir, 'data/pipeline/state.json').days.find((day) => day.date === date);
}

function indexRevision(dir, relative) {
  return readJson(dir, 'data/index.json').files.find((entry) => entry.path === relative)?.revision ?? null;
}

function fixtureRecords(dir) {
  const doc = readJson(dir, `data/2026/03/${FIXTURE_DATE}.json`);
  return { attack: doc.attacks[0], incident: doc.incidents[0] };
}

/** A schema-valid incident cloned onto another date, without the attack link. */
function incidentFor(dir, date, id, overrides = {}) {
  const { incident } = fixtureRecords(dir);
  const clone = JSON.parse(JSON.stringify(incident));
  delete clone.attackId;
  clone.id = id;
  clone.date = date;
  return { ...clone, ...overrides };
}

function submission(dir, name, body) {
  writeJson(dir, `data/inbox/${name}`, body);
}

function backfillSubmission(taskDate, documents, outcome = 'updated') {
  return {
    schemaVersion: 1,
    kind: 'backfill',
    taskDate,
    submittedAt: '2026-09-25T10:15:00Z',
    outcome,
    searchSummary: 'Test fixture submission.',
    documents,
  };
}

// ---------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------

const scenarios = [];

function scenario(name, fn) {
  scenarios.push({ name, fn });
}

scenario('1. first run assigns the earliest pending date and writes next.json', () => {
  const dir = workspace();
  const run = runPipeline(dir, '2026-09-25T10:00:00Z');

  equal('current date', run.current?.date, '2026-03-19');
  equal('lease expiry is now + leaseHours', run.current?.expiresAt, '2026-09-25T13:00:00Z');

  const next = readJson(dir, 'data/pipeline/next.json');
  equal('next.json status', next.status, 'assigned');
  equal('next.json event date', next.task.eventDate, '2026-03-19');
  equal('next.json inbox path', next.task.inboxPath, 'data/inbox/backfill-2026-03-19.json');
  equal('clarification window start', next.task.clarificationWindow.from, '2026-03-20');
  equal('clarification window end', next.task.clarificationWindow.to, '2026-04-02');
  equal('progress total', next.progress.total, 185);
  ok('existing context covers E-1..E+1', Object.keys(next.task.existing).length === 3);
  ok('no alert snapshot means tier 1', next.task.tier === 'no-alert-record');
});

scenario('2. a valid backfill submission lands, completes the day and assigns the next', () => {
  const dir = workspace();
  runPipeline(dir, '2026-09-25T10:00:00Z');

  const target = 'data/2026/03/2026-03-19.json';
  ok('target file does not exist yet', !exists(dir, target));

  submission(
    dir,
    'backfill-2026-03-19.json',
    backfillSubmission('2026-03-19', [
      { date: '2026-03-19', incidents: [incidentFor(dir, '2026-03-19', 'incident-20260319-test-area')] },
    ]),
  );

  const run = runPipeline(dir, '2026-09-25T11:00:00Z');

  equal('submission accepted', run.processed[0]?.result, 'accepted');
  ok('event file created', exists(dir, target));
  equal('index revision equals generatedAt', indexRevision(dir, target), readJson(dir, target).generatedAt);
  equal('generatedAt is the run timestamp', readJson(dir, target).generatedAt, '2026-09-25T11:00:00Z');
  equal('day is done', dayState(dir, '2026-03-19').status, 'done');
  equal('day outcome recorded', dayState(dir, '2026-03-19').outcome, 'updated');
  equal('inbox is empty', inboxCount(dir), 0);
  equal('next date assigned', run.current?.date, '2026-03-20');
  equal('lastAcceptedAt set', readJson(dir, 'data/pipeline/state.json').lastAcceptedAt, '2026-09-25T11:00:00Z');
  equal('archive still validates', archiveErrors(dir).length, 0);

  const log = readJson(dir, 'data/pipeline/log.json');
  equal('log records the acceptance', log.entries[0].result, 'accepted');
  ok('log records the changed files', log.entries[0].changedFiles.includes(target));
});

scenario('3. an invalid enum is rejected and leaves the archive byte-identical', () => {
  const dir = workspace();
  runPipeline(dir, '2026-09-25T10:00:00Z');
  const before = dataSnapshot(dir);

  const broken = incidentFor(dir, '2026-03-19', 'incident-20260319-broken');
  broken.area.map.precision = 'district-centre';

  submission(
    dir,
    'backfill-2026-03-19.json',
    backfillSubmission('2026-03-19', [{ date: '2026-03-19', incidents: [broken] }]),
  );

  const run = runPipeline(dir, '2026-09-25T11:00:00Z');

  equal('submission rejected', run.processed[0]?.result, 'rejected');
  ok('archive is byte-identical', snapshotsEqual(before, dataSnapshot(dir)));
  ok('rejected file was not created', !exists(dir, 'data/2026/03/2026-03-19.json'));
  equal('rejection counted', dayState(dir, '2026-03-19').rejections, 1);
  equal('day is still pending', dayState(dir, '2026-03-19').status, 'pending');
  equal('same date stays assigned', run.current?.date, '2026-03-19');
  equal('inbox is empty', inboxCount(dir), 0);

  const next = readJson(dir, 'data/pipeline/next.json');
  const errors = next.task.previousRejection?.errors ?? [];
  ok('previousRejection carries the error', errors.length > 0, JSON.stringify(errors));
  ok(
    'error names the allowed values concisely',
    errors.some((line) => line.includes('/incidents/0/area/map/precision') && line.includes('must be one of')),
    JSON.stringify(errors),
  );
  ok('errors stay within the feedback cap', errors.every((line) => line.length <= 300) && errors.length <= 15);
});

scenario('4. three rejections mark the day needs_review and assign the next date', () => {
  const dir = workspace();
  runPipeline(dir, '2026-09-25T10:00:00Z');

  const broken = incidentFor(dir, '2026-03-19', 'incident-20260319-broken');
  broken.area.map.precision = 'district-centre';
  const body = backfillSubmission('2026-03-19', [{ date: '2026-03-19', incidents: [broken] }]);

  submission(dir, 'backfill-2026-03-19.json', body);
  runPipeline(dir, '2026-09-25T11:00:00Z');
  submission(dir, 'backfill-2026-03-19.json', body);
  runPipeline(dir, '2026-09-25T12:00:00Z');
  submission(dir, 'backfill-2026-03-19.json', body);
  const run = runPipeline(dir, '2026-09-25T12:30:00Z');

  equal('rejections reached maxAttempts', dayState(dir, '2026-03-19').rejections, 3);
  equal('day needs review', dayState(dir, '2026-03-19').status, 'needs_review');
  equal('campaign moved on', run.current?.date, '2026-03-20');
  equal('needs_review counted', run.counts.needsReview, 1);

  const requeue = spawnSync(
    process.execPath,
    [pipelineScript, 'requeue', '2026-03-19', '--root', dir, '--now', '2026-09-25T13:00:00Z'],
    { encoding: 'utf8' },
  );
  equal('requeue exits cleanly', requeue.status, 0);
  equal('requeued day is pending', dayState(dir, '2026-03-19').status, 'pending');
  equal('requeue clears rejections', dayState(dir, '2026-03-19').rejections, 0);
});

scenario('5. an expired lease counts a timeout and rotates to another date', () => {
  const dir = workspace();
  runPipeline(dir, '2026-09-25T10:00:00Z');

  const run = runPipeline(dir, '2026-09-25T14:00:00Z');

  equal('timeout counted', dayState(dir, '2026-03-19').timeouts, 1);
  equal('timed-out day is still pending', dayState(dir, '2026-03-19').status, 'pending');
  equal('a different date is assigned', run.current?.date, '2026-03-20');
  ok('timeout reason recorded', /No valid submission within 3h/.test(dayState(dir, '2026-03-19').lastError));
});

scenario('6. updating an existing incident with fewer sources keeps the old sources', () => {
  const dir = workspace();
  runPipeline(dir, '2026-09-25T10:00:00Z');

  const relative = `data/2026/03/${FIXTURE_DATE}.json`;
  const originalRevision = indexRevision(dir, relative);
  const { incident } = fixtureRecords(dir);
  equal('fixture starts with two sources', incident.sources.length, 2);

  const trimmed = JSON.parse(JSON.stringify(incident));
  trimmed.sources = [incident.sources[0]];
  trimmed.summary = `${incident.summary} Updated casualty figure confirmed.`;

  submission(
    dir,
    `backfill-${FIXTURE_DATE}.json`,
    backfillSubmission(FIXTURE_DATE, [{ date: FIXTURE_DATE, incidents: [trimmed] }]),
  );

  const run = runPipeline(dir, '2026-09-25T11:00:00Z');
  equal('submission accepted', run.processed[0]?.result, 'accepted');

  const updated = readJson(dir, relative).incidents.find((item) => item.id === FIXTURE_INCIDENT_ID);
  equal('both sources survive', updated.sources.length, 2);
  equal('submitted source comes first', updated.sources[0].url, incident.sources[0].url);
  ok(
    'dropped source is retained',
    updated.sources.some((source) => source.url === incident.sources[1].url),
  );
  ok('summary was updated', updated.summary.endsWith('Updated casualty figure confirmed.'));
  ok('index revision bumped', indexRevision(dir, relative) !== originalRevision);
  equal('index revision tracks generatedAt', indexRevision(dir, relative), readJson(dir, relative).generatedAt);
  equal('archive still validates', archiveErrors(dir).length, 0);
});

scenario('7. removeIds that empty a document delete the file and drop it from the index', () => {
  const dir = workspace();
  runPipeline(dir, '2026-09-25T10:00:00Z');

  const relative = `data/2026/03/${FIXTURE_DATE}.json`;
  const { attack, incident } = fixtureRecords(dir);
  const filesBefore = readJson(dir, 'data/index.json').files.length;

  submission(
    dir,
    `backfill-${FIXTURE_DATE}.json`,
    backfillSubmission(FIXTURE_DATE, [{ date: FIXTURE_DATE, removeIds: [attack.id, incident.id] }]),
  );

  const run = runPipeline(dir, '2026-09-25T11:00:00Z');

  equal('submission accepted', run.processed[0]?.result, 'accepted');
  ok('emptied file deleted', !exists(dir, relative));
  equal('index shrank by one', readJson(dir, 'data/index.json').files.length, filesBefore - 1);
  equal('index no longer lists the file', indexRevision(dir, relative), null);
  equal('archive still validates', archiveErrors(dir).length, 0);
});

scenario('8. a daily submission updates an older date without touching campaign state', () => {
  const dir = workspace();
  runPipeline(dir, '2026-09-25T10:00:00Z');
  const stateBefore = readJson(dir, 'data/pipeline/state.json');

  submission(dir, 'daily-2026-09-25-1015.json', {
    schemaVersion: 1,
    kind: 'daily',
    taskDate: '2026-09-25',
    submittedAt: '2026-09-25T10:15:00Z',
    outcome: 'updated',
    searchSummary: 'Retrospective clarification published today.',
    documents: [
      {
        date: FIXTURE_DATE,
        incidents: [incidentFor(dir, FIXTURE_DATE, 'incident-20260325-later-clarification')],
      },
    ],
  });

  const run = runPipeline(dir, '2026-09-25T11:00:00Z');
  const stateAfter = readJson(dir, 'data/pipeline/state.json');

  equal('submission accepted', run.processed[0]?.result, 'accepted');
  equal(
    'older event file gained the record',
    readJson(dir, `data/2026/03/${FIXTURE_DATE}.json`).incidents.length,
    2,
  );
  equal('campaign day untouched', dayState(dir, FIXTURE_DATE).status, 'pending');
  equal('assignment untouched', stateAfter.current?.date, stateBefore.current?.date);
  equal('lastAcceptedAt untouched', stateAfter.lastAcceptedAt, stateBefore.lastAcceptedAt);
  equal('days array untouched', JSON.stringify(stateAfter.days), JSON.stringify(stateBefore.days));
  equal('archive still validates', archiveErrors(dir).length, 0);

  const log = readJson(dir, 'data/pipeline/log.json');
  equal('log records the daily submission', log.entries[0].kind, 'daily');
});

scenario('9. an id that already exists in another date file is rejected', () => {
  const dir = workspace();
  runPipeline(dir, '2026-09-25T10:00:00Z');
  const before = dataSnapshot(dir);

  submission(
    dir,
    'backfill-2026-03-26.json',
    backfillSubmission('2026-03-26', [
      { date: '2026-03-26', incidents: [incidentFor(dir, '2026-03-26', FIXTURE_INCIDENT_ID)] },
    ]),
  );

  const run = runPipeline(dir, '2026-09-25T11:00:00Z');

  equal('submission rejected', run.processed[0]?.result, 'rejected');
  ok('archive is byte-identical', snapshotsEqual(before, dataSnapshot(dir)));
  ok('new file was rolled back', !exists(dir, 'data/2026/03/2026-03-26.json'));

  const errors = readJson(dir, 'data/pipeline/log.json').entries[0].errors;
  ok(
    'error names the conflicting file',
    errors.some((line) => line.includes('already used in') && line.includes(FIXTURE_DATE)),
    JSON.stringify(errors),
  );
  equal('rejection counted against the task date', dayState(dir, '2026-03-26').rejections, 1);
});

scenario('10. a non-JSON inbox file is rejected, logged and removed', () => {
  const dir = workspace();
  runPipeline(dir, '2026-09-25T10:00:00Z');
  const before = dataSnapshot(dir);

  fs.writeFileSync(path.join(dir, 'data/inbox/backfill-2026-03-19.json'), 'not json at all\n');
  const run = runPipeline(dir, '2026-09-25T11:00:00Z');

  equal('submission rejected', run.processed[0]?.result, 'rejected');
  equal('inbox file removed', inboxCount(dir), 0);
  ok('archive is byte-identical', snapshotsEqual(before, dataSnapshot(dir)));

  const entry = readJson(dir, 'data/pipeline/log.json').entries[0];
  equal('log records a rejection', entry.result, 'rejected');
  equal('log cannot attribute a kind', entry.kind, null);
  ok('log explains the parse failure', entry.errors.some((line) => line.startsWith('invalid JSON')));
  equal('no rejection is charged to any day', dayState(dir, '2026-03-19').rejections, 0);
  equal('assignment is unchanged', run.current?.date, '2026-03-19');
});

scenario('11. a second run with an empty inbox changes nothing', () => {
  const dir = workspace();
  runPipeline(dir, '2026-09-25T10:00:00Z');
  const before = dataSnapshot(dir);
  const pipelineBefore = ['state.json', 'next.json', 'log.json'].map((name) =>
    readTextLf(path.join(dir, 'data/pipeline', name)),
  );

  const run = runPipeline(dir, '2026-09-25T10:30:00Z');

  equal('no pipeline files changed', run.changedPipelineFiles.length, 0);
  equal('commit message says so', run.commitMessage, 'pipeline: no changes');
  ok('archive is byte-identical', snapshotsEqual(before, dataSnapshot(dir)));
  ok(
    'pipeline files are byte-identical',
    ['state.json', 'next.json', 'log.json'].every(
      (name, position) => readTextLf(path.join(dir, 'data/pipeline', name)) === pipelineBefore[position],
    ),
  );
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

try {
  for (const { name, fn } of scenarios) {
    console.log(name);
    try {
      fn();
    } catch (error) {
      failures += 1;
      console.log(`  FAIL threw: ${error.message}`);
    }
  }
} finally {
  for (const dir of workspaces) fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${checks} check(s), ${failures} failure(s)`);
if (failures) process.exit(1);
console.log('Research pipeline regression tests passed.');
