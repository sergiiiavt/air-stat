import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = readFileSync(
  new URL('../migrations/0020_full_war_history_queue.sql', import.meta.url),
  'utf8',
);
const worker = readFileSync(
  new URL('../worker/automated-research.ts', import.meta.url),
  'utf8',
);

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE automated_research_days (
  event_date TEXT PRIMARY KEY,
  status TEXT NOT NULL
)`);
db.prepare('INSERT INTO automated_research_days VALUES (?, ?)').run('2026-03-18', 'done');
db.exec(migration);

const count = () => db.prepare('SELECT COUNT(*) AS count FROM automated_research_days').get().count;
const status = (date) => db.prepare(
  'SELECT status FROM automated_research_days WHERE event_date = ?',
).get(date)?.status;

assert.equal(count(), 1484, '2022-02-24 through 2026-03-18 must be seeded inclusively');
assert.equal(status('2022-02-24'), 'pending');
assert.equal(status('2024-02-29'), 'pending', 'Leap day must not be skipped');
assert.equal(status('2026-03-18'), 'done', 'Already processed dates must not reset');
assert.equal(status('2026-03-19'), undefined, 'Previously seeded 2026 range is owned by 0014');
db.exec(migration);
assert.equal(count(), 1484, 'Migration must be safe to re-run');
assert.equal(status('2026-03-18'), 'done', 'Re-run must preserve historical status');

assert.match(worker, /const CAMPAIGN_FROM = '2022-02-24'/);
assert.match(worker, /addDays\(kyivDate\(\), -RECENT_PUBLICATION_DAYS\)/);
assert.match(worker, /async function extendHistoricalQueue\(/);
assert.match(worker, /INSERT OR IGNORE INTO automated_research_days\(event_date, status\)/);
assert.match(worker, /await extendHistoricalQueue\(env\)/);
assert.match(worker, /const fullyComplete = unfinished === 0 && needsReview === 0/);
assert.match(worker, /const evidenceGap = result\.candidates\.length === 0/);

db.close();
console.log('Full-history queue migration and integration contracts passed');
