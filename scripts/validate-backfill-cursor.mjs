import fs from 'node:fs';
import path from 'node:path';

const cursorPath = 'data/backfill/cursor.json';
const raw = fs.readFileSync(cursorPath, 'utf8');
const cursor = JSON.parse(raw);
const canonical = JSON.stringify(cursor, null, 2) + '\n';

if (raw !== canonical) {
  throw new Error('Backfill cursor must be canonical 2-space, multiline JSON.');
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');
}

function dateSequence(from, to) {
  const out = [];
  const current = new Date(from + 'T12:00:00Z');
  const end = new Date(to + 'T12:00:00Z');
  while (current <= end) {
    out.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return out;
}

if (cursor.schemaVersion !== 2) throw new Error('Backfill cursor schemaVersion must be 2');
if (cursor.mode !== 'publication-date-replay') throw new Error('Backfill cursor mode must be publication-date-replay');
if (!isDate(cursor.from) || !isDate(cursor.to) || cursor.from > cursor.to) {
  throw new Error('Backfill cursor requires a valid from/to range');
}
if (!Number.isInteger(cursor.completed) || cursor.completed < 0) throw new Error('Backfill cursor completed must be a non-negative integer');
if (!Number.isInteger(cursor.maxAttempts) || cursor.maxAttempts < 1 || cursor.maxAttempts > 10) {
  throw new Error('Backfill cursor maxAttempts must be between 1 and 10');
}
if (!Number.isInteger(cursor.staleAfterHours) || cursor.staleAfterHours < 2 || cursor.staleAfterHours > 24) {
  throw new Error('Backfill cursor staleAfterHours must be between 2 and 24');
}
if (!Number.isInteger(cursor.attempts) || cursor.attempts < 0 || cursor.attempts > cursor.maxAttempts) {
  throw new Error('Backfill cursor attempts must be between 0 and maxAttempts');
}
if (!['ready', 'retry', 'blocked', 'complete'].includes(cursor.status)) {
  throw new Error('Invalid backfill cursor status: ' + cursor.status);
}
if (cursor.lastError !== null && typeof cursor.lastError !== 'string') {
  throw new Error('Backfill cursor lastError must be null or string');
}
if (!isDate(cursor.receiptFrom)) throw new Error('Backfill cursor receiptFrom must be a date');
if (Number.isNaN(new Date(cursor.updatedAt).getTime())) throw new Error('Backfill cursor updatedAt must be an ISO timestamp');

const dates = dateSequence(cursor.from, cursor.to);
if (cursor.completed > dates.length) throw new Error('Backfill cursor completed exceeds campaign length');

const expectedLast = cursor.completed > 0 ? dates[cursor.completed - 1] : null;
const expectedNext = cursor.completed < dates.length ? dates[cursor.completed] : null;
if ((cursor.lastCompletedDate ?? null) !== expectedLast) {
  throw new Error(`lastCompletedDate mismatch: expected ${expectedLast}, got ${cursor.lastCompletedDate}`);
}
if ((cursor.nextPublicationDate ?? null) !== expectedNext) {
  throw new Error(`nextPublicationDate mismatch: expected ${expectedNext}, got ${cursor.nextPublicationDate}`);
}
if (cursor.completed === dates.length && cursor.status !== 'complete') {
  throw new Error('Completed campaign must have status=complete');
}
if (cursor.completed < dates.length && cursor.status === 'complete') {
  throw new Error('Incomplete campaign cannot have status=complete');
}
if (cursor.status === 'blocked' && cursor.attempts < cursor.maxAttempts) {
  throw new Error('Blocked cursor must have attempts >= maxAttempts');
}
if (cursor.status === 'ready' && cursor.attempts !== 0) {
  throw new Error('Ready cursor must have attempts=0');
}

const runsDir = path.join('data', 'backfill', 'runs');
const receiptFiles = fs.existsSync(runsDir)
  ? fs.readdirSync(runsDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()
  : [];
const receipts = new Map();

for (const name of receiptFiles) {
  const receiptPath = path.join(runsDir, name);
  const receiptRaw = fs.readFileSync(receiptPath, 'utf8');
  const receipt = JSON.parse(receiptRaw);
  if (receiptRaw !== JSON.stringify(receipt, null, 2) + '\n') {
    throw new Error(`Replay receipt must be canonical JSON: ${receiptPath}`);
  }
  if (
    receipt.schemaVersion !== 1 ||
    receipt.mode !== 'publication-date-replay' ||
    !isDate(receipt.publicationDate) ||
    Number.isNaN(new Date(receipt.completedAt).getTime()) ||
    !Array.isArray(receipt.affectedEventDates) ||
    !receipt.affectedEventDates.every(isDate) ||
    !Array.isArray(receipt.changedFiles) ||
    !receipt.changedFiles.every((value) => typeof value === 'string')
  ) {
    throw new Error(`Invalid replay receipt: ${receiptPath}`);
  }
  if (name !== receipt.publicationDate + '.json') {
    throw new Error(`Replay receipt filename/date mismatch: ${receiptPath}`);
  }
  if (receipt.publicationDate > (cursor.lastCompletedDate ?? '0000-00-00')) {
    throw new Error(`Replay receipt is ahead of cursor: ${receiptPath}`);
  }
  receipts.set(receipt.publicationDate, receipt);
}

if (cursor.lastCompletedDate && cursor.lastCompletedDate >= cursor.receiptFrom) {
  for (const date of dateSequence(cursor.receiptFrom, cursor.lastCompletedDate)) {
    if (!receipts.has(date)) throw new Error(`Missing replay receipt for completed v2 date: ${date}`);
  }
}

console.log(`Validated replay cursor: ${cursor.completed}/${dates.length} completed; next ${cursor.nextPublicationDate ?? 'none'}; ${receipts.size} receipt(s).`);
