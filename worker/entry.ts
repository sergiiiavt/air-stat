import { summarizeDailyResearchCoverage, type DailyResearchRun } from '../shared/daily-research-coverage.mjs';
import { RECENT_PUBLICATION_DAYS } from './automated-research';
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
    `SELECT
       id,
       target_date,
       started_at,
       finished_at,
       status,
       discovered_count,
       finding_count,
       attack_write_count,
       incident_write_count,
       error_message
     FROM automated_research_runs
     WHERE kind = 'daily'
     ORDER BY id ASC`,
  ).all<DailyResearchRun>();

  const today = kyivDate();
  const earliestRecorded = result.results[0]?.target_date;
  const firstDate = earliestRecorded && earliestRecorded <= today ? earliestRecorded : today;
  const days = [];

  for (let date = today; date >= firstDate; date = addDays(date, -1)) {
    days.push({
      date,
      ...summarizeDailyResearchCoverage(result.results, date, RECENT_PUBLICATION_DAYS),
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
