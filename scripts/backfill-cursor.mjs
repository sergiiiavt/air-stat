import fs from 'node:fs';

const path = 'data/backfill/cursor.json';
const cursor = JSON.parse(fs.readFileSync(path, 'utf8'));

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

const dates = dateSequence(cursor.from, cursor.to);
const total = dates.length;
const failed = cursor.status === 'blocked' ? 1 : 0;
const retry = cursor.status === 'retry' ? 1 : 0;
const pending = Math.max(0, total - cursor.completed - failed - retry);
const summary = {
  campaign: cursor.campaign,
  mode: cursor.mode,
  stateVersion: cursor.schemaVersion,
  from: cursor.from,
  to: cursor.to,
  total,
  completed: cursor.completed,
  pending,
  retry,
  failed,
  completionPercent: total ? Number(((cursor.completed / total) * 100).toFixed(1)) : 0,
  pipelineStatus: cursor.status,
  lastCompletedDate: cursor.lastCompletedDate,
  nextPublicationDate: cursor.nextPublicationDate,
  attempts: cursor.attempts,
  maxAttempts: cursor.maxAttempts,
  staleAfterHours: cursor.staleAfterHours,
  updatedAt: cursor.updatedAt,
  lastError: cursor.lastError,
};

const command = process.argv[2] ?? 'status';
if (command === 'status') {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
if (command === 'next') {
  console.log(JSON.stringify({
    publicationDate: cursor.nextPublicationDate,
    status: cursor.status,
    attempts: cursor.attempts,
    maxAttempts: cursor.maxAttempts,
  }, null, 2));
  process.exit(0);
}
throw new Error('Unknown command: ' + command);
