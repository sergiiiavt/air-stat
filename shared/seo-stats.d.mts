export interface AlertRow { started_at: string; ended_at: string | null; local_date: string }
export interface DayStats { date: string; alertCount: number; alertSeconds: number }
export interface LongestAlert { startedAt: string; endedAt: string; seconds: number; ongoing: boolean }
export interface PeriodStats {
  key: string; alertCount: number; alertSeconds: number; daysWithAlerts: number;
  observedDays: number; observedSeconds: number; longest: LongestAlert | null;
  maxCountDay: { date: string; alertCount: number } | null;
  maxSecondsDay: { date: string; alertSeconds: number } | null;
  hourSeconds: number[]; firstDate: string | null; lastDate: string | null;
}
export interface AlertHistory {
  coverageFrom: string; generatedAt: string; today: string; until: string;
  days: DayStats[]; months: PeriodStats[]; years: PeriodStats[]; total: PeriodStats;
}
export function createKyivClock(fromMs: number, toMs: number): {
  offsetAt(ms: number): number; localDate(ms: number): string; localHour(ms: number): number; midnight(date: string): number;
};
export function addDays(date: string, amount: number): string;
export function daysInMonth(month: string): number;
export function computeAlertHistory(rows: AlertRow[], options: { coverageFrom: string; until?: string | null; now?: string }): AlertHistory;
export function monthKeysBetween(fromMonth: string, toMonth: string): string[];
