export type Scope = 'kyiv-city' | 'kyiv-oblast';
export type ScopeFilter = Scope | 'both';

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
  | 'fire'
  | 'damage'
  | 'no-confirmed-impact'
  | 'unknown';

export type Verification = 'provisional' | 'confirmed' | 'final';
export type Confidence = 'low' | 'medium' | 'high';

export interface SourceRef {
  label: string;
  url: string;
  publishedAt?: string;
}

export interface DamageItem {
  type: string;
  count?: number | null;
  description: string;
}

export interface Incident {
  id: string;
  attackId?: string | null;
  date: string;
  scope: Scope;
  district: string;
  locationName: string;
  occurredAt: string | null;
  kind: ImpactKind;
  threatTypes: ThreatType[];
  summary: string;
  killed: number;
  injured: number;
  damage: DamageItem[];
  damagedObjects: string[];
  lat: number | null;
  lng: number | null;
  precision: string;
  displayRadiusMeters: number;
  reportedLocation?: {
    text: string;
    specificity: string;
    redacted: boolean;
  } | null;
  verification: Verification;
  confidence: Confidence;
  sources: SourceRef[];
}

export interface AreaSummary {
  area: string;
  lat: number;
  lng: number;
  incidentCount: number;
  killed: number;
  injured: number;
  scopes: Scope[];
}

export interface RangeStats {
  alertCount: number;
  attackCount: number;
  alertSeconds: number;
  incidentCount: number;
  killed: number;
  injured: number;
  affectedAreas: number;
}

export interface RangeDay {
  date: string;
  scope: Scope;
  alertCount: number;
  alertSeconds: number;
  incidentCount: number;
  killed: number;
  injured: number;
}

export interface RangeResult {
  from: string;
  to: string;
  scope: ScopeFilter;
  stats: RangeStats;
  days: RangeDay[];
  areas: AreaSummary[];
  incidents: Incident[];
}
