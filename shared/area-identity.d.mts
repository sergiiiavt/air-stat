export type AreaLevel = 'city' | 'oblast' | 'raion' | 'district' | 'settlement' | 'hromada';

export interface AreaDefinition {
  canonical: string;
  uk: string;
  level: AreaLevel;
  aliases?: string[];
}

export declare const AREA_DEFINITIONS: AreaDefinition[];

export declare function canonicalAreaName(value: string): string;
export declare function localizedAreaNames(value: string): { en: string; uk: string } | null;
export declare function areaLevel(value: string): AreaLevel | null;
export declare function isCanonicalAreaName(value: string): boolean;
export declare function isKnownAreaName(value: string): boolean;
export declare function areaKey(scope: string, area: string): string;
