import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const queuePath = path.join(root, 'data/backfill/queue.json');
const args = process.argv.slice(2);

function arg(name, fallback = null) {
  const index = args.indexOf('--' + name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : 'true';
}

function nowIso() {
  return new Date().toISOString();
}

function loadQueue() {
  return JSON.parse(fs.readFileSync(queuePath, 'utf8'));
}

function saveQueue(queue) {
  queue.updatedAt = nowIso();
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n');
}

function staleRunningToRetry(queue) {
  const staleMinutes = Number(queue.staleAfterMinutes ?? 120);
  const cutoff = Date.now() - staleMinutes * 60_000;
  let changed = false;

  for (const day of queue.days) {
    if (day.status !== 'in_progress' || !day.claimedAt) continue;
    if (new Date(day.claimedAt).getTime() >= cutoff) continue;

    day.status = day.attempts >= queue.maxAttempts ? 'failed' : 'retry';
    day.lastError = day.lastError || 'Claim expired before completion';
    day.claimedAt = null;
    changed = true;
  }

  return changed;
}

function summary(queue) {
  const counts = Object.fromEntries(
    ['pending', 'in_progress', 'retry', 'completed', 'needs_review', 'failed']
      .map((status) => [status, queue.days.filter((day) => day.status === status).length]),
  );
  const done = counts.completed;
  return {
    campaign: queue.campaign,
    from: queue.from,
    to: queue.to,
    batchSize: queue.batchSize,
    maxAttempts: queue.maxAttempts,
    total: queue.days.length,
    ...counts,
    completionPercent: Number(((done / queue.days.length) * 100).toFixed(1)),
    nextDates: queue.days
      .filter((day) => day.status === 'retry' || day.status === 'pending')
      .slice(0, queue.batchSize)
      .map((day) => day.date),
  };
}

const command = args[0] ?? 'status';
const queue = loadQueue();
const staleChanged = staleRunningToRetry(queue);

if (command === 'status') {
  if (staleChanged && arg('write') === 'true') saveQueue(queue);
  console.log(JSON.stringify(summary(queue), null, 2));
  process.exit(0);
}

if (command === 'next') {
  const count = Number(arg('count', queue.batchSize));
  const days = queue.days
    .filter((day) => day.status === 'retry' || day.status === 'pending')
    .slice(0, count);
  console.log(JSON.stringify(days, null, 2));
  process.exit(0);
}

if (command === 'claim') {
  const count = Number(arg('count', queue.batchSize));
  const selected = queue.days
    .filter((day) => day.status === 'retry' || day.status === 'pending')
    .slice(0, count);

  const claimedAt = nowIso();
  for (const day of selected) {
    day.status = 'in_progress';
    day.claimedAt = claimedAt;
    day.attempts += 1;
    day.lastError = null;
  }

  saveQueue(queue);
  console.log(JSON.stringify({
    claimedAt,
    dates: selected.map((day) => day.date),
    summary: summary(queue),
  }, null, 2));
  process.exit(0);
}

const date = arg('date');
if (!date) throw new Error(`${command} requires --date YYYY-MM-DD`);
const day = queue.days.find((item) => item.date === date);
if (!day) throw new Error(`Date is outside the campaign: ${date}`);

if (command === 'complete') {
  day.status = 'completed';
  day.completedAt = nowIso();
  day.claimedAt = null;
  day.lastError = null;
  day.researchRevision = arg('revision', day.researchRevision ?? null);
  saveQueue(queue);
  console.log(JSON.stringify({ date, status: day.status, summary: summary(queue) }, null, 2));
  process.exit(0);
}

if (command === 'retry') {
  day.status = day.attempts >= queue.maxAttempts ? 'failed' : 'retry';
  day.claimedAt = null;
  day.lastError = arg('error', 'Research attempt failed');
  saveQueue(queue);
  console.log(JSON.stringify({ date, status: day.status, attempts: day.attempts, summary: summary(queue) }, null, 2));
  process.exit(0);
}

if (command === 'review') {
  day.status = 'needs_review';
  day.claimedAt = null;
  day.lastError = arg('reason', 'Manual review required');
  saveQueue(queue);
  console.log(JSON.stringify({ date, status: day.status, summary: summary(queue) }, null, 2));
  process.exit(0);
}

throw new Error(`Unknown command: ${command}`);
