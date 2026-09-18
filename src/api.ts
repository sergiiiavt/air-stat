import type { DayRecord, Scope } from './types/domain';

export interface DaySummary {
  date: string;
  scope: Scope;
  alertCount: number;
  alertSeconds: number;
  incidentCount: number;
  killed: number;
  injured: number;
  affectedAreas: number;
}

export interface ApiStatus {
  ok: boolean;
  service: string;
  alertsSourceConfigured: boolean;
  lastActiveSync: string | null;
  lastHistorySync: string | null;
  latestRun: {
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

export async function getDays(scope: Scope) {
  return getJson<{ scope: Scope; days: DaySummary[] }>(
    `/api/days?scope=${encodeURIComponent(scope)}`,
  );
}

export async function getDay(scope: Scope, date: string) {
  return getJson<DayRecord>(
    `/api/days/${encodeURIComponent(date)}?scope=${encodeURIComponent(scope)}`,
  );
}

export async function getStatus() {
  return getJson<ApiStatus>('/api/status');
}
