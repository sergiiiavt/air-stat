function addDays(date, amount) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

/**
 * Choose the publication day that has gone longest without a scan attempt.
 * Use attempts, not successes: a failing provider must not starve other days.
 * On ties, prefer the newest day so same-day reports surface early.
 */
export function selectNextRecentScanDate(today, windowDays, attempts) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isInteger(windowDays) || windowDays < 1) {
    throw new Error('Invalid recent scan date or window');
  }

  const latestByDate = new Map();
  for (const attempt of attempts) {
    if (typeof attempt.target_date !== 'string' || typeof attempt.last_attempt_at !== 'string') continue;
    const previous = latestByDate.get(attempt.target_date);
    if (!previous || attempt.last_attempt_at > previous) {
      latestByDate.set(attempt.target_date, attempt.last_attempt_at);
    }
  }

  let chosen = today;
  let oldest = latestByDate.get(today) ?? '';
  for (let offset = 1; offset < windowDays; offset += 1) {
    const date = addDays(today, -offset);
    const lastAttempt = latestByDate.get(date) ?? '';
    if (lastAttempt < oldest) {
      oldest = lastAttempt;
      chosen = date;
    }
  }
  return chosen;
}
