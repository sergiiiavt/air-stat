export type BallisticTimestamp = { label: string; minuteOfDay: number } | null;
export function ballisticTime(startedAt: string | null | undefined, attackDate: string): BallisticTimestamp;
export function ballisticDays<T extends { date: string; startedAt: string | null }>(
  attacks: T[],
): Array<{ date: string; attacks: T[]; timed: number }>;
