export type DailyResearchRunStatus = 'running' | 'success' | 'error';
export type DailyResearchCoverageStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface DailyResearchRun {
  id: number;
  target_date: string;
  started_at: string;
  finished_at: string | null;
  status: DailyResearchRunStatus;
  discovered_count: number | null;
  finding_count: number | null;
  attack_write_count: number | null;
  incident_write_count: number | null;
  error_message: string | null;
}

export interface DailyResearchCoverageSummary {
  status: DailyResearchCoverageStatus;
  attempts: number;
  successfulRuns: number;
  failedRuns: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
  discoveredCount: number;
  findingCount: number;
  attackWriteCount: number;
  incidentWriteCount: number;
}

export function summarizeDailyResearchCoverage(
  runs: DailyResearchRun[],
  date: string,
  windowDays: number,
): DailyResearchCoverageSummary;
