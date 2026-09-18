export type Scope = 'kyiv-city' | 'kyiv-oblast';

export type ThreatType =
  | 'uav'
  | 'ballistic'
  | 'cruise'
  | 'aviation'
  | 'combined'
  | 'unknown';

export type ImpactKind =
  | 'impact'
  | 'debris'
  | 'air-defense'
  | 'no-confirmed-impact';

export interface SourceRef {
  label: string;
  url: string;
  publishedAt?: string;
}

export interface AlertWindow {
  id: string;
  startedAt: string;
  endedAt: string;
  isActive?: boolean;
  threatTypes: ThreatType[];
  scope: Scope;
  source: SourceRef;
}

export interface Incident {
  id: string;
  scope: Scope;
  district: string;
  occurredAt: string;
  kind: ImpactKind;
  summary: string;
  killed: number;
  injured: number;
  damagedObjects: string[];
  lat: number | null;
  lng: number | null;
  precision: 'district-centroid' | 'community-centroid';
  verification: 'provisional' | 'confirmed' | 'final';
  sources: SourceRef[];
}

export interface DayRecord {
  date: string;
  scope: Scope;
  alertWindows: AlertWindow[];
  incidents: Incident[];
}
