import type { ScopeFilter } from './types/domain';

export type DashboardViewMode = 'map' | 'timeline' | 'hours' | 'trends' | 'ballistic';

export interface SharedDashboardState {
  viewMode: DashboardViewMode;
  scope: ScopeFilter;
  from: string;
  to: string;
  presetDays: number | null;
}

export function readSharedState(search: string, today: string): SharedDashboardState | null;
export function buildShareUrl(href: string, state: SharedDashboardState): string;
