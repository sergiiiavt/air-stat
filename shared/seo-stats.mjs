// Alert-timing statistics for crawlable archive pages (/stats/...).
//
// Numbers must match the dashboard (/api/range):
// - alert count per day = daily_stats.alert_count: raw rows grouped by their
//   stored local_date, overlapping rows within that day merged (start > max end
//   starts a new interval);
// - alert time per day = union of all raw rows of the scope (source duplicates
//   and oblast/raion/hromada overlaps collapse), split at Europe/Kyiv midnight,
//   open intervals clipped at `now` (same as partitionAlertWindows +
//   dailyAlertLevelSeconds, which scripts/test-seo-stats.mjs checks).
// This module avoids per-window Intl calls: the dashboard helpers cost ~0.5 s
// CPU over the full oblast history, this implementation a few milliseconds.

const HOUR = 3_600_000;
const DAY = 86_400_000;

const kyivOffsetFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function intlOffset(ms) {
  const p = Object.fromEntries(kyivOffsetFormat.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/** Offset table for Europe/Kyiv: a few Intl calls per year instead of per window. */
export function createKyivClock(fromMs, toMs) {
  const startYear = new Date(fromMs).getUTCFullYear() - 1;
  const endYear = new Date(toMs).getUTCFullYear() + 1;
  const transitions = [{ at: -Infinity, offset: intlOffset(Date.UTC(startYear, 0, 1)) }];
  for (let year = startYear; year <= endYear; year++) {
    // Probe at whole hours; transitions happen on the hour in this zone.
    const probes = [Date.UTC(year, 0, 1), Date.UTC(year, 6, 1), Date.UTC(year + 1, 0, 1)];
    for (let i = 0; i < probes.length - 1; i++) {
      let lo = probes[i];
      let hi = probes[i + 1];
      const before = intlOffset(lo);
      const after = intlOffset(hi);
      if (before === after) continue;
      while (hi - lo > HOUR) {
        const mid = lo + Math.floor((hi - lo) / 2 / HOUR) * HOUR;
        if (mid <= lo) break;
        if (intlOffset(mid) === before) lo = mid;
        else hi = mid;
      }
      transitions.push({ at: hi, offset: after });
    }
  }
  transitions.sort((a, b) => a.at - b.at);

  function offsetAt(ms) {
    let lo = 0;
    let hi = transitions.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (transitions[mid].at <= ms) lo = mid;
      else hi = mid - 1;
    }
    return transitions[lo].offset;
  }

  function localDate(ms) {
    return new Date(ms + offsetAt(ms)).toISOString().slice(0, 10);
  }

  function localHour(ms) {
    return new Date(ms + offsetAt(ms)).getUTCHours();
  }

  /** UTC instant of 00:00 Kyiv time on a calendar date. */
  function midnight(date) {
    const wall = Date.parse(`${date}T00:00:00Z`);
    let utc = wall - offsetAt(wall);
    utc = wall - offsetAt(utc);
    return utc;
  }

  return { offsetAt, localDate, localHour, midnight };
}

export function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function emptyPeriod(key) {
  return {
    key,
    alertCount: 0,
    alertSeconds: 0,
    daysWithAlerts: 0,
    observedDays: 0,
    observedSeconds: 0,
    longest: null,
    maxCountDay: null,
    maxSecondsDay: null,
    hourSeconds: Array.from({ length: 24 }, () => 0),
    firstDate: null,
    lastDate: null,
  };
}

/**
 * rows: [{ started_at, ended_at, local_date }] for one scope.
 * Returns per-day, per-month and per-year statistics from coverageFrom to the
 * Kyiv date of `now`.
 */
export function computeAlertHistory(rows, { coverageFrom, until = null, now = new Date().toISOString() }) {
  const nowMs = Date.parse(now);
  const fromMs = Date.parse(`${coverageFrom}T00:00:00Z`) - 2 * DAY;
  const clock = createKyivClock(fromMs, nowMs);
  const currentDate = clock.localDate(nowMs);
  // `until` limits the computed calendar range (callers query a matching row window).
  const lastDate = until && until < currentDate ? until : currentDate;

  const parsed = [];
  for (const row of rows) {
    const start = Date.parse(row.started_at);
    const end = Math.min(row.ended_at ? Date.parse(row.ended_at) : nowMs, nowMs);
    if (!Number.isFinite(start)) continue;
    parsed.push({ start, end: Number.isFinite(end) ? end : nowMs, localDate: row.local_date });
  }

  // 1) daily_stats-compatible counts.
  const byLocalDate = new Map();
  for (const row of parsed) {
    if (!row.localDate) continue;
    const list = byLocalDate.get(row.localDate) ?? [];
    list.push(row);
    byLocalDate.set(row.localDate, list);
  }
  const countByDate = new Map();
  for (const [date, list] of byLocalDate) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    let count = 0;
    let maxEnd = -Infinity;
    for (const row of list) {
      if (row.start > maxEnd) count++;
      maxEnd = Math.max(maxEnd, row.end);
    }
    countByDate.set(date, count);
  }

  // 2) Union of every raw interval (dashboard alert time).
  const sorted = parsed.filter((row) => row.end > row.start).sort((a, b) => a.start - b.start);
  const union = [];
  for (const row of sorted) {
    const last = union.at(-1);
    if (last && row.start <= last.end) last.end = Math.max(last.end, row.end);
    else union.push({ start: row.start, end: row.end });
  }

  // 3) Split the union at Kyiv midnights and hours.
  const secondsByDate = new Map();
  const hoursByDate = new Map();
  const dateByDayNumber = new Map();
  for (const window of union) {
    let cursor = window.start;
    let offset = clock.offsetAt(cursor);
    while (cursor < window.end) {
      const nextHour = Math.min(window.end, (Math.floor(cursor / HOUR) + 1) * HOUR);
      // Offsets change only on whole hours, so one lookup per hour segment.
      if (cursor % HOUR === 0) offset = clock.offsetAt(cursor);
      const local = cursor + offset;
      const dayNumber = Math.floor(local / DAY);
      let date = dateByDayNumber.get(dayNumber);
      if (!date) {
        date = new Date(dayNumber * DAY).toISOString().slice(0, 10);
        dateByDayNumber.set(dayNumber, date);
      }
      const hour = Math.floor((local - dayNumber * DAY) / HOUR);
      const seconds = (nextHour - cursor) / 1000;
      secondsByDate.set(date, (secondsByDate.get(date) ?? 0) + seconds);
      const hours = hoursByDate.get(date) ?? Array.from({ length: 24 }, () => 0);
      hours[hour] += seconds;
      hoursByDate.set(date, hours);
      cursor = nextHour;
    }
  }

  const days = [];
  for (let date = coverageFrom; date <= lastDate; date = addDays(date, 1)) {
    days.push({
      date,
      alertCount: countByDate.get(date) ?? 0,
      alertSeconds: Math.round(secondsByDate.get(date) ?? 0),
    });
  }

  const months = new Map();
  const years = new Map();
  const total = emptyPeriod('all');
  const nowSeconds = (nowMs - clock.midnight(currentDate)) / 1000;

  for (const day of days) {
    const month = day.date.slice(0, 7);
    const year = day.date.slice(0, 4);
    const observed = day.date === currentDate ? Math.max(0, nowSeconds) : (clock.midnight(addDays(day.date, 1)) - clock.midnight(day.date)) / 1000;
    const hours = hoursByDate.get(day.date);
    for (const [map, key] of [[months, month], [years, year], [null, 'all']]) {
      const period = map ? (map.get(key) ?? emptyPeriod(key)) : total;
      if (map && !map.has(key)) map.set(key, period);
      period.alertCount += day.alertCount;
      period.alertSeconds += day.alertSeconds;
      period.observedDays += 1;
      period.observedSeconds += observed;
      if (day.alertSeconds > 0 || day.alertCount > 0) period.daysWithAlerts += 1;
      period.firstDate ??= day.date;
      period.lastDate = day.date;
      if (day.alertCount > 0 && (!period.maxCountDay || day.alertCount > period.maxCountDay.alertCount)) {
        period.maxCountDay = { date: day.date, alertCount: day.alertCount };
      }
      if (day.alertSeconds > 0 && (!period.maxSecondsDay || day.alertSeconds > period.maxSecondsDay.alertSeconds)) {
        period.maxSecondsDay = { date: day.date, alertSeconds: day.alertSeconds };
      }
      if (hours) for (let h = 0; h < 24; h++) period.hourSeconds[h] += hours[h];
    }
  }

  // Longest continuous alert, attributed to the period of its Kyiv start date.
  for (const window of union) {
    const date = clock.localDate(window.start);
    if (date < coverageFrom || date > lastDate) continue;
    const seconds = Math.round((window.end - window.start) / 1000);
    const longest = {
      startedAt: new Date(window.start).toISOString(),
      endedAt: new Date(window.end).toISOString(),
      seconds,
      ongoing: window.end >= nowMs,
    };
    for (const period of [months.get(date.slice(0, 7)), years.get(date.slice(0, 4)), total]) {
      if (period && (!period.longest || seconds > period.longest.seconds)) period.longest = longest;
    }
  }

  const round = (period) => ({
    ...period,
    observedSeconds: Math.round(period.observedSeconds),
    hourSeconds: period.hourSeconds.map((value) => Math.round(value)),
  });

  return {
    coverageFrom,
    generatedAt: new Date(nowMs).toISOString(),
    today: currentDate,
    until: lastDate,
    days,
    months: [...months.values()].map(round),
    years: [...years.values()].map(round),
    total: round(total),
  };
}

/** Inclusive list of YYYY-MM keys. */
export function monthKeysBetween(fromMonth, toMonth) {
  const keys = [];
  let [y, m] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return keys;
}
