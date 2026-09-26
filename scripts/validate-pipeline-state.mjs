/**
 * Structural validation for the research pipeline control plane.
 *
 * The pipeline is the only writer of these files, so this validator exists to
 * catch a pipeline bug or a hand edit before it reaches main. Submissions under
 * data/inbox/ are deliberately ignored: they are transient input, not state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dateSequence, isDate } from './lib/dates.mjs';
import { DATA_FILE_PATTERN, formatJson, readTextLf } from './lib/research-validation.mjs';

const STATE_PATH = 'data/pipeline/state.json';
const NEXT_PATH = 'data/pipeline/next.json';
const LOG_PATH = 'data/pipeline/log.json';
const ALERT_DAYS_PATH = 'data/pipeline/alert-days.json';
const LOG_LIMIT = 50;
const DAY_STATUSES = ['pending', 'done', 'needs_review'];

const root = process.cwd();
const errors = [];

function fail(message) {
  errors.push(message);
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function isCounter(value) {
  return Number.isInteger(value) && value >= 0;
}

function isRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** The pipeline always writes canonical 2-space JSON; drift means a hand edit. */
function loadCanonical(relative, required) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    if (required) fail(`${relative} is missing`);
    return null;
  }

  const raw = readTextLf(target);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`${relative} is not valid JSON: ${error.message}`);
    return null;
  }

  if (raw !== formatJson(parsed)) {
    fail(`${relative} must be canonical 2-space JSON with a trailing newline`);
  }
  return parsed;
}

const state = loadCanonical(STATE_PATH, true);

if (state) {
  if (state.schemaVersion !== 3) fail(`${STATE_PATH}: schemaVersion must be 3`);
  if (state.mode !== 'event-date') fail(`${STATE_PATH}: mode must be event-date`);
  if (typeof state.campaign !== 'string' || !state.campaign) {
    fail(`${STATE_PATH}: campaign must be a non-empty string`);
  }
  if (!isDate(state.from) || !isDate(state.to) || state.from > state.to) {
    fail(`${STATE_PATH}: from/to must be a valid ascending date range`);
  }
  if (!isRange(state.maxAttempts, 1, 10)) fail(`${STATE_PATH}: maxAttempts must be 1..10`);
  // Written from code on the first run after the knob shipped, so a state file
  // produced before that is still valid without it.
  if (state.maxTimeouts !== undefined && !isRange(state.maxTimeouts, 1, 20)) {
    fail(`${STATE_PATH}: maxTimeouts must be 1..20`);
  }
  if (!isRange(state.leaseHours, 1, 24)) fail(`${STATE_PATH}: leaseHours must be 1..24`);
  if (!isRange(state.staleAfterHours, 2, 48)) fail(`${STATE_PATH}: staleAfterHours must be 2..48`);
  if (!isRange(state.clarificationDays, 0, 60)) fail(`${STATE_PATH}: clarificationDays must be 0..60`);
  if (!isTimestamp(state.createdAt)) fail(`${STATE_PATH}: createdAt must be an ISO timestamp`);
  if (!isTimestamp(state.updatedAt)) fail(`${STATE_PATH}: updatedAt must be an ISO timestamp`);
  if (state.lastAcceptedAt !== null && !isTimestamp(state.lastAcceptedAt)) {
    fail(`${STATE_PATH}: lastAcceptedAt must be null or an ISO timestamp`);
  }
  if (!Array.isArray(state.previousCampaigns)) {
    fail(`${STATE_PATH}: previousCampaigns must be an array`);
  }

  if (!Array.isArray(state.days)) {
    fail(`${STATE_PATH}: days must be an array`);
  } else if (isDate(state.from) && isDate(state.to) && state.from <= state.to) {
    const expected = dateSequence(state.from, state.to);
    if (state.days.length !== expected.length) {
      fail(`${STATE_PATH}: days must hold ${expected.length} entries, found ${state.days.length}`);
    }

    for (const [position, date] of expected.entries()) {
      const day = state.days[position];
      if (!day) break;
      if (day.date !== date) {
        fail(`${STATE_PATH}: days[${position}] must be ${date}, found ${day.date}`);
        break;
      }
    }

    for (const day of state.days) {
      if (!DAY_STATUSES.includes(day?.status)) {
        fail(`${STATE_PATH}: ${day?.date} status must be one of [${DAY_STATUSES.join(', ')}]`);
      }
      if (!isCounter(day?.rejections) || !isCounter(day?.timeouts)) {
        fail(`${STATE_PATH}: ${day?.date} rejections/timeouts must be non-negative integers`);
      }
      if (day?.lastError !== undefined && day.lastError !== null && typeof day.lastError !== 'string') {
        fail(`${STATE_PATH}: ${day.date} lastError must be null or a string`);
      }
      if (day?.completedAt !== undefined && day.completedAt !== null && !isTimestamp(day.completedAt)) {
        fail(`${STATE_PATH}: ${day.date} completedAt must be an ISO timestamp`);
      }

      for (const changed of day?.changedFiles ?? []) {
        // A path may be absent from disk: removeIds submissions legitimately
        // delete an event file after recording it as changed.
        if (changed !== 'data/index.json' && !DATA_FILE_PATTERN.test(changed)) {
          fail(`${STATE_PATH}: ${day.date} changedFiles entry is not a research data path: ${changed}`);
        }
      }
    }
  }

  const current = state.current;
  if (current !== null && current !== undefined) {
    if (!isDate(current.date)) {
      fail(`${STATE_PATH}: current.date must be a YYYY-MM-DD date`);
    } else {
      const day = (state.days ?? []).find((candidate) => candidate.date === current.date);
      if (!day) fail(`${STATE_PATH}: current.date ${current.date} is not a campaign date`);
      else if (day.status !== 'pending') {
        fail(`${STATE_PATH}: current.date ${current.date} must reference a pending day, found ${day.status}`);
      }
    }
    if (!isTimestamp(current.issuedAt)) fail(`${STATE_PATH}: current.issuedAt must be an ISO timestamp`);
    if (!isTimestamp(current.expiresAt)) fail(`${STATE_PATH}: current.expiresAt must be an ISO timestamp`);
    if (isTimestamp(current.issuedAt) && isTimestamp(current.expiresAt)) {
      if (new Date(current.expiresAt).getTime() <= new Date(current.issuedAt).getTime()) {
        fail(`${STATE_PATH}: current.expiresAt must be after current.issuedAt`);
      }
    }
  }
}

// next.json is written by the pipeline on its first run; before that a state
// with no assignment and no next.json is consistent.
const next = loadCanonical(NEXT_PATH, Boolean(state?.current));

if (state && next) {
  if (next.schemaVersion !== 1) fail(`${NEXT_PATH}: schemaVersion must be 1`);

  const pending = (state.days ?? []).filter((day) => day.status === 'pending').length;
  const needsReview = (state.days ?? []).filter((day) => day.status === 'needs_review').length;

  if (state.current) {
    if (next.status !== 'assigned') fail(`${NEXT_PATH}: status must be assigned while a task is leased`);
    if (next.task?.eventDate !== state.current.date) {
      fail(`${NEXT_PATH}: task.eventDate must equal state.current.date`);
    }
    if (next.task?.issuedAt !== state.current.issuedAt || next.task?.expiresAt !== state.current.expiresAt) {
      fail(`${NEXT_PATH}: task lease timestamps must equal state.current`);
    }
    if (next.task?.inboxPath !== `data/inbox/backfill-${state.current.date}.json`) {
      fail(`${NEXT_PATH}: task.inboxPath must name the assigned event date`);
    }
  } else if (next.status === 'complete') {
    if (pending || needsReview) {
      fail(`${NEXT_PATH}: status complete requires no pending and no needs_review days`);
    }
  } else if (next.status !== 'idle') {
    fail(`${NEXT_PATH}: status must be one of [assigned, idle, complete]`);
  }

  if (next.progress?.total !== (state.days ?? []).length) {
    fail(`${NEXT_PATH}: progress.total must equal the campaign length`);
  }
}

const log = loadCanonical(LOG_PATH, false);

if (log) {
  if (log.schemaVersion !== 1) fail(`${LOG_PATH}: schemaVersion must be 1`);
  if (!Array.isArray(log.entries)) {
    fail(`${LOG_PATH}: entries must be an array`);
  } else {
    if (log.entries.length > LOG_LIMIT) {
      fail(`${LOG_PATH}: entries must hold at most ${LOG_LIMIT} items, found ${log.entries.length}`);
    }
    for (const entry of log.entries) {
      if (!isTimestamp(entry?.processedAt)) {
        fail(`${LOG_PATH}: ${entry?.file} processedAt must be an ISO timestamp`);
      }
      if (entry?.result !== 'accepted' && entry?.result !== 'rejected') {
        fail(`${LOG_PATH}: ${entry?.file} result must be accepted or rejected`);
      }
      if (!Array.isArray(entry?.errors) || !Array.isArray(entry?.changedFiles)) {
        fail(`${LOG_PATH}: ${entry?.file} errors and changedFiles must be arrays`);
      }
    }
  }
}

const alertDays = loadCanonical(ALERT_DAYS_PATH, false);

if (alertDays) {
  if (alertDays.schemaVersion !== 1) fail(`${ALERT_DAYS_PATH}: schemaVersion must be 1`);
  if (!isTimestamp(alertDays.fetchedAt)) fail(`${ALERT_DAYS_PATH}: fetchedAt must be an ISO timestamp`);
  if (typeof alertDays.days !== 'object' || alertDays.days === null) {
    fail(`${ALERT_DAYS_PATH}: days must be an object keyed by date`);
  } else {
    for (const date of Object.keys(alertDays.days)) {
      if (!isDate(date)) fail(`${ALERT_DAYS_PATH}: ${date} is not a YYYY-MM-DD key`);
    }
  }
}

if (errors.length) {
  console.error('Pipeline state validation failed:');
  for (const error of errors) console.error('- ' + error);
  process.exit(1);
}

const counts = (state?.days ?? []).reduce(
  (acc, day) => ({ ...acc, [day.status]: (acc[day.status] ?? 0) + 1 }),
  {},
);

console.log(
  `Validated pipeline state: ${state?.days?.length ?? 0} campaign day(s) ` +
    `(done ${counts.done ?? 0}, pending ${counts.pending ?? 0}, needs_review ${counts.needs_review ?? 0}); ` +
    `current ${state?.current?.date ?? 'none'}; next ${next?.status ?? 'not written yet'}.`,
);
