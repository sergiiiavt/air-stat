/**
 * Deterministic research pipeline.
 *
 * The research agent only ever creates one submission file under data/inbox/.
 * This script owns every piece of state around it: merging submissions into the
 * event-date archive, regenerating data/index.json, validating the archive,
 * counting rejections and lease timeouts, rotating stuck dates out of the way,
 * and planning the next assignment. A dead agent run leaves nothing behind.
 *
 * Usage:
 *   node scripts/research-pipeline.mjs run [--root DIR] [--now ISO] [--offline]
 *                                          [--message-file PATH]
 *   node scripts/research-pipeline.mjs status [--root DIR]
 *   node scripts/research-pipeline.mjs requeue YYYY-MM-DD [--root DIR]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  addDays,
  addHours,
  dataFilePath,
  dateSequence,
  isDate,
  isoSeconds,
} from './lib/dates.mjs';
import {
  buildIndex,
  formatJson,
  listArchiveFiles,
  readTextLf,
  truncateErrors,
  validateLocalizedResearch,
  validateResearchArchive,
} from './lib/research-validation.mjs';

const INBOX_DIR = 'data/inbox';
const INDEX_PATH = 'data/index.json';
const STATE_PATH = 'data/pipeline/state.json';
const NEXT_PATH = 'data/pipeline/next.json';
const LOG_PATH = 'data/pipeline/log.json';
const ALERT_DAYS_PATH = 'data/pipeline/alert-days.json';

const LOG_LIMIT = 50;
const ALERT_SNAPSHOT_MAX_AGE_HOURS = 24;
const ALERT_WINDOW_DAYS = 90;
const API_BASE = process.env.AIR_STAT_API_BASE ?? 'https://air-alert-stat.com';
const SCOPES = ['kyiv-city', 'kyiv-oblast'];
const SUMMARY_PREVIEW_CHARS = 80;
const COMMIT_MESSAGE_MAX_CHARS = 200;

const CAMPAIGN_DEFAULTS = {
  schemaVersion: 3,
  campaign: '2026-h1-event-date-reconstruction',
  mode: 'event-date',
  from: '2026-03-19',
  to: '2026-09-19',
  maxAttempts: 3,
  leaseHours: 3,
  staleAfterHours: 6,
  clarificationDays: 14,
};

// ---------------------------------------------------------------------------
// file helpers
// ---------------------------------------------------------------------------

function fullPath(root, relative) {
  return path.join(root, relative);
}

function readJsonIfExists(root, relative) {
  const target = fullPath(root, relative);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(readTextLf(target));
  } catch {
    return null;
  }
}

/** Writes only when the content actually changes, so idle runs commit nothing. */
function writeIfChanged(root, relative, content) {
  const target = fullPath(root, relative);
  if (fs.existsSync(target) && readTextLf(target) === content) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return true;
}

/**
 * Byte-exact snapshot/restore for the data files a single submission touches.
 * A submission that fails validation must leave the archive untouched.
 */
class FileTransaction {
  constructor(root) {
    this.root = root;
    this.original = new Map();
  }

  exists(relative) {
    return fs.existsSync(fullPath(this.root, relative));
  }

  read(relative) {
    return this.exists(relative) ? readTextLf(fullPath(this.root, relative)) : null;
  }

  snapshot(relative) {
    if (this.original.has(relative)) return;
    this.original.set(
      relative,
      this.exists(relative) ? fs.readFileSync(fullPath(this.root, relative)) : null,
    );
  }

  write(relative, content) {
    if (this.read(relative) === content) return false;
    this.snapshot(relative);
    const target = fullPath(this.root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return true;
  }

  remove(relative) {
    if (!this.exists(relative)) return false;
    this.snapshot(relative);
    fs.rmSync(fullPath(this.root, relative));
    return true;
  }

  changedFiles() {
    return [...this.original.keys()].sort();
  }

  rollback() {
    for (const [relative, bytes] of this.original) {
      const target = fullPath(this.root, relative);
      if (bytes === null) {
        if (fs.existsSync(target)) fs.rmSync(target);
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
    this.original.clear();
  }
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

function newState(nowIso) {
  return {
    ...CAMPAIGN_DEFAULTS,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastAcceptedAt: null,
    current: null,
    days: dateSequence(CAMPAIGN_DEFAULTS.from, CAMPAIGN_DEFAULTS.to).map((date) => ({
      date,
      status: 'pending',
      rejections: 0,
      timeouts: 0,
    })),
    previousCampaigns: [],
  };
}

function loadState(root, nowIso) {
  const state = readJsonIfExists(root, STATE_PATH);
  if (!state) return newState(nowIso);
  if (!Array.isArray(state.days) || !state.days.length) {
    throw new Error(`${STATE_PATH} has no days array; refusing to guess campaign state`);
  }
  return state;
}

function findDay(state, date) {
  return state.days.find((day) => day.date === date) ?? null;
}

function countDays(state) {
  let done = 0;
  let needsReview = 0;
  let pending = 0;
  for (const day of state.days) {
    if (day.status === 'done') done += 1;
    else if (day.status === 'needs_review') needsReview += 1;
    else pending += 1;
  }
  return { done, needsReview, pending, total: state.days.length };
}

// ---------------------------------------------------------------------------
// submission validation and merging
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordIssues(records, label) {
  const issues = [];
  if (records === undefined) return issues;
  if (!Array.isArray(records)) {
    issues.push(`${label} must be an array`);
    return issues;
  }
  for (const [position, record] of records.entries()) {
    if (!isPlainObject(record)) {
      issues.push(`${label}/${position} must be an object`);
      continue;
    }
    if (typeof record.id !== 'string' || record.id.length < 8) {
      issues.push(`${label}/${position}/id must be a string of at least 8 characters`);
    }
  }
  return issues;
}

/**
 * Envelope checks that must pass before anything touches the archive. Schema
 * detail inside attack/incident objects is left to the archive validator, which
 * reports it with concise JSON pointers.
 */
function validateSubmission(submission, state, nowIso) {
  const errors = [];

  if (!isPlainObject(submission)) return ['submission must be a JSON object'];
  if (submission.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (submission.kind !== 'backfill' && submission.kind !== 'daily') {
    errors.push(`unknown kind ${JSON.stringify(submission.kind ?? null)}; expected backfill or daily`);
  }
  if (!isDate(submission.taskDate)) errors.push('taskDate must be a YYYY-MM-DD date');
  if (submission.outcome !== 'updated' && submission.outcome !== 'no-findings') {
    errors.push('outcome must be one of [updated, no-findings]');
  }
  if (submission.kind === 'backfill' && isDate(submission.taskDate)) {
    if (submission.taskDate < state.from || submission.taskDate > state.to) {
      errors.push(`taskDate ${submission.taskDate} is outside the campaign ${state.from}..${state.to}`);
    }
  }

  const documents = submission.documents;
  if (documents !== undefined && !Array.isArray(documents)) {
    errors.push('documents must be an array');
    return errors;
  }

  // One day of slack: Europe/Kyiv is ahead of UTC, so a daily run just after
  // local midnight legitimately reports an event date that is still "tomorrow"
  // in UTC terms.
  const latestAllowedDate = addDays(nowIso.slice(0, 10), 1);
  let recordCount = 0;
  let removeCount = 0;

  for (const [position, document] of (documents ?? []).entries()) {
    const label = `documents/${position}`;
    if (!isPlainObject(document)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (!isDate(document.date)) {
      errors.push(`${label}/date must be a YYYY-MM-DD date`);
      continue;
    }
    if (document.date > latestAllowedDate) {
      errors.push(`${label}/date ${document.date} is in the future`);
    }

    errors.push(...recordIssues(document.attacks, `${label}/attacks`));
    errors.push(...recordIssues(document.incidents, `${label}/incidents`));

    if (document.removeIds !== undefined) {
      if (!Array.isArray(document.removeIds) || document.removeIds.some((id) => typeof id !== 'string')) {
        errors.push(`${label}/removeIds must be an array of id strings`);
      } else {
        removeCount += document.removeIds.length;
      }
    }

    recordCount +=
      (Array.isArray(document.attacks) ? document.attacks.length : 0) +
      (Array.isArray(document.incidents) ? document.incidents.length : 0);
  }

  if (submission.outcome === 'updated' && recordCount === 0 && removeCount === 0) {
    errors.push('outcome "updated" needs at least one attack, incident or removeIds entry');
  }

  return errors;
}

/** Submitted sources win, existing sources not resubmitted are kept. */
function unionSources(submitted, existing) {
  const out = [];
  const seen = new Set();

  for (const source of [...(submitted ?? []), ...(existing ?? [])]) {
    const key = isPlainObject(source) && typeof source.url === 'string' ? source.url : null;
    if (key !== null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(source);
  }

  return out;
}

function upsertRecord(list, submitted, date) {
  const record = { ...submitted };
  if (!record.date) record.date = date;

  const position = list.findIndex((candidate) => candidate.id === record.id);
  if (position === -1) {
    list.push(record);
    return;
  }

  record.sources = unionSources(record.sources, list[position].sources);
  list[position] = record;
}

/** Applies one submitted document to its event-date file. */
function mergeDocument(tx, submitted, nowIso) {
  const relative = dataFilePath(submitted.date);
  const existingRaw = tx.read(relative);
  const before = existingRaw === null ? null : JSON.parse(existingRaw);

  const target = existingRaw === null
    ? {
        schemaVersion: 1,
        date: submitted.date,
        generatedAt: nowIso,
        researchWindow: { from: submitted.date, to: submitted.date },
        attacks: [],
        incidents: [],
      }
    : JSON.parse(existingRaw);

  const removeIds = new Set(submitted.removeIds ?? []);
  target.attacks = (target.attacks ?? []).filter((record) => !removeIds.has(record.id));
  target.incidents = (target.incidents ?? []).filter((record) => !removeIds.has(record.id));

  for (const attack of submitted.attacks ?? []) upsertRecord(target.attacks, attack, submitted.date);
  for (const incident of submitted.incidents ?? []) {
    upsertRecord(target.incidents, incident, submitted.date);
  }

  if (!target.attacks.length && !target.incidents.length) {
    return tx.remove(relative) ? { path: relative, action: 'deleted' } : null;
  }

  // Compare with generatedAt held back, so a byte-identical resubmission is a
  // no-op. Any real content change bumps generatedAt, which is what the index
  // revision and therefore the Worker import both key off.
  const unchanged = { ...target, generatedAt: before ? before.generatedAt : nowIso };
  if (existingRaw !== null && formatJson(unchanged) === existingRaw) return null;

  target.generatedAt = nowIso;
  return tx.write(relative, formatJson(target))
    ? { path: relative, action: before ? 'updated' : 'created' }
    : null;
}

/** Multiset difference, so a pre-existing archive defect cannot block every submission. */
function newErrors(baseline, current) {
  const remaining = new Map();
  for (const error of baseline) remaining.set(error, (remaining.get(error) ?? 0) + 1);

  const out = [];
  for (const error of current) {
    const count = remaining.get(error) ?? 0;
    if (count > 0) {
      remaining.set(error, count - 1);
      continue;
    }
    out.push(error);
  }
  return out;
}

function validateArchive(root) {
  return [...validateResearchArchive(root), ...validateLocalizedResearch(root)];
}

function applyDocuments(ctx, submission, nowIso) {
  const tx = new FileTransaction(ctx.root);

  try {
    for (const document of submission.documents ?? []) {
      mergeDocument(tx, document, nowIso);
    }
    tx.write(INDEX_PATH, formatJson(buildIndex(ctx.root)));
  } catch (error) {
    tx.rollback();
    return { ok: false, errors: [`merge failed: ${error.message}`] };
  }

  const errors = newErrors(ctx.baselineErrors, validateArchive(ctx.root));
  if (errors.length) {
    tx.rollback();
    return { ok: false, errors };
  }

  return { ok: true, changedFiles: tx.changedFiles() };
}

// ---------------------------------------------------------------------------
// inbox processing
// ---------------------------------------------------------------------------

function inboxFiles(root) {
  const dir = fullPath(root, INBOX_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort();
}

function processSubmissionFile(ctx, relative, nowIso) {
  const base = { file: relative, kind: null, taskDate: null, outcome: null };

  let submission;
  try {
    submission = JSON.parse(readTextLf(fullPath(ctx.root, relative)));
  } catch (error) {
    return { ...base, result: 'rejected', errors: [`invalid JSON: ${error.message}`], changedFiles: [] };
  }

  const identity = {
    file: relative,
    kind: submission?.kind === 'backfill' || submission?.kind === 'daily' ? submission.kind : null,
    taskDate: isDate(submission?.taskDate) ? submission.taskDate : null,
    outcome:
      submission?.outcome === 'updated' || submission?.outcome === 'no-findings'
        ? submission.outcome
        : null,
  };

  const envelopeErrors = validateSubmission(submission, ctx.state, nowIso);
  if (envelopeErrors.length) {
    return { ...identity, result: 'rejected', errors: envelopeErrors, changedFiles: [] };
  }

  const applied = applyDocuments(ctx, submission, nowIso);
  if (!applied.ok) {
    return { ...identity, result: 'rejected', errors: applied.errors, changedFiles: [] };
  }

  return { ...identity, result: 'accepted', errors: [], changedFiles: applied.changedFiles };
}

function applyBackfillResult(ctx, entry, nowIso) {
  const state = ctx.state;
  const day = findDay(state, entry.taskDate);
  if (!day) return;

  if (entry.result === 'accepted') {
    day.status = 'done';
    day.outcome = entry.outcome;
    day.completedAt = nowIso;
    day.changedFiles = entry.changedFiles;
    day.lastError = null;
    day.lastErrorAt = null;
    day.lastRejection = null;
    if (state.current?.date === day.date) state.current = null;
    state.lastAcceptedAt = nowIso;
    return;
  }

  day.rejections += 1;
  day.lastError = entry.errors.join('\n');
  day.lastErrorAt = nowIso;
  day.lastRejection = { at: nowIso, errors: entry.errors };

  if (day.rejections >= state.maxAttempts) {
    day.status = 'needs_review';
    if (state.current?.date === day.date) state.current = null;
    ctx.events.push(`needs-review ${day.date}`);
    return;
  }

  // Hold the assignment so the next agent run sees the errors and fixes them.
  // The rejection counter, not the lease, is what bounds a failing date.
  if (state.current?.date === day.date) {
    state.current.expiresAt = addHours(nowIso, state.leaseHours);
  }
}

function processInbox(ctx, nowIso) {
  for (const name of inboxFiles(ctx.root)) {
    const relative = `${INBOX_DIR}/${name}`;
    const entry = processSubmissionFile(ctx, relative, nowIso);

    // The submission file is consumed either way: a rejected submission must
    // never be reprocessed on the next run.
    fs.rmSync(fullPath(ctx.root, relative));

    if (entry.kind === 'backfill' && entry.taskDate) applyBackfillResult(ctx, entry, nowIso);

    const label = `${entry.result === 'accepted' ? 'accept' : 'reject'} ${entry.kind ?? 'unknown'} ${entry.taskDate ?? name}`;
    ctx.events.push(
      entry.result === 'accepted'
        ? `${label} (${entry.changedFiles.length} file${entry.changedFiles.length === 1 ? '' : 's'})`
        : label,
    );

    ctx.log.push({
      file: relative,
      kind: entry.kind,
      taskDate: entry.taskDate,
      processedAt: nowIso,
      result: entry.result,
      outcome: entry.outcome,
      changedFiles: entry.changedFiles,
      errors: truncateErrors(entry.errors),
    });
    ctx.processed.push(entry);
  }
}

// ---------------------------------------------------------------------------
// lease, planning, next.json
// ---------------------------------------------------------------------------

function applyLease(ctx, nowIso) {
  const state = ctx.state;
  const current = state.current;
  if (!current || !isDate(current.date)) return;

  const expiresAtMs = new Date(current.expiresAt).getTime();
  if (Number.isFinite(expiresAtMs) && new Date(nowIso).getTime() <= expiresAtMs) return;

  state.current = null;
  const day = findDay(state, current.date);
  if (!day) return;

  day.timeouts += 1;
  day.lastError = `No valid submission within ${state.leaseHours}h`;
  day.lastErrorAt = nowIso;
  ctx.events.push(`timeout ${day.date} (${day.timeouts}/${state.maxAttempts})`);

  if (day.timeouts >= state.maxAttempts) {
    day.status = 'needs_review';
    ctx.events.push(`needs-review ${day.date}`);
  }
}

function alertTier(ctx, date) {
  return ctx.alertDays?.days?.[date] ? 0 : 1;
}

function planNext(ctx, nowIso) {
  const state = ctx.state;
  if (state.current) return;

  const pending = state.days.filter((day) => day.status === 'pending');
  if (!pending.length) return;

  // timeouts first: a date that keeps killing the agent rotates to the back
  // instead of blocking every date behind it.
  pending.sort(
    (a, b) =>
      a.timeouts - b.timeouts ||
      alertTier(ctx, a.date) - alertTier(ctx, b.date) ||
      a.date.localeCompare(b.date),
  );

  const chosen = pending[0];
  state.current = {
    date: chosen.date,
    issuedAt: nowIso,
    expiresAt: addHours(nowIso, state.leaseHours),
  };
  ctx.events.push(`assign ${chosen.date}`);
}

function summaryPreview(value) {
  if (typeof value !== 'string') return '';
  return value.length > SUMMARY_PREVIEW_CHARS ? value.slice(0, SUMMARY_PREVIEW_CHARS) : value;
}

/** One compact line per existing record, so the agent can reuse ids and deduplicate. */
function existingRecordLines(root, date) {
  const target = fullPath(root, dataFilePath(date));
  if (!fs.existsSync(target)) return [];

  let doc;
  try {
    doc = JSON.parse(readTextLf(target));
  } catch {
    return [];
  }

  const lines = [];
  for (const attack of doc.attacks ?? []) {
    lines.push([attack.id, attack.scope, summaryPreview(attack.summary)].join(' | '));
  }
  for (const incident of doc.incidents ?? []) {
    lines.push(
      [incident.id, incident.scope, incident.area?.name ?? '', summaryPreview(incident.summary)].join(' | '),
    );
  }
  return lines;
}

function alertSummary(ctx, date) {
  return ctx.alertDays?.days?.[date] ?? null;
}

function buildNext(ctx) {
  const state = ctx.state;
  const counts = countDays(state);
  const progress = { done: counts.done, needsReview: counts.needsReview, total: counts.total };

  if (!state.current) {
    return {
      schemaVersion: 1,
      status: counts.pending === 0 && counts.needsReview === 0 ? 'complete' : 'idle',
      task: null,
      progress,
    };
  }

  const date = state.current.date;
  const day = findDay(state, date) ?? { rejections: 0, timeouts: 0 };

  return {
    schemaVersion: 1,
    status: 'assigned',
    task: {
      kind: 'backfill',
      eventDate: date,
      inboxPath: `${INBOX_DIR}/backfill-${date}.json`,
      issuedAt: state.current.issuedAt,
      expiresAt: state.current.expiresAt,
      tier: alertTier(ctx, date) === 0 ? 'alert-day' : 'no-alert-record',
      clarificationWindow: {
        from: addDays(date, 1),
        to: addDays(date, state.clarificationDays),
      },
      alerts: alertSummary(ctx, date),
      previousRejection: day.lastRejection ?? null,
      attempt: {
        rejections: day.rejections,
        timeouts: day.timeouts,
        maxAttempts: state.maxAttempts,
      },
      existing: Object.fromEntries(
        [addDays(date, -1), date, addDays(date, 1)].map((neighbour) => [
          neighbour,
          existingRecordLines(ctx.root, neighbour),
        ]),
      ),
    },
    progress,
  };
}

// ---------------------------------------------------------------------------
// alert-day snapshot
// ---------------------------------------------------------------------------

function fetchWindows(from, to) {
  const windows = [];
  let start = from;
  while (start <= to) {
    const end = addDays(start, ALERT_WINDOW_DAYS - 1);
    windows.push([start, end > to ? to : end]);
    start = addDays(end, 1);
  }
  return windows;
}

async function fetchAlertDays(state, nowIso) {
  const days = {};

  for (const scope of SCOPES) {
    for (const [from, to] of fetchWindows(state.from, state.to)) {
      const url = `${API_BASE}/api/days?scope=${scope}&from=${from}&to=${to}`;
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'air-stat-research-pipeline/1.0' },
      });
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);

      const payload = await response.json();
      for (const row of payload?.days ?? []) {
        if (!isDate(row?.date)) continue;
        const seconds = Number(row.alertSeconds) || 0;
        const count = Number(row.alertCount) || 0;
        if (seconds <= 0 && count <= 0) continue;

        days[row.date] ??= {};
        days[row.date][scope] = { count, minutes: Math.round(seconds / 60) };
      }
    }
  }

  // Only scopes with an actual row are stored: a missing scope means "no alert
  // record", which is not the same claim as "quiet".
  const ordered = {};
  for (const date of Object.keys(days).sort()) ordered[date] = days[date];

  return {
    schemaVersion: 1,
    source: `${API_BASE}/api/days`,
    from: state.from,
    to: state.to,
    fetchedAt: nowIso,
    alertDayCount: Object.keys(ordered).length,
    days: ordered,
  };
}

/**
 * Refreshed only when the pipeline is about to plan, and never allowed to fail
 * the run: a network problem keeps the previous snapshot, and with no snapshot
 * at all every date is simply treated as tier 1.
 */
async function refreshAlertDays(ctx, nowIso) {
  if (ctx.offline) return;

  const existing = ctx.alertDays;
  if (existing?.fetchedAt) {
    const ageHours = (new Date(nowIso).getTime() - new Date(existing.fetchedAt).getTime()) / 3_600_000;
    if (Number.isFinite(ageHours) && ageHours < ALERT_SNAPSHOT_MAX_AGE_HOURS) return;
  }

  try {
    ctx.alertDays = await fetchAlertDays(ctx.state, nowIso);
  } catch (error) {
    ctx.warnings.push(`alert-day snapshot refresh failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

function commitMessage(events) {
  if (!events.length) return 'pipeline: no changes';

  let message = `pipeline: ${events.join('; ')}`;
  if (message.length > COMMIT_MESSAGE_MAX_CHARS) {
    let kept = 0;
    let length = 'pipeline: '.length;
    for (const event of events) {
      if (length + event.length + 2 > COMMIT_MESSAGE_MAX_CHARS - 20) break;
      length += event.length + 2;
      kept += 1;
    }
    kept = Math.max(1, kept);
    message = `pipeline: ${events.slice(0, kept).join('; ')} (+${events.length - kept} more)`;
  }
  return message;
}

async function commandRun(options) {
  const root = options.root;
  const nowIso = options.now;

  const state = loadState(root, nowIso);
  const stateBefore = formatJson(state);
  const logBefore = readJsonIfExists(root, LOG_PATH);

  const ctx = {
    root,
    state,
    offline: options.offline,
    alertDays: readJsonIfExists(root, ALERT_DAYS_PATH),
    baselineErrors: validateArchive(root),
    log: [],
    events: [],
    warnings: [],
    processed: [],
  };

  if (ctx.baselineErrors.length) {
    ctx.warnings.push(
      `archive already had ${ctx.baselineErrors.length} validation error(s) before this run; ` +
        'submissions are judged on the errors they add',
    );
  }

  processInbox(ctx, nowIso);
  applyLease(ctx, nowIso);

  if (!state.current) {
    if (state.days.some((day) => day.status === 'pending')) await refreshAlertDays(ctx, nowIso);
    planNext(ctx, nowIso);
  }

  const changed = [];

  // Regenerating here as well keeps the index self-healing even on idle runs.
  if (writeIfChanged(root, INDEX_PATH, formatJson(buildIndex(root)))) changed.push(INDEX_PATH);

  const logEntries = [...ctx.log].reverse().concat(logBefore?.entries ?? []).slice(0, LOG_LIMIT);
  if (
    ctx.log.length &&
    writeIfChanged(root, LOG_PATH, formatJson({ schemaVersion: 1, updatedAt: nowIso, entries: logEntries }))
  ) {
    changed.push(LOG_PATH);
  }

  if (ctx.alertDays && writeIfChanged(root, ALERT_DAYS_PATH, formatJson(ctx.alertDays))) {
    changed.push(ALERT_DAYS_PATH);
  }

  if (writeIfChanged(root, NEXT_PATH, formatJson(buildNext(ctx)))) changed.push(NEXT_PATH);

  // updatedAt only moves when something else in the state moved, so idle cron
  // runs produce no commit at all.
  if (formatJson(state) !== stateBefore) state.updatedAt = nowIso;
  if (writeIfChanged(root, STATE_PATH, formatJson(state))) changed.push(STATE_PATH);

  fs.mkdirSync(fullPath(root, INBOX_DIR), { recursive: true });
  const gitkeep = `${INBOX_DIR}/.gitkeep`;
  if (!fs.existsSync(fullPath(root, gitkeep))) fs.writeFileSync(fullPath(root, gitkeep), '');

  const message = commitMessage(ctx.events);
  if (options.messageFile) {
    fs.mkdirSync(path.dirname(options.messageFile), { recursive: true });
    fs.writeFileSync(options.messageFile, message + '\n');
  }

  for (const warning of ctx.warnings) console.warn(`warning: ${warning}`);
  if (ctx.baselineErrors.length) {
    for (const error of truncateErrors(ctx.baselineErrors)) console.warn(`warning: ${error}`);
  }

  const counts = countDays(state);
  console.log(
    JSON.stringify(
      {
        now: nowIso,
        processed: ctx.processed.map((entry) => ({
          file: entry.file,
          kind: entry.kind,
          taskDate: entry.taskDate,
          result: entry.result,
          changedFiles: entry.changedFiles.length,
          errors: entry.errors.length,
        })),
        current: state.current,
        counts,
        changedPipelineFiles: changed,
        commitMessage: message,
      },
      null,
      2,
    ),
  );

  return 0;
}

function commandStatus(options) {
  const state = loadState(options.root, options.now);
  const counts = countDays(state);
  const next = readJsonIfExists(options.root, NEXT_PATH);
  const alertDays = readJsonIfExists(options.root, ALERT_DAYS_PATH);

  console.log(
    JSON.stringify(
      {
        campaign: state.campaign,
        mode: state.mode,
        stateVersion: state.schemaVersion,
        from: state.from,
        to: state.to,
        total: counts.total,
        done: counts.done,
        pending: counts.pending,
        needsReview: counts.needsReview,
        completionPercent: counts.total
          ? Number(((counts.done / counts.total) * 100).toFixed(1))
          : 0,
        pipelineStatus: counts.pending === 0 ? 'complete' : 'ready',
        current: state.current,
        lastAcceptedAt: state.lastAcceptedAt,
        updatedAt: state.updatedAt,
        nextStatus: next?.status ?? null,
        alertSnapshotFetchedAt: alertDays?.fetchedAt ?? null,
        needsReviewDates: state.days.filter((day) => day.status === 'needs_review').map((day) => day.date),
        archiveFiles: listArchiveFiles(options.root).length,
      },
      null,
      2,
    ),
  );

  return 0;
}

function commandRequeue(options) {
  const date = options.positional[0];
  if (!isDate(date)) throw new Error('requeue requires a YYYY-MM-DD date');

  const state = loadState(options.root, options.now);
  const day = findDay(state, date);
  if (!day) throw new Error(`${date} is not part of the campaign`);

  const previousStatus = day.status;
  day.status = 'pending';
  day.rejections = 0;
  day.timeouts = 0;
  day.lastError = null;
  day.lastErrorAt = null;
  day.lastRejection = null;
  delete day.outcome;
  delete day.completedAt;
  delete day.changedFiles;
  state.updatedAt = options.now;

  writeIfChanged(options.root, STATE_PATH, formatJson(state));
  console.log(
    `Requeued ${date} (was ${previousStatus}); counters cleared. The next pipeline run will plan it.`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// cli
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    command: argv[0] ?? 'run',
    root: process.cwd(),
    now: isoSeconds(new Date()),
    offline: false,
    messageFile: null,
    positional: [],
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--offline') options.offline = true;
    else if (arg === '--root') options.root = path.resolve(argv[++i]);
    else if (arg === '--now') {
      const value = argv[++i];
      if (Number.isNaN(new Date(value).getTime())) {
        throw new Error(`--now must be an ISO timestamp, got ${JSON.stringify(value ?? null)}`);
      }
      options.now = isoSeconds(new Date(value));
    } else if (arg === '--message-file') options.messageFile = argv[++i];
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else options.positional.push(arg);
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));

if (options.command === 'run') process.exitCode = await commandRun(options);
else if (options.command === 'status') process.exitCode = commandStatus(options);
else if (options.command === 'requeue') process.exitCode = commandRequeue(options);
else throw new Error(`Unknown command: ${options.command}`);
