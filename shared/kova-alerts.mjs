// KOVA (Kyiv Oblast Military Administration) public Telegram alert-state parser.
//
// Shared by the Worker collectors and the Node regression script so both use
// one implementation. Posts are read from the plain public feed, never from a
// Telegram search: a search for "повітряна тривога" only returns clear posts
// that carry the "тривога досі триває у…" footer, so the final clear of every
// episode (and every whole-oblast clear) was invisible and intervals stayed
// open indefinitely.

export const KOVA_OBLAST_AREA = 'Kyiv Oblast';

export const KOVA_RAIONS = [
  'Білоцерківський район',
  'Бориспільський район',
  'Броварський район',
  'Бучанський район',
  'Вишгородський район',
  'Обухівський район',
  'Фастівський район',
];

const CANONICAL_AREAS = [
  ...KOVA_RAIONS.map((adminArea) => ({
    adminArea,
    normalized: adminArea.toLocaleLowerCase('uk-UA'),
  })),
  { adminArea: KOVA_OBLAST_AREA, normalized: 'київська область' },
  { adminArea: KOVA_OBLAST_AREA, normalized: 'київській області' },
];

function escapeRegex(value) {
  return [...value]
    .map((char) => ('\\^$.*+?()[]{}|'.includes(char) ? '\\' + char : char))
    .join('');
}

const AREA_FIRST_PATTERNS = CANONICAL_AREAS.map((area) => ({
  adminArea: area.adminArea,
  pattern: new RegExp(
    '^' + escapeRegex(area.normalized) +
      '\\s*[-:]\\s*(відбій повітряної тривоги|повітряна тривога)(?:$|[,;.!?\\s⚠])',
    'u',
  ),
}));

export function kovaAlertEvent(text) {
  const normalized = String(text ?? '')
    .toLocaleLowerCase('uk-UA')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[🔴🟡🟢]\s*/u, '');

  for (const { adminArea, pattern } of AREA_FIRST_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        kind: match[1].startsWith('відбій') ? 'clear' : 'start',
        adminArea,
      };
    }
  }

  if (/^відбій повітряної тривоги\s+(?:в|у)\s+київській області(?:$|[,;.!?\s])/u.test(normalized)) {
    return { kind: 'clear', adminArea: KOVA_OBLAST_AREA };
  }
  if (/^повітряна тривога\s+(?:в|у)\s+київській області(?:$|[,;.!?\s])/u.test(normalized)) {
    return { kind: 'start', adminArea: KOVA_OBLAST_AREA };
  }
  return null;
}

export function kovaAlertKind(text) {
  return kovaAlertEvent(text)?.kind ?? null;
}

export function kovaThreatTypes(text) {
  const normalized = String(text ?? '').toLocaleLowerCase('uk-UA');
  const threats = [];
  if (/дрон|бпла|шахед/.test(normalized)) threats.push('uav');
  if (/баліст/.test(normalized)) threats.push('ballistic');
  if (/крилат/.test(normalized)) threats.push('cruise');
  if (/ракет/.test(normalized) && threats.length === 0) threats.push('unknown');
  return threats;
}

// A whole-oblast start puts every raion under alert. KOVA often ends such an
// episode with per-raion clears and no whole-oblast clear, so the start is
// stored as one interval per raion; each raion's clear (or a whole-oblast
// clear) closes its own interval.
export function kovaStartAreas(event) {
  if (!event || event.kind !== 'start') return [];
  return event.adminArea === KOVA_OBLAST_AREA ? [...KOVA_RAIONS] : [event.adminArea];
}

export function kovaIntervalExternalId(postId, adminArea, wholeOblastStart) {
  return wholeOblastStart ? `kova:${postId}#${adminArea}` : `kova:${postId}`;
}

export function kovaPostNumber(id) {
  const match = String(id ?? '').match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function comparePosts(a, b) {
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  return (kovaPostNumber(a.id) ?? 0) - (kovaPostNumber(b.id) ?? 0);
}

// Rebuilds intervals from an ordered post history. Intervals still open at the
// end are kept only when they started within `openWindowMs` of `nowMs`; older
// unmatched starts are dropped rather than given an invented end time.
export function buildKovaIntervals(posts, { nowMs = Date.now(), openWindowMs = 24 * 60 * 60 * 1000 } = {}) {
  const ordered = [...posts].sort(comparePosts);
  const open = new Map();
  const intervals = [];

  const close = (adminArea, clearPost) => {
    const started = open.get(adminArea);
    if (!started || clearPost.time < started.post.time) return;
    intervals.push({
      externalId: kovaIntervalExternalId(started.post.id, adminArea, started.wholeOblast),
      startedAt: started.post.time,
      endedAt: clearPost.time,
      sourceUrl: started.post.url,
      adminArea,
      threatTypes: kovaThreatTypes(started.post.text),
    });
    open.delete(adminArea);
  };

  for (const post of ordered) {
    const event = kovaAlertEvent(post.text);
    if (!event) continue;

    if (event.kind === 'start') {
      const wholeOblast = event.adminArea === KOVA_OBLAST_AREA;
      for (const adminArea of kovaStartAreas(event)) {
        if (!open.has(adminArea)) open.set(adminArea, { post, wholeOblast });
      }
      continue;
    }

    const targets = event.adminArea === KOVA_OBLAST_AREA ? [...open.keys()] : [event.adminArea];
    for (const adminArea of targets) close(adminArea, post);
  }

  const openCutoff = nowMs - openWindowMs;
  for (const [adminArea, started] of open) {
    if (new Date(started.post.time).getTime() < openCutoff) continue;
    intervals.push({
      externalId: kovaIntervalExternalId(started.post.id, adminArea, started.wholeOblast),
      startedAt: started.post.time,
      endedAt: null,
      sourceUrl: started.post.url,
      adminArea,
      threatTypes: kovaThreatTypes(started.post.text),
    });
  }

  return intervals.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
