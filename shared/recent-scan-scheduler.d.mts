export interface RecentScanAttempt {
  target_date: string;
  last_attempt_at: string;
}

export function selectNextRecentScanDate(
  today: string,
  windowDays: number,
  attempts: RecentScanAttempt[],
): string;
