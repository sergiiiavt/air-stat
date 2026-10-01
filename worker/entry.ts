import worker from './index';

type WorkerEnv = {
  DB: D1Database;
  [key: string]: unknown;
};

type BaseWorker = {
  fetch(request: Request, env: WorkerEnv): Promise<Response>;
  scheduled(
    controller: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): void | Promise<void>;
};

type DailyAggregateRow = {
  target_date: string;
  attempts: number;
  successful_runs: number;
  failed_runs: number;
  running_runs: number;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_error: string | null;
  discovered_count: number | null;
  finding_count: number | null;
  attack_write_count: number | null;
  incident_write_count: number | null;
};

const baseWorker = worker as unknown as BaseWorker;

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

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

async function dailyAnalysisDays(env: WorkerEnv) {
  const result = await env.DB.prepare(
    `WITH daily AS (
       SELECT
         id,
         target_date,
         started_at,
         finished_at,
         status,
         discovered_count,
         finding_count,
         attack_write_count,
         incident_write_count,
         error_message,
         ROW_NUMBER() OVER (
           PARTITION BY target_date
           ORDER BY id DESC
         ) AS latest_rank,
         ROW_NUMBER() OVER (
           PARTITION BY target_date
           ORDER BY CASE WHEN status = 'success' THEN 0 ELSE 1 END, id DESC
         ) AS summary_rank
       FROM automated_research_runs
       WHERE kind = 'daily'
     ), aggregates AS (
       SELECT
         target_date,
         COUNT(*) AS attempts,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_runs,
         SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed_runs,
         SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_runs
       FROM daily
       GROUP BY target_date
     )
     SELECT
       a.target_date,
       a.attempts,
       a.successful_runs,
       a.failed_runs,
       a.running_runs,
       latest.started_at AS last_started_at,
       latest.finished_at AS last_finished_at,
       latest.error_message AS last_error,
       summary.discovered_count,
       summary.finding_count,
       summary.attack_write_count,
       summary.incident_write_count
     FROM aggregates a
     LEFT JOIN daily latest
       ON latest.target_date = a.target_date AND latest.latest_rank = 1
     LEFT JOIN daily summary
       ON summary.target_date = a.target_date AND summary.summary_rank = 1
     ORDER BY a.target_date DESC`,
  ).all<DailyAggregateRow>();

  const today = kyivDate();
  const byDate = new Map(result.results.map((row) => [row.target_date, row]));
  const earliestRecorded = result.results.at(-1)?.target_date;
  const firstDate = earliestRecorded && earliestRecorded <= today ? earliestRecorded : today;
  const days = [];

  for (let date = today; date >= firstDate; date = addDays(date, -1)) {
    const row = byDate.get(date);
    const attempts = Number(row?.attempts ?? 0);
    const successfulRuns = Number(row?.successful_runs ?? 0);
    const failedRuns = Number(row?.failed_runs ?? 0);
    const runningRuns = Number(row?.running_runs ?? 0);
    const status = runningRuns > 0
      ? 'in_progress'
      : successfulRuns > 0
        ? 'completed'
        : attempts > 0
          ? 'failed'
          : 'pending';

    days.push({
      date,
      status,
      attempts,
      successfulRuns,
      failedRuns,
      lastStartedAt: row?.last_started_at ?? null,
      lastFinishedAt: row?.last_finished_at ?? null,
      lastError: row?.last_error ?? null,
      discoveredCount: Number(row?.discovered_count ?? 0),
      findingCount: Number(row?.finding_count ?? 0),
      attackWriteCount: Number(row?.attack_write_count ?? 0),
      incidentWriteCount: Number(row?.incident_write_count ?? 0),
    });
  }

  return days;
}

async function augmentProgressResponse(response: Response, env: WorkerEnv) {
  if (!response.ok) return response;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return response;

  const payload = await response.json() as Record<string, unknown>;
  const researchBackfill = payload.researchBackfill;
  if (!researchBackfill || typeof researchBackfill !== 'object' || Array.isArray(researchBackfill)) {
    return new Response(JSON.stringify(payload), response);
  }

  payload.researchBackfill = {
    ...(researchBackfill as Record<string, unknown>),
    dailyDays: await dailyAnalysisDays(env),
  };

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv) {
    const response = await baseWorker.fetch(request, env);
    const url = new URL(request.url);
    const isProgressRequest =
      request.method === 'GET' &&
      (url.pathname === '/api/progress' || url.pathname === '/api/status');

    return isProgressRequest
      ? augmentProgressResponse(response, env)
      : response;
  },

  scheduled(
    controller: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ) {
    return baseWorker.scheduled(controller, env, ctx);
  },
};
