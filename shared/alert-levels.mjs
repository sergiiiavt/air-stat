// Levels describe official alerts, never consequences or our own risk estimate.
export const ALERT_LEVELS = ['yellow', 'red', 'unknown'];
export const LEVEL_OBSERVATION_TTL_MS = 150_000;

const causeLevels = new Map([
  ['drone', 'yellow'],
  ['missile', 'red'],
  ['massive-drone', 'red'],
  ['missile-drone', 'red'],
]);

export function alertLevelFromCauses(causes, lastCause) {
  const values = [...new Set((Array.isArray(causes) ? causes : [causes])
    .filter((value) => typeof value === 'string').map((value) => value.toLowerCase()))];
  // Current-state last_cause is authoritative only when it is still active.
  if (lastCause != null) {
    return values.includes(lastCause) ? causeLevels.get(lastCause) ?? 'unknown' : 'unknown';
  }
  const levels = new Set(values.map((value) => causeLevels.get(value) ?? 'unknown'));
  // Historical mixed causes do not say WHEN a yellow/red change happened.
  return levels.size === 1 ? [...levels][0] : 'unknown';
}

const kyivClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function clockParts(time) {
  return Object.fromEntries(kyivClock.formatToParts(new Date(time)).map((part) => [part.type, part.value]));
}

export function kyivLocalDate(time) {
  const p = clockParts(time);
  return `${p.year}-${p.month}-${p.day}`;
}

export function parseKyivTimestamp(value) {
  if (typeof value !== 'string') return null;
  if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const wall = Date.UTC(...match.slice(1).map(Number).map((n, i) => i === 1 ? n - 1 : n));
  let utc = wall;
  for (let i = 0; i < 3; i++) {
    const p = clockParts(utc);
    const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utc;
    utc = wall - offset;
  }
  return new Date(utc).toISOString();
}

export function normalizeKyivEvents(items) {
  const events = new Map();
  for (const item of items) {
    const at = parseKyivTimestamp(item.created_at);
    if (!at || (item.state !== 0 && item.state !== 1)) continue;
    const causes = Array.isArray(item.causes) ? item.causes : item.cause ? [item.cause] : [];
    events.set(at, { at, state: item.state, causes, level: alertLevelFromCauses(causes) });
  }
  return [...events.values()].sort((a, b) => a.at.localeCompare(b.at));
}

/** Union source duplicates, then overlay bounded observations of current levels. */
export function partitionAlertWindows(windows, observations = [], now = new Date().toISOString()) {
  const nowMs = Date.parse(now);
  const result = [];
  for (const scope of ['kyiv-city', 'kyiv-oblast']) {
    const raw = windows.filter((w) => w.scope === scope);
    const boundaries = [];
    let serial = 0;
    function add(start, end, level, priority, base = false, threats = []) {
      const a = Date.parse(start), b = Math.min(Date.parse(end ?? now), nowMs);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return;
      const item = { key: serial++, level: ALERT_LEVELS.includes(level) ? level : 'unknown', priority, base, threats };
      boundaries.push({ at: a, delta: 1, item }, { at: b, delta: -1, item });
    }
    for (const w of raw) add(w.startedAt, w.endedAt, w.alertLevel, w.alertLevel && w.alertLevel !== 'unknown' ? 1 : 0, true, w.threatTypes);

    const byEpisode = new Map();
    if (scope === 'kyiv-city') for (const observation of observations) {
      const group = byEpisode.get(observation.episodeStartedAt) ?? [];
      group.push(observation);
      byEpisode.set(observation.episodeStartedAt, group);
    }
    for (const [episodeStart, group] of byEpisode) {
      const episode = raw.find((w) => w.sourceKey === 'kyiv_open_data' && w.startedAt === episodeStart);
      if (!episode) continue;
      group.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
      // Once polling began, never bridge a collector outage with a guessed level.
      add(group[0].observedAt, episode.endedAt, 'unknown', 2);
      for (let i = 0; i < group.length; i++) {
        const o = group[i];
        const end = Math.min(
          Date.parse(o.lastObservedAt) + LEVEL_OBSERVATION_TTL_MS,
          Date.parse(group[i + 1]?.observedAt ?? now),
          Date.parse(episode.endedAt ?? now), nowMs,
        );
        add(o.observedAt, new Date(end).toISOString(), o.alertLevel, 3);
      }
    }
    boundaries.sort((a, b) => a.at - b.at);
    const active = new Map();
    let previous = boundaries[0]?.at;
    for (let i = 0; i < boundaries.length;) {
      const at = boundaries[i].at;
      if (previous < at && [...active.values()].some((item) => item.base)) {
        const items = [...active.values()];
        const priority = Math.max(...items.map((item) => item.priority));
        const levels = new Set(items.filter((item) => item.priority === priority).map((item) => item.level));
        const alertLevel = levels.size === 1 ? [...levels][0] : 'unknown';
        const threats = [...new Set(items.flatMap((item) => item.threats ?? []))].sort();
        const last = result.at(-1);
        if (last?.scope === scope && Date.parse(last.endedAt) === previous && last.alertLevel === alertLevel) {
          last.endedAt = new Date(at).toISOString();
          last.threatTypes = [...new Set([...last.threatTypes, ...threats])];
        } else {
          result.push({ id: `${scope}:${previous}`, scope, localDate: kyivLocalDate(previous),
            startedAt: new Date(previous).toISOString(), endedAt: new Date(at).toISOString(),
            isActive: false, alertType: 'air_raid', alertLevel, threatTypes: threats });
        }
      }
      while (i < boundaries.length && boundaries[i].at === at) {
        const boundary = boundaries[i++];
        if (boundary.delta === 1) active.set(boundary.item.key, boundary.item);
        else active.delete(boundary.item.key);
      }
      previous = at;
    }
    const last = result.at(-1);
    if (last?.scope === scope && Date.parse(last.endedAt) === nowMs) {
      last.isActive = raw.some((w) => w.isActive && Date.parse(w.startedAt) < nowMs);
    }
  }
  return result.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.scope.localeCompare(b.scope));
}

export function dailyAlertLevelSeconds(windows, from, to) {
  const days = new Map();
  for (const w of windows) {
    let cursor = Date.parse(w.startedAt);
    const end = Date.parse(w.endedAt);
    while (cursor < end) {
      const date = kyivLocalDate(cursor);
      if (date > to) break;
      const nextDate = new Date(`${date}T12:00:00Z`);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const midnight = Date.parse(parseKyivTimestamp(`${nextDate.toISOString().slice(0, 10)} 00:00:00`));
      const next = Math.min(end, midnight);
      if (date >= from) {
        const key = `${date}:${w.scope}`;
        const day = days.get(key) ?? { date, scope: w.scope, yellow: 0, red: 0, unknown: 0 };
        day[ALERT_LEVELS.includes(w.alertLevel) ? w.alertLevel : 'unknown'] += (next - cursor) / 1000;
        days.set(key, day);
      }
      cursor = next;
    }
  }
  return [...days.values()];
}
