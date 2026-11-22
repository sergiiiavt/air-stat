export declare const KOVA_OBLAST_AREA: 'Kyiv Oblast';
export declare const KOVA_RAIONS: readonly string[];

export interface KovaAlertEvent {
  kind: 'start' | 'clear';
  adminArea: string;
}

export interface KovaPostInput {
  id: string;
  time: string;
  text: string;
  url: string;
}

export interface KovaInterval {
  externalId: string;
  startedAt: string;
  endedAt: string | null;
  sourceUrl: string;
  adminArea: string;
  threatTypes: string[];
}

export declare function kovaAlertEvent(text: string): KovaAlertEvent | null;
export declare function kovaAlertKind(text: string): 'start' | 'clear' | null;
export declare function kovaThreatTypes(text: string): string[];
export declare function kovaStartAreas(event: KovaAlertEvent | null): string[];
export declare function kovaIntervalExternalId(postId: string, adminArea: string, wholeOblastStart: boolean): string;
export declare function kovaPostNumber(id: string): number | null;
export declare function buildKovaIntervals(
  posts: KovaPostInput[],
  options?: { nowMs?: number; openWindowMs?: number },
): KovaInterval[];
