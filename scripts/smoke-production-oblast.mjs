const BASE_URL = (process.env.PRODUCTION_BASE_URL || 'https://air-alert-stat.com').replace(/\/$/, '');

async function fetchResponse(path, accept) {
  const response = await fetch(BASE_URL + path, {
    headers: {
      accept,
      'user-agent': 'air-stat-production-smoke/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(path + ' returned HTTP ' + response.status);
  }

  return response;
}

async function fetchJson(path) {
  const response = await fetchResponse(path, 'application/json');
  return response.json();
}

async function verifyFrontendOnce(attempt) {
  // Cloudflare can briefly serve an older cached index.html immediately after
  // the new hashed assets are uploaded. Cache-bust both the document and asset
  // reads so the smoke test verifies the deployed generation instead of failing
  // on a transient old-index/new-assets mismatch.
  const cacheKey = `${Date.now()}-${attempt}`;
  const response = await fetchResponse(`/?__smoke=${cacheKey}`, 'text/html,*/*;q=0.8');
  const contentType = response.headers.get('content-type') || '';
  const html = await response.text();

  if (!contentType.toLowerCase().includes('text/html')) {
    throw new Error('Production root did not return HTML');
  }
  if (!html.includes('id="root"')) {
    throw new Error('Production root HTML is missing the React mount point');
  }
  if (!html.includes('id="boot-fallback"')) {
    throw new Error('Production root HTML is missing the independent boot fallback');
  }

  const assetPaths = Array.from(
    html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g),
    (match) => match[1],
  );
  const uniqueAssetPaths = [...new Set(assetPaths)];

  if (!uniqueAssetPaths.some((path) => path.endsWith('.js'))) {
    throw new Error('Production root HTML does not reference a JavaScript bundle');
  }
  if (!uniqueAssetPaths.some((path) => path.endsWith('.css'))) {
    throw new Error('Production root HTML does not reference a stylesheet bundle');
  }

  for (const path of uniqueAssetPaths) {
    const asset = await fetchResponse(`${path}?__smoke=${cacheKey}`, '*/*');
    const assetType = (asset.headers.get('content-type') || '').toLowerCase();
    const body = await asset.arrayBuffer();

    if (body.byteLength < 1000) {
      throw new Error(`Production asset ${path} is unexpectedly small (${body.byteLength} bytes)`);
    }
    if (assetType.includes('text/html')) {
      throw new Error(`Production asset ${path} was routed to HTML instead of the static asset`);
    }
    if (path.endsWith('.js') && !assetType.includes('javascript')) {
      throw new Error(`Production JavaScript asset ${path} has unexpected content-type ${assetType || 'none'}`);
    }
    if (path.endsWith('.css') && !assetType.includes('text/css')) {
      throw new Error(`Production stylesheet asset ${path} has unexpected content-type ${assetType || 'none'}`);
    }
  }

  return uniqueAssetPaths;
}

async function verifyFrontend() {
  const maxAttempts = 6;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await verifyFrontendOnce(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        console.log(
          `Frontend assets not coherent yet (attempt ${attempt}/${maxAttempts}): ${logSafe(error.message)}`,
        );
        await sleep(5_000);
      }
    }
  }

  throw lastError;
}

const PIPELINE_STATE_VERSION = 4;
const RESEARCH_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const RECENT_WINDOW_DAYS = 7;
const RECENT_RESEARCH_REVISION = '2026-09-30-news-first-v1';
// Recent research is intentionally throttled to roughly hourly. Allow one
// interval plus a 15-minute scheduler/network cushion so deploys between runs
// do not fail while still catching a genuinely stalled collector.
const RECENT_MAX_AGE_MS = 75 * 60 * 1000;
const PROGRESS_ATTEMPTS = 18;
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
      if (pipeline?.model !== RESEARCH_MODEL) {
        throw new Error(
          `Production research model mismatch (got ${pipeline?.model ?? 'none'})`,
        );
      }
      if (pipeline?.recentWindowDays !== RECENT_WINDOW_DAYS) {
        throw new Error(
          `Recent research window is not ${RECENT_WINDOW_DAYS} days (got ${pipeline?.recentWindowDays ?? 'none'})`,
        );
      }
      if (pipeline?.recentRevision !== RECENT_RESEARCH_REVISION) {
        throw new Error(
          `Recent research code revision mismatch (got ${pipeline?.recentRevision ?? 'none'})`,
        );
      }
      if (pipeline?.recentAppliedRevision !== RECENT_RESEARCH_REVISION) {
        const lastRun = pipeline?.recentLastRun;
        console.warn(
          `::warning::Recent research revision ${RECENT_RESEARCH_REVISION} is deployed but has not been applied by a successful background scan yet ` +
            `(applied=${pipeline?.recentAppliedRevision ?? 'none'}; runStatus=${lastRun?.status ?? 'none'}; ` +
            `runError=${logSafe(lastRun?.error_message ?? 'none')}). This asynchronous readiness condition does not block an unrelated application deploy.`,
        );
      }
      if (!recentEnough(pipeline?.recentLastAttempt)) {
        throw new Error(
          `Recent research has not attempted a run recently (last=${pipeline?.recentLastAttempt ?? 'none'})`,
        );
      }
      if (!recentEnough(pipeline?.recentLastSuccess)) {
        const lastRun = pipeline?.recentLastRun;
        throw new Error(
          `Recent research has not completed successfully recently (last=${pipeline?.recentLastSuccess ?? 'none'}; ` +
            `runStatus=${lastRun?.status ?? 'none'}; runError=${lastRun?.error_message ?? 'none'})`,
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

function assertAlertWindowShape(alertWindows, label) {
  if (!Array.isArray(alertWindows)) {
    throw new Error(`${label} is missing alertWindows`);
  }

  for (const [index, window] of alertWindows.entries()) {
    if (
      !window ||
      typeof window !== 'object' ||
      typeof window.id !== 'string' ||
      (window.scope !== 'kyiv-city' && window.scope !== 'kyiv-oblast') ||
      typeof window.localDate !== 'string' ||
      typeof window.startedAt !== 'string' ||
      typeof window.endedAt !== 'string' ||
      typeof window.isActive !== 'boolean' ||
      window.alertType !== 'air_raid' ||
      !Array.isArray(window.threatTypes) ||
      !Number.isFinite(new Date(window.startedAt).getTime()) ||
      !Number.isFinite(new Date(window.endedAt).getTime()) ||
      new Date(window.endedAt).getTime() <= new Date(window.startedAt).getTime()
    ) {
      throw new Error(`${label} alertWindows[${index}] has an invalid shape or interval`);
    }
  }
}

function assertDamageShape(incidents, label) {
  for (const incident of incidents) {
    if (!Array.isArray(incident?.damage)) {
      throw new Error(`${label} incident ${incident?.id ?? 'unknown'} has non-array damage`);
    }

    for (const [index, item] of incident.damage.entries()) {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        typeof item.type !== 'string' ||
        !item.type.trim() ||
        typeof item.description !== 'string'
      ) {
        throw new Error(
          `${label} incident ${incident?.id ?? 'unknown'} has invalid damage[${index}] shape`,
        );
      }
    }
  }
}

async function main() {
  const frontendAssets = await verifyFrontend();
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
    !Array.isArray(recentRange.alertWindows) ||
    !Array.isArray(recentRange.areas) ||
    !Array.isArray(recentRange.incidents) ||
    !recentRange.stats ||
    typeof recentRange.stats !== 'object'
  ) {
    throw new Error('Production recent range endpoint returned an invalid payload');
  }

  const recentMapEligibleIncidents = recentRange.incidents.filter(
    (incident) => typeof incident?.lat === 'number' && typeof incident?.lng === 'number',
  );
  const recentMappedAreas = recentRange.areas.filter(
    (area) => typeof area?.lat === 'number' && typeof area?.lng === 'number',
  );
  if (
    Number(recentRange?.stats?.incidentCount || 0) > 0 &&
    recentMappedAreas.length === 0
  ) {
    console.warn(
      '::warning::Recent incidents exist but none resolve to a map-eligible administrative area.',
    );
  }

  if (
    !sixMonthRange ||
    typeof sixMonthRange !== 'object' ||
    !Array.isArray(sixMonthRange.days) ||
    !Array.isArray(sixMonthRange.alertWindows) ||
    !Array.isArray(sixMonthRange.areas) ||
    !Array.isArray(sixMonthRange.incidents) ||
    !sixMonthRange.stats ||
    typeof sixMonthRange.stats !== 'object'
  ) {
    throw new Error('Production 6-month range endpoint returned an invalid payload');
  }

  assertAlertWindowShape(recentRange.alertWindows, 'Recent range');
  assertAlertWindowShape(sixMonthRange.alertWindows, 'Six-month range');
  assertDamageShape(recentRange.incidents, 'Recent range');
  assertDamageShape(sixMonthRange.incidents, 'Six-month range');

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
      frontendAssetCount: frontendAssets.length,
      frontendAssets,
      rangeDays: range.days.length,
      incidentCount: Number(range?.stats?.incidentCount || 0),
      alertCount: Number(range?.stats?.alertCount || 0),
      sixMonthRangeDays: sixMonthRange.days.length,
      sixMonthAlertWindowCount: sixMonthRange.alertWindows.length,
      sixMonthIncidentCount: Number(sixMonthRange?.stats?.incidentCount || 0),
      recentFrom,
      recentTo: today,
      recentIncidentCount: Number(recentRange?.stats?.incidentCount || 0),
      recentAlertCount: Number(recentRange?.stats?.alertCount || 0),
      recentAlertWindowCount: recentRange.alertWindows.length,
      recentMapEligibleIncidentCount: recentMapEligibleIncidents.length,
      recentMappedAreaCount: recentMappedAreas.length,
      recentMappedAreaKeys: recentMappedAreas.map((area) => area.key),
      recentResearch: status?.researchPipeline ?? null,
      researchBackfill: status?.researchBackfill ?? null,
      latestRuns: status?.latestRuns ?? null,
    }),
  );
}

await main();
