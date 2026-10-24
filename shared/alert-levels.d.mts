export type AlertLevel = 'yellow' | 'red' | 'unknown';
export const ALERT_LEVELS: AlertLevel[];
export const LEVEL_OBSERVATION_TTL_MS: number;
export interface LevelWindow {
  id: string; scope: 'kyiv-city' | 'kyiv-oblast'; localDate: string;
  startedAt: string; endedAt: string; isActive: boolean; alertType: string;
  alertLevel: AlertLevel; threatTypes: string[]; sourceKey?: string;
}
export interface LevelObservation {
  episodeStartedAt: string; observedAt: string; lastObservedAt: string; alertLevel: AlertLevel;
}
export function alertLevelFromCauses(causes: unknown, lastCause?: string | null): AlertLevel;
export function kyivLocalDate(time: string | number): string;
export function parseKyivTimestamp(value: string): string | null;
export function normalizeKyivEvents(items: Array<{ state: number; created_at: string; causes?: string[]; cause?: string }>): Array<{ at: string; state: number; causes: string[]; level: AlertLevel }>;
export function partitionAlertWindows(windows: Array<Omit<LevelWindow, 'alertLevel'> & { alertLevel?: AlertLevel }>, observations?: LevelObservation[], now?: string): LevelWindow[];
export function dailyAlertLevelSeconds(windows: LevelWindow[], from: string, to: string): Array<{ date: string; scope: 'kyiv-city' | 'kyiv-oblast'; yellow: number; red: number; unknown: number }>;
