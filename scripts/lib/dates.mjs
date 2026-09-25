const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(value) {
  if (!DATE_PATTERN.test(value ?? '')) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDays(date, days) {
  const cursor = new Date(`${date}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

/** Inclusive; ISO dates compare correctly as plain strings. */
export function dateSequence(from, to) {
  const out = [];
  let current = from;
  while (current <= to) {
    out.push(current);
    current = addDays(current, 1);
  }
  return out;
}

/** UTC ISO timestamp without milliseconds, e.g. 2026-09-25T10:16:03Z. */
export function isoSeconds(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function addHours(iso, hours) {
  return isoSeconds(new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000));
}

export function dataFilePath(date) {
  return `data/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.json`;
}
