import { chunkValues } from './query-utils.mjs';

type Scope = 'kyiv-city' | 'kyiv-oblast';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ALERTS_API_TOKEN?: string;
}

interface AlertThreat {
  threat_type?: string;
}

interface AlertsApiAlert {
  id: number | string;
  started_at: string;
  finished_at?: string | null;
  alert_type?: string;
  location_uid?: string | number;
  location_oblast_uid?: string | number | null;
  location_title?: string | null;
  location_type?: string | null;
  location_raion?: string | null;
  threats?: AlertThreat[];
}

interface AlertsApiResponse {
  alerts?: AlertsApiAlert[];
}

interface ResearchSource {
  publisher: string;
  type: 'official' | 'media' | 'local';
  url: string;
  publishedAt?: string | null;
  note?: string;
}

interface ResearchAttack {
  id: string;
  scope: Scope;
  date: string;
  startedAt?: string | null;
  endedAt?: string | null;
  threatTypes: string[];
  summary: string;
  verification: 'provisional' | 'confirmed' | 'final';
  confidence: 'low' | 'medium' | 'high';
  casualties: {
    killed: number;
    injured: number;
    status: 'reported' | 'confirmed' | 'final';
  };
  sources: ResearchSource[];
}

interface ResearchIncident {
  id: string;
  attackId?: string | null;
  scope: Scope;
  date: string;
  occurredAt?: string | null;
  area: {
    name: string;
    level:
      | 'city'
      | 'oblast'
      | 'district'
      | 'raion'
      | 'hromada'
      | 'settlement'
      | 'neighborhood'
      | 'street'
      | 'address';
    sourceLocation?: {
      text: string;
      specificity:
        | 'city'
        | 'oblast'
        | 'district'
        | 'raion'
        | 'hromada'
        | 'settlement'
        | 'neighborhood'
        | 'street'
        | 'address';
      officiallyPublished: boolean;
      sourceUrl: string;
      redacted?: boolean;
    } | null;
    map: {
      lat: number;
      lng: number;
      precision:
        | 'city-centroid'
        | 'oblast-centroid'
        | 'district-centroid'
        | 'raion-centroid'
        | 'hromada-centroid'
        | 'settlement-centroid'
        | 'neighborhood-centroid'
        | 'street-segment'
        | 'address-generalized'
        | 'address-point';
      radiusMeters?: number;
      displayMode?: 'point' | 'area';
    };
  };
  impactType:
    | 'impact'
    | 'debris'
    | 'air-defense'
    | 'fire'
    | 'damage'
    | 'no-confirmed-impact'
    | 'unknown';
  threatTypes?: string[];
  summary: string;
  casualties: {
    killed: number;
    injured: number;
    status: 'reported' | 'confirmed' | 'final';
  };
  damage: Array<{
    type: string;
    count?: number | null;
    description: string;
  }>;
  verification: 'provisional' | 'confirmed' | 'final';
  confidence: 'low' | 'medium' | 'high';
  sources: ResearchSource[];
}

interface ResearchDocument {
  schemaVersion: 1;
  date: string;
  generatedAt: string;
  researchWindow: { from: string; to: string };
  attacks: ResearchAttack[];
  incidents: ResearchIncident[];
}

interface ResearchIndex {
  schemaVersion: 1;
  files: Array<{ path: string; revision: string }>;
}

interface BackfillQueueDay {
  date: string;
  status: 'pending' | 'in_progress' | 'retry' | 'completed' | 'needs_review' | 'failed';
  attempts: number;
  completedAt?: string;
  lastError?: string;
}

interface BackfillQueue {
  schemaVersion: 1;
  mode: 'publication-date-replay';
  campaign: string;
  from: string;
  to: string;
  batchSize: number;
  maxAttempts: number;
  updatedAt?: string;
  days: BackfillQueueDay[];
}

const RESEARCH_INDEX_URL =
  'https://raw.githubusercontent.com/sergiiiavt/air-stat/main/data/index.json';
const RESEARCH_RAW_BASE =
  'https://raw.githubusercontent.com/sergiiiavt/air-stat/main/';
const RESEARCH_BACKFILL_QUEUE_URL =
  'https://raw.githubusercontent.com/sergiiiavt/air-stat/main/data/backfill/queue.json';
const ALERTS_SOURCE_URL = 'https://alerts.in.ua/';
const ALERTS_API_BASE = 'https://api.alerts.in.ua/v1';

const targets: Array<{ scope: Scope; uid: string }> = [
  { scope: 'kyiv-city', uid: '31' },
  { scope: 'kyiv-oblast', uid: '14' },
];

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function normalizeScope(value: string | null): Scope {
  return value === 'kyiv-oblast' ? 'kyiv-oblast' : 'kyiv-city';
}

const MAPPABLE_PRECISIONS = new Set(
  'district-centroid|raion-centroid|hromada-centroid|settlement-centroid|neighborhood-centroid|street-segment|address-generalized|address-point'.split('|'),
);

function isMappablePrecision(precision: string) {
  return MAPPABLE_PRECISIONS.has(precision);
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function kyivDate(iso: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function mapThreatTypes(threats: AlertThreat[] | undefined) {
  const result = new Set<string>();

  for (const threat of threats ?? []) {
    switch (threat.threat_type) {
      case 'drones':
        result.add('uav');
        break;
      case 'ballistic_missiles':
        result.add('ballistic');
        break;
      case 'cruise_missiles':
        result.add('cruise');
        break;
      case 'tactic_aircraft_activity':
      case 'strategic_aircraft_activity':
      case 'mig31k_departure':
      case 'guided_aerial_bombs':
        result.add('aviation');
        break;
      case 'unspecified_missiles':
      case 'unknown':
        result.add('unknown');
        break;
      default:
        break;
    }
  }

  return [...result];
}

async function stateGet(env: Env, key: string) {
  const row = await env.DB.prepare(
    'SELECT value FROM ingestion_state WHERE key = ?',
  ).bind(key).first<{ value: string | null }>();
  return row?.value ?? null;
}

async function stateSet(env: Env, key: string, value: string) {
  await env.DB.prepare(
    `INSERT INTO ingestion_state(key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(key, value).run();
}

async function beginSync(env: Env, sourceKey: string, syncType: string) {
  const result = await env.DB.prepare(
    `INSERT INTO sync_runs(source_key, sync_type, started_at, status)
     VALUES (?, ?, ?, 'running')`,
  ).bind(sourceKey, syncType, new Date().toISOString()).run();
  return Number(result.meta.last_row_id);
}

async function finishSync(
  env: Env,
  id: number,
  status: 'success' | 'error' | 'skipped',
  fetchedCount = 0,
  storedCount = 0,
  errorMessage?: string,
) {
  await env.DB.prepare(
    `UPDATE sync_runs
     SET finished_at = ?, status = ?, fetched_count = ?, stored_count = ?, error_message = ?
     WHERE id = ?`,
  ).bind(
    new Date().toISOString(),
    status,
    fetchedCount,
    storedCount,
    errorMessage ?? null,
    id,
  ).run();
}

async function upsertAlert(env: Env, scope: Scope, alert: AlertsApiAlert) {
  const externalId = String(alert.id);
  const startedAt = new Date(alert.started_at).toISOString();
  const endedAt = alert.finished_at
    ? new Date(alert.finished_at).toISOString()
    : null;

  const adminArea =
    alert.location_title?.trim() ||
    alert.location_raion?.trim() ||
    (scope === 'kyiv-city' ? 'Kyiv City' : 'Kyiv Oblast');

  await env.DB.prepare(
    `INSERT INTO alert_events(
       external_id,
       scope,
       location_uid,
       started_at,
       ended_at,
       local_date,
       alert_type,
       threat_types_json,
       source_key,
       source_url,
       admin_area
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'alerts_in_ua', ?, ?)
     ON CONFLICT(scope, external_id) DO UPDATE SET
       location_uid = excluded.location_uid,
       started_at = excluded.started_at,
       ended_at = CASE
         WHEN excluded.ended_at IS NOT NULL THEN excluded.ended_at
         ELSE alert_events.ended_at
       END,
       local_date = excluded.local_date,
       alert_type = excluded.alert_type,
       threat_types_json = CASE
         WHEN excluded.threat_types_json <> '[]' THEN excluded.threat_types_json
         ELSE alert_events.threat_types_json
       END,
       source_key = 'alerts_in_ua',
       source_url = excluded.source_url,
       admin_area = excluded.admin_area`,
  ).bind(
    externalId,
    scope,
    String(alert.location_uid ?? ''),
    startedAt,
    endedAt,
    kyivDate(startedAt),
    alert.alert_type ?? 'air_raid',
    JSON.stringify(mapThreatTypes(alert.threats)),
    ALERTS_SOURCE_URL,
    adminArea,
  ).run();
}

async function fetchAlerts(
  env: Env,
  url: string,
  lastModifiedKey?: string,
) {
  if (!env.ALERTS_API_TOKEN) {
    throw new Error('ALERTS_API_TOKEN is not configured');
  }

  const headers = new Headers({
    authorization: `Bearer ${env.ALERTS_API_TOKEN}`,
    accept: 'application/json',
    'user-agent': 'air-stat/0.2 (+https://github.com/sergiiiavt/air-stat)',
  });

  if (lastModifiedKey) {
    const lastModified = await stateGet(env, lastModifiedKey);
    if (lastModified) headers.set('if-modified-since', lastModified);
  }

  const response = await fetch(url, { headers });

  if (response.status === 304) {
    return { notModified: true, data: null as AlertsApiResponse | null };
  }

  if (!response.ok) {
    throw new Error(`alerts.in.ua returned HTTP ${response.status}`);
  }

  if (lastModifiedKey) {
    const lastModified = response.headers.get('last-modified');
    if (lastModified) await stateSet(env, lastModifiedKey, lastModified);
  }

  return {
    notModified: false,
    data: (await response.json()) as AlertsApiResponse,
  };
}

function alertBelongsToTarget(alert: AlertsApiAlert, target: { scope: Scope; uid: string }) {
  const uid = String(alert.location_uid ?? '');
  if (target.scope === 'kyiv-city') return uid === target.uid;
  return uid === target.uid || String(alert.location_oblast_uid ?? '') === target.uid;
}

async function syncActive(env: Env) {
  const syncId = await beginSync(env, 'alerts_in_ua', 'active');

  try {
    const result = await fetchAlerts(
      env,
      `${ALERTS_API_BASE}/alerts/active.json`,
      'alerts_in_ua_active_last_modified',
    );

    if (result.notModified || !result.data) {
      await finishSync(env, syncId, 'skipped');
      return;
    }

    const alerts = result.data.alerts ?? [];
    let storedCount = 0;
    const now = new Date().toISOString();

    for (const target of targets) {
      const active = alerts.filter(
        (alert) =>
          alertBelongsToTarget(alert, target) &&
          (alert.alert_type ?? 'air_raid') === 'air_raid',
      );

      for (const alert of active) {
        await upsertAlert(env, target.scope, alert);
        storedCount += 1;
      }

      const ids = active.map((alert) => String(alert.id));
      if (ids.length === 0) {
        await env.DB.prepare(
          `UPDATE alert_events
           SET ended_at = ?
           WHERE scope = ? AND source_key = 'alerts_in_ua' AND alert_type = 'air_raid' AND ended_at IS NULL`,
        ).bind(now, target.scope).run();
      } else {
        const placeholders = ids.map(() => '?').join(', ');
        await env.DB.prepare(
          `UPDATE alert_events
           SET ended_at = ?
           WHERE scope = ?
             AND source_key = 'alerts_in_ua'
             AND alert_type = 'air_raid'
             AND ended_at IS NULL
             AND external_id NOT IN (${placeholders})`,
        ).bind(now, target.scope, ...ids).run();
      }
    }

    await stateSet(env, 'alerts_in_ua_last_active_success', now);
    await finishSync(env, syncId, 'success', alerts.length, storedCount);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSync(env, syncId, 'error', 0, 0, message);
    throw error;
  }
}

async function syncHistory(env: Env) {
  const syncId = await beginSync(env, 'alerts_in_ua', 'history');

  try {
    let fetchedCount = 0;
    let storedCount = 0;

    for (const target of targets) {
      const result = await fetchAlerts(
        env,
        `${ALERTS_API_BASE}/regions/${target.uid}/alerts/month_ago.json`,
      );
      const alerts = result.data?.alerts ?? [];
      fetchedCount += alerts.length;

      for (const alert of alerts) {
        if ((alert.alert_type ?? 'air_raid') !== 'air_raid') continue;
        await upsertAlert(env, target.scope, alert);
        storedCount += 1;
      }
    }

    await stateSet(env, 'alerts_in_ua_history_bootstrapped', new Date().toISOString());
    await stateSet(env, 'alerts_in_ua_last_history_success', new Date().toISOString());
    await finishSync(env, syncId, 'success', fetchedCount, storedCount);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSync(env, syncId, 'error', 0, 0, message);
    throw error;
  }
}


const KYIV_CITY_HISTORY_API = 'https://kyiv.digital/open-api/air-alert/history';
const KYIV_CITY_STATE_API = 'https://kyiv.digital/open-api/air-alert/state';
const KYIV_CITY_DATA_PAGE =
  'https://data.kyivcity.gov.ua/dataset/statystyka-povitrianykh-tryvoh-u-misti-kyievi-dep-municipal/resource/cbf3758e-031c-42b0-a477-e731cd79b261';
const KOVA_PUBLIC_FEED = 'https://t.me/s/kyivoda';

function officialThreats(causes: unknown): string[] {
  const values = Array.isArray(causes) ? causes : [causes];
  const normalized = values.map((value) => String(value ?? '').toLowerCase());
  const threats = new Set<string>();

  for (const value of normalized) {
    if (value.includes('drone')) threats.add('uav');
    if (value.includes('missile')) threats.add('unknown');
  }

  return [...threats];
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const wallAsUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );

  return wallAsUtc - date.getTime();
}

function parseKyivLocal(value: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) return null;

  const wall = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );

  let utc = wall;
  for (let i = 0; i < 2; i += 1) {
    utc = wall - timeZoneOffsetMs(new Date(utc), 'Europe/Kyiv');
  }

  return new Date(utc).toISOString();
}


function officialUpsertStatement(
  env: Env,
  data: {
    externalId: string;
    scope: Scope;
    startedAt: string;
    endedAt: string | null;
    sourceKey: string;
    sourceUrl: string;
    adminArea: string;
    threatTypes?: string[];
  },
) {
  return env.DB.prepare(
    'INSERT INTO alert_events (external_id, scope, started_at, ended_at, local_date, alert_type, threat_types_json, source_key, source_url, admin_area) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(scope, external_id) DO UPDATE SET started_at = excluded.started_at, ended_at = CASE WHEN excluded.ended_at IS NOT NULL THEN excluded.ended_at ELSE alert_events.ended_at END, local_date = excluded.local_date, threat_types_json = CASE WHEN excluded.threat_types_json <> \'[]\' THEN excluded.threat_types_json ELSE alert_events.threat_types_json END, source_key = excluded.source_key, source_url = excluded.source_url, admin_area = excluded.admin_area',
  ).bind(
    data.externalId,
    data.scope,
    data.startedAt,
    data.endedAt,
    kyivDate(data.startedAt),
    'air_raid',
    JSON.stringify(data.threatTypes ?? []),
    data.sourceKey,
    data.sourceUrl,
    data.adminArea,
  );
}

async function upsertOfficialInterval(
  env: Env,
  data: {
    externalId: string;
    scope: Scope;
    startedAt: string;
    endedAt: string | null;
    sourceKey: string;
    sourceUrl: string;
    adminArea: string;
    threatTypes?: string[];
  },
) {
  await officialUpsertStatement(env, data).run();
}

async function batchOfficialIntervals(
  env: Env,
  intervals: Array<{
    externalId: string;
    scope: Scope;
    startedAt: string;
    endedAt: string | null;
    sourceKey: string;
    sourceUrl: string;
    adminArea: string;
    threatTypes?: string[];
  }>,
) {
  const chunkSize = 50;
  for (let index = 0; index < intervals.length; index += chunkSize) {
    const chunk = intervals.slice(index, index + chunkSize);
    await env.DB.batch(
      chunk.map((item) => officialUpsertStatement(env, item)),
    );
  }
}

interface KyivDigitalEvent {
  state: number;
  causes?: string[];
  created_at: string;
}

async function fetchKyivDigital<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'air-stat/0.3 (+https://github.com/sergiiiavt/air-stat)',
    },
  });

  if (!response.ok) {
    throw new Error(`Kyiv Digital returned HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}


async function syncKyivCityHistory(env: Env) {
  const syncId = await beginSync(env, 'kyiv_open_data', 'history');
  await stateSet(
    env,
    'kyiv_open_data_bootstrap_running',
    new Date().toISOString(),
  );

  try {
    const payload = await fetchKyivDigital<{ items?: KyivDigitalEvent[] }>(
      KYIV_CITY_HISTORY_API,
    );
    const items = payload.items ?? [];
    const ordered = items
      .map((item) => ({
        ...item,
        iso: parseKyivLocal(item.created_at),
      }))
      .filter(
        (item): item is KyivDigitalEvent & { iso: string } =>
          Boolean(item.iso),
      )
      .sort(
        (a, b) =>
          new Date(a.iso).getTime() - new Date(b.iso).getTime(),
      );

    let open:
      | { startedAt: string; threats: Set<string> }
      | null = null;

    const intervals: Array<{
      externalId: string;
      scope: Scope;
      startedAt: string;
      endedAt: string | null;
      sourceKey: string;
      sourceUrl: string;
      adminArea: string;
      threatTypes: string[];
    }> = [];

    for (const item of ordered) {
      if (item.state === 1) {
        if (!open) {
          open = {
            startedAt: item.iso,
            threats: new Set(officialThreats(item.causes)),
          };
        } else {
          for (const threat of officialThreats(item.causes)) {
            open.threats.add(threat);
          }
        }
        continue;
      }

      if (item.state === 0 && open) {
        intervals.push({
          externalId: `kyiv-open:${open.startedAt}`,
          scope: 'kyiv-city',
          startedAt: open.startedAt,
          endedAt: item.iso,
          sourceKey: 'kyiv_open_data',
          sourceUrl: KYIV_CITY_DATA_PAGE,
          adminArea: 'Kyiv City',
          threatTypes: [...open.threats],
        });
        open = null;
      }
    }

    if (open) {
      intervals.push({
        externalId: `kyiv-open:${open.startedAt}`,
        scope: 'kyiv-city',
        startedAt: open.startedAt,
        endedAt: null,
        sourceKey: 'kyiv_open_data',
        sourceUrl: KYIV_CITY_DATA_PAGE,
        adminArea: 'Kyiv City',
        threatTypes: [...open.threats],
      });
    }

    if (items.length > 0 && intervals.length === 0) {
      throw new Error(
        'Kyiv Digital returned history but no alert intervals could be paired',
      );
    }

    await batchOfficialIntervals(env, intervals);

    const now = new Date().toISOString();
    await stateSet(env, 'kyiv_open_data_bootstrapped', now);
    await stateSet(env, 'kyiv_open_data_last_history_success', now);
    await finishSync(
      env,
      syncId,
      'success',
      items.length,
      intervals.length,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSync(env, syncId, 'error', 0, 0, message);
    throw error;
  } finally {
    await stateSet(env, 'kyiv_open_data_bootstrap_running', '');
  }
}

async function syncKyivCityState(env: Env) {
  const syncId = await beginSync(env, 'kyiv_open_data', 'current');

  try {
    const payload = await fetchKyivDigital<{
      current?: KyivDigitalEvent;
      stats?: { total_alerts?: number; total_lasts_for?: number };
    }>(KYIV_CITY_STATE_API);

    const current = payload.current;
    if (!current) {
      await finishSync(
        env,
        syncId,
        'error',
        0,
        0,
        'Kyiv Digital current state is missing',
      );
      return;
    }

    const eventAt = parseKyivLocal(current.created_at);
    if (!eventAt) {
      throw new Error(
        `Kyiv Digital returned invalid local timestamp: ${current.created_at}`,
      );
    }

    if (current.state === 1) {
      await upsertOfficialInterval(env, {
        externalId: `kyiv-open:${eventAt}`,
        scope: 'kyiv-city',
        startedAt: eventAt,
        endedAt: null,
        sourceKey: 'kyiv_open_data',
        sourceUrl: KYIV_CITY_DATA_PAGE,
        adminArea: 'Kyiv City',
        threatTypes: officialThreats(current.causes),
      });
    } else if (current.state === 0) {
      await env.DB.prepare(
        `UPDATE alert_events
         SET ended_at = ?
         WHERE scope = 'kyiv-city'
           AND source_key = 'kyiv_open_data'
           AND admin_area = 'Kyiv City'
           AND ended_at IS NULL
           AND started_at <= ?`,
      ).bind(eventAt, eventAt).run();
    }

    await stateSet(
      env,
      'kyiv_open_data_last_current_success',
      new Date().toISOString(),
    );
    await finishSync(env, syncId, 'success', 1, 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSync(env, syncId, 'error', 0, 0, message);
    throw error;
  }
}

function decodeTelegramText(html: string) {
  return html
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, value: string) => String.fromCodePoint(Number(value)))
    .replace(/\s+/g, ' ')
    .trim();
}

interface KovaPost {
  id: string;
  time: string;
  text: string;
  url: string;
}

function parseKovaPosts(html: string) {
  const posts: KovaPost[] = [];
  const chunks = html.split(/data-post="/i).slice(1);

  for (const chunk of chunks) {
    const id = chunk.split('"', 1)[0];
    const timeMatch = chunk.match(/<time[^>]*datetime="([^"]+)"/i);
    const textMatch = chunk.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i);
    if (!id || !timeMatch || !textMatch) continue;

    const parsed = new Date(timeMatch[1]);
    if (Number.isNaN(parsed.getTime())) continue;

    posts.push({
      id,
      time: parsed.toISOString(),
      text: decodeTelegramText(textMatch[1]),
      url: 'https://t.me/' + id,
    });
  }

  return posts.sort((a, b) => a.time.localeCompare(b.time));
}

interface KovaAlertEvent {
  kind: 'start' | 'clear';
  adminArea: string;
}

const KOVA_RAIONS = [
  'Білоцерківський район',
  'Бориспільський район',
  'Броварський район',
  'Бучанський район',
  'Вишгородський район',
  'Обухівський район',
  'Фастівський район',
] as const;

function kovaAlertEvent(text: string): KovaAlertEvent | null {
  const normalized = text
    .toLocaleLowerCase('uk-UA')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[🔴🟡🟢]\s*/u, '');

  const canonicalAreas = [
    ...KOVA_RAIONS.map((adminArea) => ({
      adminArea,
      normalized: adminArea.toLocaleLowerCase('uk-UA'),
    })),
    { adminArea: 'Kyiv Oblast', normalized: 'київська область' },
    { adminArea: 'Kyiv Oblast', normalized: 'київській області' },
  ];

  for (const area of canonicalAreas) {
    const escaped = [...area.normalized]
      .map((char) => ('\\^$.*+?()[]{}|'.includes(char) ? '\\' + char : char))
      .join('');
    const areaFirst = new RegExp(
      '^' + escaped + '\\s*[-:]\\s*(відбій повітряної тривоги|повітряна тривога)(?:$|[,;.!?\\s])',
      'u',
    );
    const match = normalized.match(areaFirst);
    if (match) {
      return {
        kind: match[1].startsWith('відбій') ? 'clear' : 'start',
        adminArea: area.adminArea,
      };
    }
  }

  if (/^відбій повітряної тривоги\s+(?:в|у)\s+київській області(?:$|[,;.!?\s])/u.test(normalized)) {
    return { kind: 'clear', adminArea: 'Kyiv Oblast' };
  }
  if (/^повітряна тривога\s+(?:в|у)\s+київській області(?:$|[,;.!?\s])/u.test(normalized)) {
    return { kind: 'start', adminArea: 'Kyiv Oblast' };
  }
  return null;
}

function kovaAlertKind(text: string): 'start' | 'clear' | null {
  return kovaAlertEvent(text)?.kind ?? null;
}

function kovaThreatTypes(text: string) {
  const normalized = text.toLocaleLowerCase('uk-UA');
  const threats: string[] = [];
  if (/дрон|бпла|шахед/.test(normalized)) threats.push('uav');
  if (/баліст/.test(normalized)) threats.push('ballistic');
  if (/крилат/.test(normalized)) threats.push('cruise');
  if (/ракет/.test(normalized) && threats.length === 0) threats.push('unknown');
  return threats;
}

function kovaPostNumber(id: string) {
  const match = id.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function fetchKovaPage(before?: number) {
  const url = new URL(KOVA_PUBLIC_FEED);
  url.searchParams.set('q', 'повітряна тривога');
  if (before) url.searchParams.set('before', String(before));

  const response = await fetch(url.toString(), {
    headers: { accept: 'text/html', 'user-agent': 'air-stat/0.4' },
  });
  if (!response.ok) throw new Error('KOVA Telegram returned HTTP ' + response.status);
  return parseKovaPosts(await response.text());
}

async function syncKovaOblastFeed(env: Env) {
  const syncId = await beginSync(env, 'kova_telegram', 'current');
  try {
    const posts = await fetchKovaPage();
    let stored = 0;

    for (const post of posts) {
      const event = kovaAlertEvent(post.text);
      if (!event) continue;

      if (event.kind === 'clear') {
        if (event.adminArea === 'Kyiv Oblast') {
          await env.DB.prepare(
            "UPDATE alert_events SET ended_at = ? WHERE scope = 'kyiv-oblast' AND source_key = 'kova_telegram' AND ended_at IS NULL AND started_at <= ?",
          ).bind(post.time, post.time).run();
        } else {
          await env.DB.prepare(
            "UPDATE alert_events SET ended_at = ? WHERE scope = 'kyiv-oblast' AND source_key = 'kova_telegram' AND admin_area = ? AND ended_at IS NULL AND started_at <= ?",
          ).bind(post.time, event.adminArea, post.time).run();
        }
        continue;
      }

      await upsertOfficialInterval(env, {
        externalId: 'kova:' + post.id,
        scope: 'kyiv-oblast',
        startedAt: post.time,
        endedAt: null,
        sourceKey: 'kova_telegram',
        sourceUrl: post.url,
        adminArea: event.adminArea,
        threatTypes: kovaThreatTypes(post.text),
      });
      stored += 1;
    }

    await stateSet(env, 'kova_telegram_last_success', new Date().toISOString());
    await finishSync(env, syncId, 'success', posts.length, stored);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSync(env, syncId, 'error', 0, 0, message);
    throw error;
  }
}

const KOVA_HISTORY_LOOKBACK_DAYS = 190;
const KOVA_HISTORY_MAX_PAGES = 80;
const KOVA_HISTORY_PAGES_PER_RUN = 8;
const KOVA_HISTORY_PROGRESS_KEY = 'kova_telegram_history_v3_progress';

interface KovaHistoryProgress {
  version: 3;
  phase: 'collecting' | 'rebuilding' | 'complete';
  cutoffAt: string;
  before: number | null;
  pagesFetched: number;
  postsFetched: number;
  intervalsStored: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  lastPageOldestAt: string | null;
  lastError: string | null;
}

function newKovaHistoryProgress(): KovaHistoryProgress {
  const now = new Date();
  return {
    version: 3,
    phase: 'collecting',
    cutoffAt: new Date(
      now.getTime() - KOVA_HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString(),
    before: null,
    pagesFetched: 0,
    postsFetched: 0,
    intervalsStored: 0,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    lastPageOldestAt: null,
    lastError: null,
  };
}

async function loadKovaHistoryProgress(env: Env) {
  const raw = await stateGet(env, KOVA_HISTORY_PROGRESS_KEY);
  if (!raw) return newKovaHistoryProgress();

  try {
    const parsed = JSON.parse(raw) as KovaHistoryProgress;
    if (
      parsed.version === 3 &&
      ['collecting', 'rebuilding', 'complete'].includes(parsed.phase) &&
      typeof parsed.cutoffAt === 'string' &&
      typeof parsed.pagesFetched === 'number' &&
      typeof parsed.postsFetched === 'number'
    ) {
      return parsed;
    }
  } catch {
    // Invalid/stale state is replaced by a fresh v3 campaign below.
  }

  return newKovaHistoryProgress();
}

async function saveKovaHistoryProgress(env: Env, progress: KovaHistoryProgress) {
  progress.updatedAt = new Date().toISOString();
  await stateSet(env, KOVA_HISTORY_PROGRESS_KEY, JSON.stringify(progress));
}

const KOVA_HISTORY_LOCK_KEY = 'kova_telegram_history_v3_lock';

async function acquireKovaHistoryLock(env: Env) {
  const now = Date.now();
  const staleBefore = now - 55_000;

  await env.DB.prepare(
    `INSERT OR IGNORE INTO ingestion_state(key, value, updated_at)
     VALUES (?, '', CURRENT_TIMESTAMP)`,
  ).bind(KOVA_HISTORY_LOCK_KEY).run();

  const result = await env.DB.prepare(
    `UPDATE ingestion_state
     SET value = ?, updated_at = CURRENT_TIMESTAMP
     WHERE key = ?
       AND (
         value = ''
         OR CAST(value AS INTEGER) < ?
       )`,
  ).bind(String(now), KOVA_HISTORY_LOCK_KEY, staleBefore).run();

  return Number(result.meta.changes ?? 0) > 0;
}

async function releaseKovaHistoryLock(env: Env) {
  await stateSet(env, KOVA_HISTORY_LOCK_KEY, '');
}

function kovaHistoryPostStatement(env: Env, post: KovaPost) {
  return env.DB.prepare(
    `INSERT INTO kova_history_posts(post_id, post_number, published_at, text, url)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET
       post_number = excluded.post_number,
       published_at = excluded.published_at,
       text = excluded.text,
       url = excluded.url`,
  ).bind(
    post.id,
    kovaPostNumber(post.id),
    post.time,
    post.text,
    post.url,
  );
}

async function storeKovaHistoryPosts(env: Env, posts: KovaPost[]) {
  const chunkSize = 50;
  for (let index = 0; index < posts.length; index += chunkSize) {
    await env.DB.batch(
      posts.slice(index, index + chunkSize).map((post) =>
        kovaHistoryPostStatement(env, post),
      ),
    );
  }
}

async function rebuildKovaHistoryIntervals(
  env: Env,
  progress: KovaHistoryProgress,
) {
  const staged = await env.DB.prepare(
    `SELECT post_id, published_at, text, url
     FROM kova_history_posts
     WHERE published_at >= ?
     ORDER BY published_at ASC, post_number ASC`,
  ).bind(progress.cutoffAt).all<{
    post_id: string;
    published_at: string;
    text: string;
    url: string;
  }>();

  const intervals: Array<{
    externalId: string;
    scope: Scope;
    startedAt: string;
    endedAt: string | null;
    sourceKey: string;
    sourceUrl: string;
    adminArea: string;
    threatTypes: string[];
  }> = [];
  const openByArea = new Map<string, KovaPost>();

  const closeOpen = (adminArea: string, clearPost: KovaPost) => {
    const open = openByArea.get(adminArea);
    if (!open || clearPost.time < open.time) return;

    intervals.push({
      externalId: 'kova:' + open.id,
      scope: 'kyiv-oblast',
      startedAt: open.time,
      endedAt: clearPost.time,
      sourceKey: 'kova_telegram',
      sourceUrl: open.url,
      adminArea,
      threatTypes: kovaThreatTypes(open.text),
    });
    openByArea.delete(adminArea);
  };

  for (const row of staged.results) {
    const post: KovaPost = {
      id: row.post_id,
      time: row.published_at,
      text: row.text,
      url: row.url,
    };
    const event = kovaAlertEvent(post.text);
    if (!event) continue;

    if (event.kind === 'start') {
      if (!openByArea.has(event.adminArea)) {
        openByArea.set(event.adminArea, post);
      }
      continue;
    }

    if (event.adminArea === 'Kyiv Oblast') {
      for (const adminArea of [...openByArea.keys()]) {
        closeOpen(adminArea, post);
      }
    } else {
      closeOpen(event.adminArea, post);
    }
  }

  const currentCutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [adminArea, open] of openByArea) {
    if (new Date(open.time).getTime() < currentCutoff) continue;
    intervals.push({
      externalId: 'kova:' + open.id,
      scope: 'kyiv-oblast',
      startedAt: open.time,
      endedAt: null,
      sourceKey: 'kova_telegram',
      sourceUrl: open.url,
      adminArea,
      threatTypes: kovaThreatTypes(open.text),
    });
  }

  const preserveRecentFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `DELETE FROM alert_events
     WHERE scope = 'kyiv-oblast'
       AND source_key = 'kova_telegram'
       AND started_at >= ?
       AND started_at < ?`,
  ).bind(progress.cutoffAt, preserveRecentFrom).run();

  await batchOfficialIntervals(env, intervals);
  return intervals.length;
}

async function syncKovaOblastHistory(env: Env) {
  const progress = await loadKovaHistoryProgress(env);
  if (progress.phase === 'complete') return;
  if (!(await acquireKovaHistoryLock(env))) return;

  const syncId = await beginSync(env, 'kova_telegram', 'history-v3');

  try {
    progress.lastError = null;

    if (progress.phase === 'collecting') {
      const cutoffMs = new Date(progress.cutoffAt).getTime();

      for (
        let page = 0;
        page < KOVA_HISTORY_PAGES_PER_RUN && progress.phase === 'collecting';
        page += 1
      ) {
        if (progress.pagesFetched >= KOVA_HISTORY_MAX_PAGES) {
          throw new Error(
            'KOVA history reached the page safety limit before the six-month cutoff',
          );
        }

        const posts = await fetchKovaPage(progress.before ?? undefined);
        if (posts.length === 0) {
          progress.phase = 'rebuilding';
          await saveKovaHistoryProgress(env, progress);
          break;
        }

        await storeKovaHistoryPosts(env, posts);
        progress.pagesFetched += 1;
        progress.postsFetched += posts.length;

        const numericIds = posts
          .map((post) => kovaPostNumber(post.id))
          .filter((id): id is number => id !== null);
        const nextBefore = numericIds.length ? Math.min(...numericIds) : null;
        const oldestAt = posts.reduce(
          (oldest, post) => post.time < oldest ? post.time : oldest,
          posts[0].time,
        );

        progress.lastPageOldestAt = oldestAt;

        if (new Date(oldestAt).getTime() <= cutoffMs) {
          progress.phase = 'rebuilding';
        } else if (nextBefore === null || nextBefore === progress.before) {
          progress.phase = 'rebuilding';
        } else {
          progress.before = nextBefore;
        }

        await saveKovaHistoryProgress(env, progress);
      }
    }

    if (progress.phase === 'rebuilding') {
      progress.intervalsStored = await rebuildKovaHistoryIntervals(env, progress);
      progress.phase = 'complete';
      progress.completedAt = new Date().toISOString();
      progress.lastError = null;
      await saveKovaHistoryProgress(env, progress);
      await stateSet(env, 'kova_telegram_last_history_success', progress.completedAt);
    }

    await finishSync(
      env,
      syncId,
      'success',
      progress.postsFetched,
      progress.intervalsStored,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    progress.lastError = message;
    await saveKovaHistoryProgress(env, progress);
    await finishSync(env, syncId, 'error', progress.postsFetched, 0, message);
    throw error;
  } finally {
    await releaseKovaHistoryLock(env);
  }
}


function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validResearchDocument(value: unknown): value is ResearchDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Record<string, unknown>;
  if (doc.schemaVersion !== 1 || !isDate(String(doc.date ?? ''))) return false;
  if (typeof doc.generatedAt !== 'string' || Number.isNaN(new Date(doc.generatedAt).getTime())) {
    return false;
  }
  if (!Array.isArray(doc.attacks) || !Array.isArray(doc.incidents)) return false;

  const sourceOk = (source: unknown) => {
    if (!source || typeof source !== 'object') return false;
    const item = source as Record<string, unknown>;
    return (
      typeof item.publisher === 'string' &&
      ['official', 'media', 'local'].includes(String(item.type)) &&
      isHttpUrl(item.url)
    );
  };

  for (const attack of doc.attacks as Array<Record<string, unknown>>) {
    if (
      !attack ||
      typeof attack.id !== 'string' ||
      !['kyiv-city', 'kyiv-oblast'].includes(String(attack.scope)) ||
      !isDate(String(attack.date ?? '')) ||
      !Array.isArray(attack.threatTypes) ||
      typeof attack.summary !== 'string' ||
      !['provisional', 'confirmed', 'final'].includes(String(attack.verification)) ||
      !['low', 'medium', 'high'].includes(String(attack.confidence)) ||
      !attack.casualties ||
      !Number.isInteger(Number((attack.casualties as Record<string, unknown>).killed)) ||
      Number((attack.casualties as Record<string, unknown>).killed) < 0 ||
      !Number.isInteger(Number((attack.casualties as Record<string, unknown>).injured)) ||
      Number((attack.casualties as Record<string, unknown>).injured) < 0 ||
      !Array.isArray(attack.sources) ||
      attack.sources.length === 0 ||
      !attack.sources.every(sourceOk)
    ) {
      return false;
    }
  }

  for (const incident of doc.incidents as Array<Record<string, unknown>>) {
    const area = incident?.area as Record<string, unknown> | undefined;
    const map = area?.map as Record<string, unknown> | undefined;
    const casualties = incident?.casualties as Record<string, unknown> | undefined;
    const lat = Number(map?.lat);
    const lng = Number(map?.lng);

    if (
      !incident ||
      typeof incident.id !== 'string' ||
      !['kyiv-city', 'kyiv-oblast'].includes(String(incident.scope)) ||
      !isDate(String(incident.date ?? '')) ||
      !area ||
      typeof area.name !== 'string' ||
      ![
        'city',
        'oblast',
        'district',
        'raion',
        'hromada',
        'settlement',
        'neighborhood',
        'street',
        'address',
      ].includes(String(area.level)) ||
      !map ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < 49.5 ||
      lat > 52.0 ||
      lng < 28.5 ||
      lng > 32.5 ||
      ![
        'city-centroid',
        'oblast-centroid',
        'district-centroid',
        'raion-centroid',
        'hromada-centroid',
        'settlement-centroid',
        'neighborhood-centroid',
        'street-segment',
        'address-generalized',
        'address-point',
      ].includes(String(map.precision)) ||
      typeof incident.summary !== 'string' ||
      !casualties ||
      !Number.isInteger(Number(casualties.killed)) ||
      Number(casualties.killed) < 0 ||
      !Number.isInteger(Number(casualties.injured)) ||
      Number(casualties.injured) < 0 ||
      !['provisional', 'confirmed', 'final'].includes(String(incident.verification)) ||
      !['low', 'medium', 'high'].includes(String(incident.confidence)) ||
      !Array.isArray(incident.sources) ||
      incident.sources.length === 0 ||
      !incident.sources.every(sourceOk)
    ) {
      return false;
    }
  }

  return true;
}

async function sha256Hex(textValue: string) {
  const bytes = new TextEncoder().encode(textValue);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function sourceKey(source: ResearchSource) {
  const slug = source.publisher
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9а-яіїєґ]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return `research:${source.type}:${slug || 'source'}`;
}

function sourceType(source: ResearchSource) {
  if (source.url.includes('t.me/')) return 'telegram';
  if (source.type === 'official') return 'official_site';
  return 'media';
}

async function ensureResearchSourceItem(
  env: Env,
  source: ResearchSource,
  documentDate: string,
) {
  const key = sourceKey(source);
  const baseUrl = new URL(source.url).origin;
  const authorityRank = source.type === 'official' ? 1 : source.type === 'media' ? 2 : 3;

  await env.DB.prepare(
    `INSERT INTO sources(key, name, base_url, source_type, authority_rank, enabled)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       name = excluded.name,
       base_url = excluded.base_url,
       source_type = excluded.source_type,
       authority_rank = excluded.authority_rank,
       enabled = 1`,
  ).bind(
    key,
    source.publisher,
    baseUrl,
    sourceType(source),
    authorityRank,
  ).run();

  const sourceRow = await env.DB.prepare(
    'SELECT id FROM sources WHERE key = ?',
  ).bind(key).first<{ id: number }>();
  if (!sourceRow) throw new Error(`Source row missing after upsert: ${key}`);

  const rawText = source.note?.trim() || `Research evidence for ${documentDate}`;
  const contentHash = await sha256Hex(
    [source.url, source.publishedAt ?? '', rawText].join('|'),
  );

  await env.DB.prepare(
    `INSERT OR IGNORE INTO source_items(
       source_id, external_id, url, published_at, title, raw_text, content_hash
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    sourceRow.id,
    null,
    source.url,
    source.publishedAt ?? null,
    source.publisher,
    rawText,
    contentHash,
  ).run();

  const item = await env.DB.prepare(
    'SELECT id FROM source_items WHERE source_id = ? AND content_hash = ?',
  ).bind(sourceRow.id, contentHash).first<{ id: number }>();
  if (!item) throw new Error('Source item missing after upsert');
  return item.id;
}

async function importResearchDocument(env: Env, doc: ResearchDocument) {
  const attackDbIds = new Map<string, number>();

  for (const attack of doc.attacks) {
    await env.DB.prepare(
      `INSERT INTO attacks(
         external_id, attack_date, scope, started_at, ended_at,
         threat_types_json, summary, verification, confidence,
         killed, injured, casualty_status, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(external_id) DO UPDATE SET
         attack_date = excluded.attack_date,
         scope = excluded.scope,
         started_at = excluded.started_at,
         ended_at = excluded.ended_at,
         threat_types_json = excluded.threat_types_json,
         summary = excluded.summary,
         verification = excluded.verification,
         confidence = excluded.confidence,
         killed = excluded.killed,
         injured = excluded.injured,
         casualty_status = excluded.casualty_status,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      attack.id,
      attack.date,
      attack.scope,
      attack.startedAt ?? null,
      attack.endedAt ?? null,
      JSON.stringify(attack.threatTypes ?? []),
      attack.summary,
      attack.verification,
      attack.confidence,
      attack.casualties.killed,
      attack.casualties.injured,
      attack.casualties.status,
    ).run();

    const attackRow = await env.DB.prepare(
      'SELECT id FROM attacks WHERE external_id = ?',
    ).bind(attack.id).first<{ id: number }>();
    if (!attackRow) throw new Error(`Attack missing after upsert: ${attack.id}`);
    attackDbIds.set(attack.id, attackRow.id);

    await env.DB.prepare('DELETE FROM attack_sources WHERE attack_id = ?')
      .bind(attackRow.id)
      .run();

    for (const source of attack.sources) {
      const sourceItemId = await ensureResearchSourceItem(env, source, doc.date);
      await env.DB.prepare(
        'INSERT OR IGNORE INTO attack_sources(attack_id, source_item_id) VALUES (?, ?)',
      ).bind(attackRow.id, sourceItemId).run();
    }
  }

  for (const incident of doc.incidents) {
    const matchingAttacks = doc.attacks.filter(
      (attack) => attack.date === incident.date && attack.scope === incident.scope,
    );
    const resolvedAttackId =
      incident.attackId ?? (matchingAttacks.length === 1 ? matchingAttacks[0].id : null);

    const mapEligible = isMappablePrecision(incident.area.map.precision);
    const dbImpactKind = [
      'impact',
      'debris',
      'air-defense',
      'no-confirmed-impact',
      'unknown',
    ].includes(incident.impactType)
      ? incident.impactType
      : 'impact';

    const damageStrings = incident.damage.map((item) =>
      item.count === null || item.count === undefined
        ? `${item.type}: ${item.description}`
        : `${item.type} (${item.count}): ${item.description}`,
    );

    await env.DB.prepare(
      `INSERT INTO incidents(
         external_id, attack_external_id, incident_date, scope, admin_area,
         location_name, occurred_at, impact_kind, research_impact_kind, threat_types_json,
         verification, confidence, published_lat, published_lng, geo_precision,
         reported_location_text, reported_location_specificity, location_redacted,
         display_radius_m, current_summary, damage_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(external_id) DO UPDATE SET
         attack_external_id = excluded.attack_external_id,
         incident_date = excluded.incident_date,
         scope = excluded.scope,
         admin_area = excluded.admin_area,
         location_name = excluded.location_name,
         occurred_at = excluded.occurred_at,
         impact_kind = excluded.impact_kind,
         research_impact_kind = excluded.research_impact_kind,
         threat_types_json = excluded.threat_types_json,
         verification = excluded.verification,
         confidence = excluded.confidence,
         published_lat = excluded.published_lat,
         published_lng = excluded.published_lng,
         geo_precision = excluded.geo_precision,
         reported_location_text = excluded.reported_location_text,
         reported_location_specificity = excluded.reported_location_specificity,
         location_redacted = excluded.location_redacted,
         display_radius_m = excluded.display_radius_m,
         current_summary = excluded.current_summary,
         damage_json = excluded.damage_json,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      incident.id,
      resolvedAttackId,
      incident.date,
      incident.scope,
      incident.area.name,
      incident.area.name,
      incident.occurredAt ?? null,
      dbImpactKind,
      incident.impactType,
      JSON.stringify(incident.threatTypes ?? []),
      incident.verification,
      incident.confidence,
      mapEligible ? incident.area.map.lat : null,
      mapEligible ? incident.area.map.lng : null,
      incident.area.map.precision,
      incident.area.sourceLocation?.text ?? null,
      incident.area.sourceLocation?.specificity ?? null,
      incident.area.sourceLocation?.redacted ? 1 : 0,
      incident.area.map.radiusMeters ?? 0,
      incident.summary,
      JSON.stringify(incident.damage),
    ).run();

    const incidentRow = await env.DB.prepare(
      'SELECT id FROM incidents WHERE external_id = ?',
    ).bind(incident.id).first<{ id: number }>();
    if (!incidentRow) throw new Error(`Incident missing after upsert: ${incident.id}`);

    const sourceItemIds: number[] = [];
    for (const source of incident.sources) {
      sourceItemIds.push(
        await ensureResearchSourceItem(env, source, doc.date),
      );
    }

    await env.DB.prepare('DELETE FROM incident_sources WHERE incident_id = ?')
      .bind(incidentRow.id)
      .run();

    for (const sourceItemId of sourceItemIds) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO incident_sources(incident_id, source_item_id) VALUES (?, ?)',
      ).bind(incidentRow.id, sourceItemId).run();
    }

    if (sourceItemIds.length === 0) {
      throw new Error(`Incident has no evidence source: ${incident.id}`);
    }

    await env.DB.prepare(
      'UPDATE incident_updates SET is_current = 0 WHERE incident_id = ? AND is_current = 1',
    ).bind(incidentRow.id).run();

    await env.DB.prepare(
      `INSERT INTO incident_updates(
         incident_id, source_item_id, observed_at, killed, injured,
         damaged_objects_json, summary, is_current
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    ).bind(
      incidentRow.id,
      sourceItemIds[0],
      doc.generatedAt,
      incident.casualties.killed,
      incident.casualties.injured,
      JSON.stringify(damageStrings),
      incident.summary,
    ).run();
  }
}

function summarizeBackfillQueue(queue: BackfillQueue) {
  const statuses = ['pending', 'in_progress', 'retry', 'completed', 'needs_review', 'failed'] as const;
  const counts = Object.fromEntries(
    statuses.map((status) => [
      status,
      queue.days.filter((day) => day.status === status).length,
    ]),
  ) as Record<(typeof statuses)[number], number>;

  const completedDays = queue.days.filter((day) => day.status === 'completed');

  return {
    campaign: queue.campaign,
    mode: queue.mode,
    from: queue.from,
    to: queue.to,
    batchSize: queue.batchSize,
    maxAttempts: queue.maxAttempts,
    updatedAt: queue.updatedAt ?? null,
    total: queue.days.length,
    ...counts,
    completionPercent: queue.days.length
      ? Number(((counts.completed / queue.days.length) * 100).toFixed(1))
      : 0,
    lastCompletedDate: completedDays.at(-1)?.date ?? null,
    nextDates: queue.days
      .filter((day) => day.status === 'retry' || day.status === 'pending')
      .slice(0, queue.batchSize)
      .map((day) => day.date),
    nextPublicationDates: queue.days
      .filter((day) => day.status === 'retry' || day.status === 'pending')
      .slice(0, queue.batchSize)
      .map((day) => day.date),
    days: queue.days.map((day) => ({
      date: day.date,
      status: day.status,
      attempts: day.attempts,
      completedAt: day.completedAt ?? null,
      lastError: day.lastError ?? null,
    })),
  };
}

async function syncBackfillQueueState(env: Env) {
  try {
    const response = await fetch(RESEARCH_BACKFILL_QUEUE_URL, {
      headers: {
        accept: 'application/json',
        'user-agent': 'air-stat/0.5 (+https://github.com/sergiiiavt/air-stat)',
      },
      cf: { cacheTtl: 60, cacheEverything: true },
    });

    if (!response.ok) throw new Error(`Backfill queue HTTP ${response.status}`);

    const queue = (await response.json()) as BackfillQueue;
    if (
      queue.schemaVersion !== 1 ||
      queue.mode !== 'publication-date-replay' ||
      !isDate(queue.from) ||
      !isDate(queue.to) ||
      !Number.isInteger(queue.batchSize) ||
      !Array.isArray(queue.days) ||
      !queue.days.every(
        (day) =>
          day &&
          isDate(day.date) &&
          ['pending', 'in_progress', 'retry', 'completed', 'needs_review', 'failed'].includes(day.status) &&
          Number.isInteger(day.attempts),
      )
    ) {
      throw new Error('Invalid backfill queue');
    }

    await stateSet(env, 'research_backfill_status', JSON.stringify(summarizeBackfillQueue(queue)));
    await stateSet(env, 'research_backfill_last_poll', new Date().toISOString());
  } catch (error) {
    console.error('backfill queue status sync failed', error);
  }
}

async function syncResearchGitHub(env: Env) {
  const syncId = await beginSync(env, 'chatgpt_research', 'github-json');

  try {
    const indexResponse = await fetch(RESEARCH_INDEX_URL, {
      headers: {
        accept: 'application/json',
        'user-agent': 'air-stat/0.4 (+https://github.com/sergiiiavt/air-stat)',
      },
      cf: { cacheTtl: 60, cacheEverything: true },
    });

    if (!indexResponse.ok) {
      throw new Error(`Research index HTTP ${indexResponse.status}`);
    }

    const index = (await indexResponse.json()) as ResearchIndex;
    if (
      index.schemaVersion !== 1 ||
      !Array.isArray(index.files) ||
      !index.files.every(
        (entry) =>
          entry &&
          typeof entry.path === 'string' &&
          typeof entry.revision === 'string' &&
          /^data\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/.test(entry.path),
      )
    ) {
      throw new Error('Invalid research index');
    }

    let imported = 0;

    for (const entry of index.files) {
      const existing = await env.DB.prepare(
        'SELECT manifest_revision FROM research_files WHERE path = ?',
      ).bind(entry.path).first<{ manifest_revision: string }>();

      if (existing?.manifest_revision === entry.revision) continue;

      const response = await fetch(`${RESEARCH_RAW_BASE}${entry.path}`, {
        headers: {
          accept: 'application/json',
          'user-agent': 'air-stat/0.4 (+https://github.com/sergiiiavt/air-stat)',
        },
        cf: { cacheTtl: 60, cacheEverything: true },
      });

      if (!response.ok) {
        throw new Error(`Research file HTTP ${response.status}: ${entry.path}`);
      }

      const raw = await response.text();
      const parsed = JSON.parse(raw) as unknown;
      if (!validResearchDocument(parsed)) {
        throw new Error(`Runtime research validation failed: ${entry.path}`);
      }
      if (parsed.generatedAt !== entry.revision) {
        throw new Error(`Manifest revision mismatch: ${entry.path}`);
      }

      await importResearchDocument(env, parsed);

      await env.DB.prepare(
        `INSERT INTO research_files(
           path, manifest_revision, content_sha, document_date, imported_at
         ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(path) DO UPDATE SET
           manifest_revision = excluded.manifest_revision,
           content_sha = excluded.content_sha,
           document_date = excluded.document_date,
           imported_at = CURRENT_TIMESTAMP`,
      ).bind(
        entry.path,
        entry.revision,
        await sha256Hex(raw),
        parsed.date,
      ).run();

      imported += 1;
    }

    await stateSet(env, 'research_last_poll', new Date().toISOString());
    await syncBackfillQueueState(env);
    await finishSync(env, syncId, 'success', index.files.length, imported);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSync(env, syncId, 'error', 0, 0, message);
    throw error;
  }
}

async function maybeSyncResearchGitHub(env: Env) {
  const last = await stateGet(env, 'research_last_poll');
  const lastMs = last ? new Date(last).getTime() : Number.NaN;
  if (Number.isFinite(lastMs) && Date.now() - lastMs < 10 * 60 * 1000) {
    return;
  }
  await syncResearchGitHub(env);
}

async function runMinuteCollectors(env: Env) {
  const tasks: Promise<unknown>[] = [
    syncKyivCityState(env),
    syncKovaOblastFeed(env),
    syncKovaOblastHistory(env),
    maybeSyncResearchGitHub(env),
  ];

  if (env.ALERTS_API_TOKEN) {
    tasks.push(syncActive(env));
  }

  const [bootstrapped, bootstrapRunning] = await Promise.all([
    stateGet(env, 'kyiv_open_data_bootstrapped'),
    stateGet(env, 'kyiv_open_data_bootstrap_running'),
  ]);

  const runningAt = bootstrapRunning
    ? new Date(bootstrapRunning).getTime()
    : Number.NaN;
  const runningIsFresh =
    Number.isFinite(runningAt) &&
    Date.now() - runningAt < 15 * 60 * 1000;

  if (!bootstrapped && !runningIsFresh) {
    tasks.push(syncKyivCityHistory(env));
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('minute collector failed', result.reason);
    }
  }
}

async function runDailyCollectors(env: Env) {
  const tasks: Promise<unknown>[] = [
    syncKyivCityHistory(env),
    syncKovaOblastFeed(env),
    syncKovaOblastHistory(env),
    syncResearchGitHub(env),
  ];

  if (env.ALERTS_API_TOKEN) {
    tasks.push(syncHistory(env));
  }

  const results = await Promise.allSettled(tasks);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('daily collector failed', result.reason);
    }
  }
}




async function apiStatus(env: Env) {
  const [latestRuns, latestRun, researchArchiveRow] = await Promise.all([
    env.DB.prepare(
      `SELECT
         r.source_key,
         r.sync_type,
         r.status,
         r.started_at,
         r.finished_at,
         r.error_message,
         r.fetched_count,
         r.stored_count
       FROM sync_runs r
       JOIN (
         SELECT source_key, MAX(id) AS id
         FROM sync_runs
         GROUP BY source_key
       ) latest ON latest.id = r.id
       ORDER BY r.source_key`,
    ).all(),
    env.DB.prepare(
      `SELECT
         source_key,
         sync_type,
         status,
         started_at,
         finished_at,
         error_message,
         fetched_count,
         stored_count
       FROM sync_runs
       ORDER BY id DESC
       LIMIT 1`,
    ).first(),
    env.DB.prepare(
      `SELECT
         MIN(document_date) AS first_date,
         MAX(document_date) AS last_date,
         COUNT(DISTINCT document_date) AS indexed_days,
         MAX(imported_at) AS last_imported_at
       FROM research_files`,
    ).first<{
      first_date: string | null;
      last_date: string | null;
      indexed_days: number;
      last_imported_at: string | null;
    }>(),
  ]);

  const indexedDays = Number(researchArchiveRow?.indexed_days ?? 0);
  const researchArchive =
    researchArchiveRow && indexedDays > 0
      ? {
          firstDate: researchArchiveRow.first_date,
          lastDate: researchArchiveRow.last_date,
          indexedDays,
          lastImportedAt: researchArchiveRow.last_imported_at,
        }
      : null;

  const kovaHistoryRaw = await stateGet(env, KOVA_HISTORY_PROGRESS_KEY);
  let kovaHistory: unknown = null;
  if (kovaHistoryRaw) {
    try {
      kovaHistory = JSON.parse(kovaHistoryRaw);
    } catch {
      kovaHistory = null;
    }
  }

  const backfillRaw = await stateGet(env, 'research_backfill_status');
  let researchBackfill: unknown = null;
  if (backfillRaw) {
    try {
      researchBackfill = JSON.parse(backfillRaw);
    } catch {
      researchBackfill = null;
    }
  }

  return json({
    ok: true,
    service: 'air-stat-api',
    alertsSourceConfigured: true,
    sourceMode: 'official-public',
    alertsInUaConfigured: Boolean(env.ALERTS_API_TOKEN),
    alertsInUaMode: env.ALERTS_API_TOKEN ? 'active-and-history' : 'disabled',
    officialSources: ['kyiv_open_data', 'kova_telegram'],
    kovaHistory,
    researchPipeline: {
      source: 'github-json',
      lastPoll: await stateGet(env, 'research_last_poll'),
      backfillLastPoll: await stateGet(env, 'research_backfill_last_poll'),
    },
    researchBackfill,
    researchArchive,
    latestRun,
    latestRuns: latestRuns.results,
  });
}


async function apiDays(env: Env, url: URL) {
  const scope = normalizeScope(url.searchParams.get('scope'));
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let sql = `SELECT date, scope, alert_count, alert_seconds, incident_count, killed, injured
             FROM daily_stats
             WHERE scope = ?`;
  const bindings: unknown[] = [scope];

  let attackSql = `SELECT attack_date AS date, SUM(killed) AS killed, SUM(injured) AS injured
                   FROM attacks
                   WHERE scope = ?`;
  const attackBindings: unknown[] = [scope];

  if (from && isDate(from)) {
    sql += ' AND date >= ?';
    bindings.push(from);
    attackSql += ' AND attack_date >= ?';
    attackBindings.push(from);
  }
  if (to && isDate(to)) {
    sql += ' AND date <= ?';
    bindings.push(to);
    attackSql += ' AND attack_date <= ?';
    attackBindings.push(to);
  }

  sql += ' ORDER BY date DESC LIMIT 180';
  attackSql += ' GROUP BY attack_date';

  const [result, areaRows, attackRows] = await Promise.all([
    env.DB.prepare(sql).bind(...bindings).all<{
      date: string;
      scope: Scope;
      alert_count: number;
      alert_seconds: number;
      incident_count: number;
      killed: number;
      injured: number;
    }>(),
    env.DB.prepare(
      `SELECT incident_date AS date,
              COUNT(DISTINCT COALESCE(location_name, admin_area)) AS affected_areas
       FROM incidents
       WHERE scope = ?
       GROUP BY incident_date`,
    ).bind(scope).all<{ date: string; affected_areas: number }>(),
    env.DB.prepare(attackSql).bind(...attackBindings).all<{
      date: string;
      killed: number;
      injured: number;
    }>(),
  ]);

  const areaMap = new Map(
    areaRows.results.map((row) => [row.date, Number(row.affected_areas)]),
  );
  const attackCasualties = new Map(
    attackRows.results.map((row) => [
      row.date,
      { killed: Number(row.killed), injured: Number(row.injured) },
    ]),
  );

  return json({
    scope,
    days: result.results.map((row) => {
      const casualties = attackCasualties.get(row.date);
      return {
        date: row.date,
        scope: row.scope,
        alertCount: Number(row.alert_count),
        alertSeconds: Number(row.alert_seconds),
        incidentCount: Number(row.incident_count),
        killed: casualties?.killed ?? Number(row.killed),
        injured: casualties?.injured ?? Number(row.injured),
        affectedAreas: areaMap.get(row.date) ?? 0,
      };
    }),
  });
}

async function getIncidentSources(env: Env, incidentIds: number[]) {
  const map = new Map<
    number,
    Array<{ label: string; url: string; publishedAt?: string }>
  >();
  if (incidentIds.length === 0) return map;

  for (const incidentIdBatch of chunkValues(incidentIds)) {
    const placeholders = incidentIdBatch.map(() => '?').join(', ');
    const result = await env.DB.prepare(
      `SELECT
         x.incident_id,
         s.name AS label,
         si.url,
         si.published_at
       FROM incident_sources x
       JOIN source_items si ON si.id = x.source_item_id
       JOIN sources s ON s.id = si.source_id
       WHERE x.incident_id IN (${placeholders})
       ORDER BY si.published_at ASC`,
    ).bind(...incidentIdBatch).all<{
      incident_id: number;
      label: string;
      url: string;
      published_at: string | null;
    }>();

    for (const row of result.results) {
      const list = map.get(row.incident_id) ?? [];
      list.push({
        label: row.label,
        url: row.url,
        ...(row.published_at ? { publishedAt: row.published_at } : {}),
      });
      map.set(row.incident_id, list);
    }
  }

  return map;
}

async function apiDay(env: Env, date: string, url: URL) {
  if (!isDate(date)) return json({ error: 'Invalid date' }, { status: 400 });
  const scope = normalizeScope(url.searchParams.get('scope'));

  const [alerts, incidents] = await Promise.all([
    env.DB.prepare(
      `SELECT id, started_at, ended_at, threat_types_json, source_key, source_url
       FROM alert_events
       WHERE scope = ? AND local_date = ? AND alert_type = 'air_raid'
       ORDER BY started_at ASC`,
    ).bind(scope, date).all<{
      id: number;
      started_at: string;
      ended_at: string | null;
      threat_types_json: string;
      source_key: string;
      source_url: string | null;
    }>(),
    env.DB.prepare(
      `SELECT
         i.id,
         COALESCE(i.location_name, i.admin_area) AS admin_area,
         i.occurred_at,
         COALESCE(i.research_impact_kind, i.impact_kind) AS impact_kind,
         i.current_summary,
         i.verification,
         i.published_lat,
         i.published_lng,
         i.geo_precision,
         i.reported_location_text,
         i.reported_location_specificity,
         i.location_redacted,
         i.display_radius_m,
         COALESCE(u.killed, 0) AS killed,
         COALESCE(u.injured, 0) AS injured,
         COALESCE(u.damaged_objects_json, '[]') AS damaged_objects_json
       FROM incidents i
       LEFT JOIN incident_updates u
         ON u.incident_id = i.id AND u.is_current = 1
       WHERE i.scope = ? AND i.incident_date = ?
       ORDER BY COALESCE(i.occurred_at, i.created_at) ASC`,
    ).bind(scope, date).all<{
      id: number;
      admin_area: string;
      occurred_at: string | null;
      impact_kind: string;
      current_summary: string | null;
      verification: string;
      published_lat: number | null;
      published_lng: number | null;
      geo_precision: string;
      reported_location_text: string | null;
      reported_location_specificity: string | null;
      location_redacted: number;
      display_radius_m: number;
      killed: number;
      injured: number;
      damaged_objects_json: string;
    }>(),
  ]);

  const sourceMap = await getIncidentSources(
    env,
    incidents.results.map((row) => Number(row.id)),
  );

  const now = new Date().toISOString();

  return json({
    date,
    scope,
    alertWindows: alerts.results.map((row) => ({
      id: String(row.id),
      startedAt: row.started_at,
      endedAt: row.ended_at ?? now,
      isActive: row.ended_at === null,
      threatTypes: JSON.parse(row.threat_types_json || '[]'),
      scope,
      source: row.source_key === 'kyiv_open_data'
        ? { label: 'Kyiv Open Data / Kyiv Digital', url: row.source_url ?? KYIV_CITY_DATA_PAGE }
        : row.source_key === 'kova_telegram'
          ? { label: 'Kyiv Oblast Military Administration', url: row.source_url ?? 'https://t.me/kyivoda' }
          : { label: 'alerts.in.ua', url: row.source_url ?? ALERTS_SOURCE_URL },
    })),
    incidents: incidents.results.map((row) => ({
      id: String(row.id),
      scope,
      district: row.admin_area,
      occurredAt: row.occurred_at ?? `${date}T12:00:00+03:00`,
      kind: row.impact_kind,
      summary: row.current_summary ?? 'Official consequence report',
      killed: Number(row.killed),
      injured: Number(row.injured),
      damagedObjects: JSON.parse(row.damaged_objects_json || '[]'),
      lat: isMappablePrecision(row.geo_precision) ? row.published_lat : null,
      lng: isMappablePrecision(row.geo_precision) ? row.published_lng : null,
      precision: row.geo_precision,
      displayRadiusMeters: Number(row.display_radius_m ?? 0),
      reportedLocation: row.reported_location_text
        ? {
            text: row.reported_location_text,
            specificity: row.reported_location_specificity ?? 'unknown',
            redacted: Number(row.location_redacted) === 1,
          }
        : null,
      verification: row.verification,
      sources: sourceMap.get(Number(row.id)) ?? [],
    })),
  });
}


function normalizeScopeFilter(value: string | null): Scope | 'both' {
  if (value === 'kyiv-oblast' || value === 'both') return value;
  return 'kyiv-city';
}

async function apiRange(env: Env, url: URL) {
  const scope = normalizeScopeFilter(url.searchParams.get('scope'));
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!from || !to || !isDate(from) || !isDate(to) || from > to) {
    return json(
      { error: 'Valid from=YYYY-MM-DD and to=YYYY-MM-DD are required' },
      { status: 400 },
    );
  }

  const scopeSql = scope === 'both' ? '' : ' AND scope = ?';
  const scopeBindings = scope === 'both' ? [] : [scope];

  const [dayRows, incidentRows, attackRows] = await Promise.all([
    env.DB.prepare(
      `SELECT date, scope, alert_count, alert_seconds, incident_count, killed, injured
       FROM daily_stats
       WHERE date >= ? AND date <= ?${scopeSql}
       ORDER BY date ASC`,
    ).bind(from, to, ...scopeBindings).all<{
      date: string;
      scope: Scope;
      alert_count: number;
      alert_seconds: number;
      incident_count: number;
      killed: number;
      injured: number;
    }>(),
    env.DB.prepare(
      `SELECT
         i.id,
         i.external_id,
         i.attack_external_id,
         i.incident_date,
         i.scope,
         COALESCE(i.location_name, i.admin_area) AS admin_area,
         i.location_name,
         i.occurred_at,
         COALESCE(i.research_impact_kind, i.impact_kind) AS impact_kind,
         i.threat_types_json,
         i.current_summary,
         i.verification,
         i.confidence,
         i.published_lat,
         i.published_lng,
         i.geo_precision,
         i.reported_location_text,
         i.reported_location_specificity,
         i.location_redacted,
         i.display_radius_m,
         i.damage_json,
         COALESCE(u.killed, 0) AS killed,
         COALESCE(u.injured, 0) AS injured,
         COALESCE(u.damaged_objects_json, '[]') AS damaged_objects_json
       FROM incidents i
       LEFT JOIN incident_updates u
         ON u.incident_id = i.id AND u.is_current = 1
       WHERE i.incident_date >= ? AND i.incident_date <= ?
       ${scope === 'both' ? '' : 'AND i.scope = ?'}
       ORDER BY i.incident_date DESC, COALESCE(i.occurred_at, i.created_at) DESC`,
    ).bind(from, to, ...scopeBindings).all<{
      id: number;
      external_id: string | null;
      attack_external_id: string | null;
      incident_date: string;
      scope: Scope;
      admin_area: string;
      location_name: string | null;
      occurred_at: string | null;
      impact_kind: string;
      threat_types_json: string;
      current_summary: string | null;
      verification: string;
      confidence: string;
      published_lat: number | null;
      published_lng: number | null;
      geo_precision: string;
      reported_location_text: string | null;
      reported_location_specificity: string | null;
      location_redacted: number;
      display_radius_m: number;
      damage_json: string;
      killed: number;
      injured: number;
      damaged_objects_json: string;
    }>(),
    env.DB.prepare(
      `SELECT external_id, attack_date, scope, killed, injured
       FROM attacks
       WHERE attack_date >= ? AND attack_date <= ?
       ${scope === 'both' ? '' : 'AND scope = ?'}
       ORDER BY attack_date DESC`,
    ).bind(from, to, ...scopeBindings).all<{
      external_id: string;
      attack_date: string;
      scope: Scope;
      killed: number;
      injured: number;
    }>(),
  ]);

  const sourceMap = await getIncidentSources(
    env,
    incidentRows.results.map((row) => Number(row.id)),
  );

  const incidents = incidentRows.results.map((row) => ({
    id: row.external_id ?? String(row.id),
    attackId: row.attack_external_id,
    date: row.incident_date,
    scope: row.scope,
    district: row.admin_area,
    locationName: row.location_name ?? row.admin_area,
    occurredAt: row.occurred_at,
    kind: row.impact_kind,
    threatTypes: JSON.parse(row.threat_types_json || '[]'),
    summary: row.current_summary ?? 'Incident report',
    killed: Number(row.killed),
    injured: Number(row.injured),
    damage: JSON.parse(row.damage_json || '[]'),
    damagedObjects: JSON.parse(row.damaged_objects_json || '[]'),
    lat: isMappablePrecision(row.geo_precision) ? row.published_lat : null,
    lng: isMappablePrecision(row.geo_precision) ? row.published_lng : null,
    precision: row.geo_precision,
    displayRadiusMeters: Number(row.display_radius_m ?? 0),
    reportedLocation: row.reported_location_text
      ? {
          text: row.reported_location_text,
          specificity: row.reported_location_specificity ?? 'unknown',
          redacted: Number(row.location_redacted) === 1,
        }
      : null,
    verification: row.verification,
    confidence: row.confidence,
    sources: sourceMap.get(Number(row.id)) ?? [],
  }));

  const areaMap = new Map<
    string,
    {
      area: string;
      lat: number | null;
      lng: number | null;
      precision: string;
      incidentCount: number;
      killed: number;
      injured: number;
      scopes: Set<Scope>;
    }
  >();

  for (const incident of incidents) {
    const mapEligible =
      typeof incident.lat === 'number' &&
      typeof incident.lng === 'number' &&
      isMappablePrecision(incident.precision);
    const key = `${incident.scope}:${incident.district}`;
    const current = areaMap.get(key) ?? {
      area: incident.district,
      lat: mapEligible ? incident.lat : null,
      lng: mapEligible ? incident.lng : null,
      precision: incident.precision,
      incidentCount: 0,
      killed: 0,
      injured: 0,
      scopes: new Set<Scope>(),
    };

    if (mapEligible && !isMappablePrecision(current.precision)) {
      current.lat = incident.lat;
      current.lng = incident.lng;
      current.precision = incident.precision;
    }

    current.incidentCount += 1;
    current.killed += incident.killed;
    current.injured += incident.injured;
    current.scopes.add(incident.scope);
    areaMap.set(key, current);
  }

  const attackCasualtiesByDay = new Map<string, { killed: number; injured: number }>();
  for (const attack of attackRows.results) {
    const key = `${attack.attack_date}:${attack.scope}`;
    const current = attackCasualtiesByDay.get(key) ?? { killed: 0, injured: 0 };
    current.killed += Number(attack.killed);
    current.injured += Number(attack.injured);
    attackCasualtiesByDay.set(key, current);
  }

  const incidentCasualtiesByDay = new Map<string, { killed: number; injured: number }>();
  for (const incident of incidents) {
    const key = `${incident.date}:${incident.scope}`;
    const current = incidentCasualtiesByDay.get(key) ?? { killed: 0, injured: 0 };
    current.killed += incident.killed;
    current.injured += incident.injured;
    incidentCasualtiesByDay.set(key, current);
  }

  const casualtyKeys = new Set([
    ...attackCasualtiesByDay.keys(),
    ...incidentCasualtiesByDay.keys(),
  ]);
  let killed = 0;
  let injured = 0;
  for (const key of casualtyKeys) {
    const casualties =
      attackCasualtiesByDay.get(key) ?? incidentCasualtiesByDay.get(key);
    if (!casualties) continue;
    killed += casualties.killed;
    injured += casualties.injured;
  }

  const alertCount = dayRows.results.reduce(
    (sum, row) => sum + Number(row.alert_count),
    0,
  );
  const alertSeconds = dayRows.results.reduce(
    (sum, row) => sum + Number(row.alert_seconds),
    0,
  );

  return json({
    from,
    to,
    scope,
    stats: {
      alertCount,
      alertSeconds,
      attackCount: attackRows.results.length,
      incidentCount: incidents.length,
      killed,
      injured,
      affectedAreas: areaMap.size,
    },
    days: dayRows.results.map((row) => {
      const key = `${row.date}:${row.scope}`;
      const casualties =
        attackCasualtiesByDay.get(key) ?? incidentCasualtiesByDay.get(key);
      return {
        date: row.date,
        scope: row.scope,
        alertCount: Number(row.alert_count),
        alertSeconds: Number(row.alert_seconds),
        incidentCount: Number(row.incident_count),
        killed: casualties?.killed ?? Number(row.killed),
        injured: casualties?.injured ?? Number(row.injured),
      };
    }),
    areas: [...areaMap.values()]
      .map((area) => ({
        area: area.area,
        lat: area.lat,
        lng: area.lng,
        precision: area.precision,
        incidentCount: area.incidentCount,
        killed: area.killed,
        injured: area.injured,
        scopes: [...area.scopes],
      }))
      .sort((a, b) => b.incidentCount - a.incidentCount || b.injured - a.injured),
    incidents,
  });
}

async function apiMap(env: Env, url: URL) {
  const scope = normalizeScope(url.searchParams.get('scope'));
  const date = url.searchParams.get('date');
  if (!date || !isDate(date)) {
    return json({ error: 'date=YYYY-MM-DD is required' }, { status: 400 });
  }

  const result = await env.DB.prepare(
    `SELECT
       i.id,
       COALESCE(i.location_name, i.admin_area) AS admin_area,
       COALESCE(i.research_impact_kind, i.impact_kind) AS impact_kind,
       i.current_summary,
       i.published_lat,
       i.published_lng,
       i.geo_precision,
       COALESCE(u.killed, 0) AS killed,
       COALESCE(u.injured, 0) AS injured
     FROM incidents i
     LEFT JOIN incident_updates u
       ON u.incident_id = i.id AND u.is_current = 1
     WHERE i.scope = ?
       AND i.incident_date = ?
       AND i.published_lat IS NOT NULL
       AND i.published_lng IS NOT NULL
       AND i.geo_precision IN (
         'district-centroid',
         'raion-centroid',
         'hromada-centroid',
         'settlement-centroid',
         'neighborhood-centroid',
         'street-segment',
         'address-generalized',
         'address-point'
       )`,
  ).bind(scope, date).all<{
    id: number;
    admin_area: string;
    impact_kind: string;
    current_summary: string | null;
    published_lat: number;
    published_lng: number;
    geo_precision: string;
    killed: number;
    injured: number;
  }>();

  return json({
    type: 'FeatureCollection',
    features: result.results.map((row) => ({
      type: 'Feature',
      id: row.id,
      geometry: {
        type: 'Point',
        coordinates: [Number(row.published_lng), Number(row.published_lat)],
      },
      properties: {
        area: row.admin_area,
        kind: row.impact_kind,
        summary: row.current_summary,
        precision: row.geo_precision,
        killed: Number(row.killed),
        injured: Number(row.injured),
      },
    })),
  });
}

async function route(request: Request, env: Env) {
  const url = new URL(request.url);

  if (url.pathname === '/health') {
    const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    return json({ ok: row?.ok === 1, service: 'air-stat-api' });
  }

  if (url.pathname === '/api/status' && request.method === 'GET') {
    return apiStatus(env);
  }

  if (url.pathname === '/api/progress' && request.method === 'GET') {
    await syncBackfillQueueState(env);
    return apiStatus(env);
  }

  if (url.pathname === '/api/days' && request.method === 'GET') {
    return apiDays(env, url);
  }

  const dayMatch = url.pathname.match(/^\/api\/days\/(\d{4}-\d{2}-\d{2})$/);
  if (dayMatch && request.method === 'GET') {
    return apiDay(env, dayMatch[1], url);
  }

  if (url.pathname === '/api/range' && request.method === 'GET') {
    return apiRange(env, url);
  }

  if (url.pathname === '/api/map' && request.method === 'GET') {
    return apiMap(env, url);
  }

  if (url.pathname.startsWith('/api/')) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error(error);
      return json(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      );
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    if (controller.cron === '17 2 * * *') {
      ctx.waitUntil(runDailyCollectors(env));
      return;
    }

    ctx.waitUntil(runMinuteCollectors(env));

  },
};
