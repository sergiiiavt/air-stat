// The URL is the source of truth when a dashboard link is opened.
// A preset is rolling (for example, the latest 30 Kyiv calendar days);
// explicit from/to dates share a fixed historical period.
const PRESET_DAYS = new Set([3, 7, 30, 90, 180]);
const VIEW_TO_QUERY = { map: 'map', timeline: 'daily', hours: 'hours', trends: 'trends' };
const QUERY_TO_VIEW = { map: 'map', daily: 'timeline', timeline: 'timeline', hours: 'hours', trends: 'trends' };
const SCOPES = new Set(['kyiv-city', 'kyiv-oblast', 'both']);
const STATE_PARAMS = ['view', 'days', 'from', 'to', 'scope'];

function shiftDay(day, amount) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function isCalendarDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function readSharedState(search, today) {
  const query = new URLSearchParams(search);
  if (!STATE_PARAMS.some((name) => query.has(name))) return null;

  const queryView = query.get('view');
  const viewMode = Object.hasOwn(QUERY_TO_VIEW, queryView) ? QUERY_TO_VIEW[queryView] : 'map';
  const requestedScope = query.get('scope');
  const scope = viewMode === 'map' && SCOPES.has(requestedScope) ? requestedScope : 'kyiv-city';
  const requestedDays = query.get('days');
  const days = /^\d+$/.test(requestedDays ?? '') ? Number(requestedDays) : null;

  if (PRESET_DAYS.has(days)) {
    return { viewMode, scope, from: shiftDay(today, -(days - 1)), to: today, presetDays: days };
  }

  const from = query.get('from');
  const to = query.get('to');
  if (isCalendarDay(from) && isCalendarDay(to) && from <= to && to <= today) {
    return { viewMode, scope, from, to, presetDays: null };
  }

  return { viewMode, scope, from: shiftDay(today, -6), to: today, presetDays: 7 };
}

export function buildShareUrl(href, { viewMode, scope, from, to, presetDays }) {
  const url = new URL(href);
  for (const name of STATE_PARAMS) url.searchParams.delete(name);

  url.searchParams.set('view', VIEW_TO_QUERY[viewMode]);
  if (presetDays !== null && PRESET_DAYS.has(presetDays)) {
    url.searchParams.set('days', String(presetDays));
  } else {
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);
  }

  if (viewMode === 'map' && scope !== 'kyiv-city') {
    url.searchParams.set('scope', scope);
  }

  return url.toString();
}
