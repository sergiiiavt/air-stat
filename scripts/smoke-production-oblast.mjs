const BASE_URL = (process.env.PRODUCTION_BASE_URL || 'https://air-alert-stat.com').replace(/\/$/, '');
const RANGE_FROM = '2026-06-22';
const RANGE_TO = '2026-09-18';
const MAX_ATTEMPTS = 72;
const RETRY_MS = 10_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function main() {
  const health = await fetchJson('/health');
  if (!health?.ok) {
    throw new Error('Production health endpoint did not return ok=true');
  }

  const path =
    '/api/range?from=' +
    encodeURIComponent(RANGE_FROM) +
    '&to=' +
    encodeURIComponent(RANGE_TO) +
    '&scope=kyiv-oblast';

  let lastSummary = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const range = await fetchJson(path);
      const timedDays = Array.isArray(range?.days)
        ? range.days.filter(
            (day) =>
              day?.scope === 'kyiv-oblast' &&
              (Number(day?.alertCount || 0) > 0 || Number(day?.alertSeconds || 0) > 0),
          )
        : [];

      const alertCount = Number(range?.stats?.alertCount || 0);
      const alertSeconds = Number(range?.stats?.alertSeconds || 0);
      lastSummary = {
        attempt,
        alertCount,
        alertSeconds,
        timedDays: timedDays.length,
        firstTimedDay: timedDays[0]?.date ?? null,
        lastTimedDay: timedDays[timedDays.length - 1]?.date ?? null,
      };

      let kovaHistory = null;
      try {
        const status = await fetchJson('/api/status');
        kovaHistory = status?.kovaHistory ?? null;
      } catch {
        kovaHistory = null;
      }

      console.log(
        'Kyiv Oblast production smoke:',
        JSON.stringify({ ...lastSummary, kovaHistory }),
      );

      if (alertCount > 0 && alertSeconds > 0 && timedDays.length > 0) {
        return;
      }

      if (kovaHistory?.phase === 'complete') {
        throw new Error(
          'KOVA history completed but historical Kyiv Oblast timing is still empty',
        );
      }
    } catch (error) {
      lastSummary = {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      };
      console.warn('Production smoke attempt failed:', JSON.stringify(lastSummary));
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_MS);
    }
  }

  try {
    const status = await fetchJson('/api/status');
    console.error(
      'Production collector status:',
      JSON.stringify({
        latestRun: status?.latestRun ?? null,
        latestRuns: status?.latestRuns ?? null,
        kovaHistory: status?.kovaHistory ?? null,
      }),
    );
  } catch (error) {
    console.error(
      'Unable to fetch production collector status:',
      error instanceof Error ? error.message : String(error),
    );
  }

  throw new Error(
    'Kyiv Oblast production range still has no alert timing data after retries: ' +
      JSON.stringify(lastSummary),
  );
}

await main();
