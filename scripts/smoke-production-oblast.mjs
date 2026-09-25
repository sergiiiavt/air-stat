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

const PIPELINE_STATE_VERSION = 3;
const PROGRESS_ATTEMPTS = 6;
const PROGRESS_RETRY_MS = 20_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The Worker reads the campaign state from raw.githubusercontent, which can
 * still serve a stale response or a 404 for a short while after a merge, so the
 * pipeline-state assertion is retried instead of failing the deploy outright.
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

      return status;
    } catch (error) {
      lastError = error;
      if (attempt < PROGRESS_ATTEMPTS) {
        console.log(`Pipeline state not ready yet (attempt ${attempt}/${PROGRESS_ATTEMPTS}): ${error.message}`);
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

  const status = await waitForPipelineState();

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
      researchBackfill: status?.researchBackfill ?? null,
      latestRuns: status?.latestRuns ?? null,
    }),
  );
}

await main();
