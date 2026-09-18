import type { RangeResult, ScopeFilter } from './types/domain';

export interface ApiStatus {
  ok: boolean;
  service: string;
  alertsSourceConfigured: boolean;
  sourceMode?: string;
  alertsInUaConfigured?: boolean;
  researchPipeline?: {
    source: string;
    lastPoll: string | null;
  };
  historicalBackfill?: {
    status: string;
    configuredStatus: string;
    target: {
      from: string;
      to: string;
      chunkDays: number;
      direction: string;
    };
    cursor: {
      nextTo: string | null;
    };
    currentChunk: {
      from: string;
      to: string;
    } | null;
    processedChunks: number;
    totalChunks: number;
    progressPercent: number;
    updatedAt: string;
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
    lastError: string | null;
    latestDataRevision: string | null;
    inferredRunning: boolean;
  } | null;
  latestRun: {
    source_key?: string;
    sync_type?: string;
    status?: string;
    started_at?: string;
    finished_at?: string | null;
    error_message?: string | null;
  } | null;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function getRange(scope: ScopeFilter, from: string, to: string) {
  const params = new URLSearchParams({ scope, from, to });
  return getJson<RangeResult>(`/api/range?${params.toString()}`);
}

export async function getStatus() {
  return getJson<ApiStatus>('/api/status');
}
