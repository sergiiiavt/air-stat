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
    backfillLastPoll?: string | null;
  };
  researchArchive?: {
    firstDate: string | null;
    lastDate: string | null;
    indexedDays: number;
    lastImportedAt: string | null;
  } | null;
  researchBackfill?: {
    campaign: string;
    mode?: string;
    from: string;
    to: string;
    batchSize: number;
    maxAttempts: number;
    updatedAt?: string | null;
    total: number;
    pending: number;
    in_progress: number;
    retry: number;
    completed: number;
    needs_review: number;
    failed: number;
    completionPercent: number;
    lastCompletedDate?: string | null;
    nextDates: string[];
    nextPublicationDates?: string[];
    days?: Array<{
      date: string;
      status: 'pending' | 'in_progress' | 'retry' | 'completed' | 'needs_review' | 'failed';
      attempts: number;
      completedAt?: string | null;
      lastError?: string | null;
    }>;
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

export async function getProgress() {
  return getJson<ApiStatus>('/api/progress');
}
