import fs from 'node:fs';

const path = 'data/backfill/queue.json';
const raw = fs.readFileSync(path, 'utf8');
const queue = JSON.parse(raw);
const canonical = JSON.stringify(queue, null, 2) + '\n';

if (raw !== canonical) {
  throw new Error('Backfill queue must be canonical 2-space, multiline JSON. Run the queue CLI or reformat it before committing.');
}
const allowed = new Set(['pending', 'in_progress', 'retry', 'completed', 'needs_review', 'failed']);

function dateSequence(from, to) {
  const out = [];
  const cursor = new Date(from + 'T12:00:00Z');
  const end = new Date(to + 'T12:00:00Z');
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

if (queue.schemaVersion !== 1) throw new Error('Backfill queue schemaVersion must be 1');
if (queue.mode !== 'publication-date-replay') {
  throw new Error('Backfill queue mode must be publication-date-replay');
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(queue.from) || !/^\d{4}-\d{2}-\d{2}$/.test(queue.to)) {
  throw new Error('Backfill queue requires valid from/to dates');
}
if (!Number.isInteger(queue.batchSize) || queue.batchSize < 1 || queue.batchSize > 7) {
  throw new Error('Backfill queue batchSize must be between 1 and 7');
}
if (!Number.isInteger(queue.maxAttempts) || queue.maxAttempts < 1 || queue.maxAttempts > 10) {
  throw new Error('Backfill queue maxAttempts must be between 1 and 10');
}
if (!Array.isArray(queue.days)) throw new Error('Backfill queue days must be an array');

const expected = dateSequence(queue.from, queue.to);
if (queue.days.length !== expected.length) {
  throw new Error(`Backfill queue must contain every campaign date: expected ${expected.length}, got ${queue.days.length}`);
}

const seen = new Set();
for (let i = 0; i < queue.days.length; i += 1) {
  const day = queue.days[i];
  if (day.date !== expected[i]) throw new Error(`Backfill queue date order/gap at index ${i}: expected ${expected[i]}, got ${day.date}`);
  if (seen.has(day.date)) throw new Error(`Duplicate backfill date: ${day.date}`);
  seen.add(day.date);
  if (!allowed.has(day.status)) throw new Error(`Invalid status for ${day.date}: ${day.status}`);
  if (!Number.isInteger(day.attempts) || day.attempts < 0) throw new Error(`Invalid attempts for ${day.date}`);
  if ('existingResearchFile' in day && typeof day.existingResearchFile !== 'boolean') {
    throw new Error(`existingResearchFile must be boolean when present for ${day.date}`);
  }
  if (day.status === 'completed' && !day.completedAt) throw new Error(`Completed day must have completedAt: ${day.date}`);
}

console.log(`Validated publication-replay queue with ${queue.days.length} publication day(s), batch size ${queue.batchSize}.`);
