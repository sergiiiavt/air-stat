const BASE_URL = (process.env.PRODUCTION_BASE_URL || 'https://air-alert-stat.com').replace(/\/$/, '');

async function fetchJson(path) {
  const response = await fetch(BASE_URL + path, {
    headers: {
      accept: 'application/json',
      'user-agent': 'air-stat-production-smoke/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(path + ' returned HTTP ' + response.status);
  }

  return response.json();
}

const PIPELINE_STATE_VERSION = 4;
const RECENT_WINDOW_DAYS = 3;
const RECENT_MAX_AGE_MS = 15 * 60 * 1000;
const PROGRESS_ATTEMPTS = 9;
const PROGRESS_RETRY_MS = 20_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function kyivDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date, amount) {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function recentEnough(value) {
  if (!value) return false;
  const time = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(time) && Date.now() - time <= RECENT_MAX_AGE_MS;
}

/**
 * The message can carry production response text. Space through tilde is
 * printable ASCII; anything else (newlines, terminal escapes) becomes a space,
 * so a crafted response cannot forge log lines.
 */
function logSafe(message) {
  return String(message).replace(/[^ -~]+/g, ' ').slice(0, 300);
}

/**
 * The Worker projects the Cloudflare-native research campaign from D1. The
 * assertion is retried because migrations/deploy propagation can briefly race
 * the first production request after a release.
 */
async function waitForPipelineState() {
  let lastError = null;

  for (let attempt = 1; attempt <= PROGRESS_ATTEMPTS; attempt += 1) {
    try {
      const progress = await fetchJson('/api/progress');
      if (!progress || typeof progress !== 'object') {
        throw new Error('Production progress endpoint returned an invalid payload');
      }
      if (progress?.researchBackfill?.stateVersion !== PIPELINE_STATE_VERSION) {
        throw new Error(
          `Production progress endpoint is not using pipeline state version ${PIPELINE_STATE_VERSION} ` +
            `(got ${progress?.researchBackfill?.stateVersion ?? 'none'})`,
        );
      }

      const status = await fetchJson('/api/status');
      if (!status || typeof status !== 'object') {
        throw new Error('Production status endpoint returned an invalid payload');
      }
      if (status?.researchBackfill?.stateVersion !== PIPELINE_STATE_VERSION) {
        throw new Error(
          `Production status did not persist pipeline state version ${PIPELINE_STATE_VERSION} after progress refresh`,
        );
      }
      if (status?.researchBackfill?.mode !== 'cloudflare-native-event-date') {
        throw new Error(
          `Production status is not using cloudflare-native-event-date mode (got ${status?.researchBackfill?.mode ?? 'none'})`,
        );
      }
      if (status?.researchPipeline?.source !== 'cloudflare-native') {
        throw new Error(
          `Production research source is not cloudflare-native (got ${status?.researchPipeline?.source ?? 'none'})`,
        );
      }

      return status;
    } catch (error) {
      lastError = error;
      if (attempt < PROGRESS_ATTEMPTS) {
        console.log(
          `Pipeline state not ready yet (attempt ${attempt}/${PROGRESS_ATTEMPTS}): ${logSafe(error.message)}`,
        );
        await sleep(PROGRESS_RETRY_MS);
      }
    }
  }

  throw lastError;
}

async function waitForRecentResearch() {
  let lastError = null;

  for (let attempt = 1; attempt <= PROGRESS_ATTEMPTS; attempt += 1) {
    try {
      const status = await fetchJson('/api/status');
      const pipeline = status?.researchPipeline;
      if (pipeline?.recentWindowDays !== RECENT_WINDOW_DAYS) {
        throw new Error(
          `Recent research window is not ${RECENT_WINDOW_DAYS} days (got ${pipeline?.recentWindowDays ?? 'none'})`,
        );
      }
      if (!recentEnough(pipeline?.recentLastAttempt)) {
        throw new Error(
          `Recent research has not attempted a run recently (last=${pipeline?.recentLastAttempt ?? 'none'})`,
        );
      }
      if (!recentEnough(pipeline?.recentLastSuccess)) {
        throw new Error(
          `Recent research has not completed successfully recently (last=${pipeline?.recentLastSuccess ?? 'none'})`,
        );
      }
      return status;
    } catch (error) {
      lastError = error;
      if (attempt < PROGRESS_ATTEMPTS) {
        console.log(
          `Recent research not ready yet (attempt ${attempt}/${PROGRESS_ATTEMPTS}): ${logSafe(error.message)}`,
        );
        await sleep(PROGRESS_RETRY_MS);
      }
    }
  }

  throw lastError;
}

async function main() {
  const health = await fetchJson('/health');
  if (!health?.ok) {
    throw new Error('Production health endpoint did not return ok=true');
  }

  await waitForPipelineState();
  const status = await waitForRecentResearch();

  const range = await fetchJson(
    '/api/range?from=2026-09-01&to=2026-09-18&scope=kyiv-oblast',
  );

  if (!range || typeof range !== 'object' || !Array.isArray(range.days)) {
    throw new Error('Production range endpoint returned an invalid payload');
  }

  if (!range.stats || typeof range.stats !== 'object') {
    throw new Error('Production range endpoint is missing stats');
  }

  const sixMonthRange = await fetchJson(
    '/api/range?from=2026-03-25&to=2026-09-20&scope=both',
  );

  const today = kyivDate();
  const recentFrom = addDays(today, -(RECENT_WINDOW_DAYS - 1));
  const recentRange = await fetchJson(
    `/api/range?from=${recentFrom}&to=${today}&scope=both`,
  );

  if (
    !recentRange ||
    typeof recentRange !== 'object' ||
    !Array.isArray(recentRange.days) ||
    !Array.isArray(recentRange.incidents) ||
    !recentRange.stats ||
    typeof recentRange.stats !== 'object'
  ) {
    throw new Error('Production recent range endpoint returned an invalid payload');
  }

  if (
    !sixMonthRange ||
    typeof sixMonthRange !== 'object' ||
    !Array.isArray(sixMonthRange.days) ||
    !Array.isArray(sixMonthRange.areas) ||
    !Array.isArray(sixMonthRange.incidents) ||
    !sixMonthRange.stats ||
    typeof sixMonthRange.stats !== 'object'
  ) {
    throw new Error('Production 6-month range endpoint returned an invalid payload');
  }

  for (const area of sixMonthRange.areas) {
    if (typeof area?.key !== 'string' || !area.key.includes(':')) {
      throw new Error('Production range area is missing a stable scope-aware key');
    }

    const matchingIncidents = sixMonthRange.incidents.filter(
      (incident) => `${incident.scope}:${incident.district}` === area.key,
    );
    if (matchingIncidents.length !== Number(area.incidentCount)) {
      throw new Error(
        `Area ${area.key} reports ${area.incidentCount} incidents but drill-down resolves ${matchingIncidents.length}`,
      );
    }
  }

  console.log(
    'Production smoke:',
    JSON.stringify({
      health: health.ok,
      rangeDays: range.days.length,
      incidentCount: Number(range?.stats?.incidentCount || 0),
      alertCount: Number(range?.stats?.alertCount || 0),
      sixMonthRangeDays: sixMonthRange.days.length,
      sixMonthIncidentCount: Number(sixMonthRange?.stats?.incidentCount || 0),
      recentFrom,
      recentTo: today,
      recentIncidentCount: Number(recentRange?.stats?.incidentCount || 0),
      recentAlertCount: Number(recentRange?.stats?.alertCount || 0),
      recentResearch: status?.researchPipeline ?? null,
      researchBackfill: status?.researchBackfill ?? null,
      latestRuns: status?.latestRuns ?? null,
    }),
  );
}

await main();
