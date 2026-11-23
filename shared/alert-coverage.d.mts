export interface AlertCoverageSource {
  key: string;
  label: string;
  from: string;
  to: string | null;
}

export interface AlertCoverageEntry {
  scope: 'kyiv-city' | 'kyiv-oblast';
  from: string;
  sources: AlertCoverageSource[];
}

export declare const ALERT_COVERAGE: AlertCoverageEntry[];
export declare function alertCoverageStart(scopeFilter: 'kyiv-city' | 'kyiv-oblast' | 'both'): string | null;
export declare function alertCoverageIncomplete(
  scopeFilter: 'kyiv-city' | 'kyiv-oblast' | 'both',
  from: string,
): boolean;
