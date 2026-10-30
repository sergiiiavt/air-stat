export interface BallisticEvidence {
  id: string;
  date: string;
  startedAt: string | null;
  endedAt: null;
  timeEvidence: 'date-only' | 'reported-strike';
  provenance: 'curated';
  verification: 'confirmed';
  confidence: 'high';
  summary: string;
  summaryUk: string;
  sources: { label: string; url: string }[];
}
export const VERIFIED_BALLISTIC_EVENTS: BallisticEvidence[];
export function mergeBallisticEvidence<T extends { id:string; date:string }>(research:T[], verified: BallisticEvidence[],from:string,to:string): Array<T | BallisticEvidence>;
export function explicitlyBallisticResearch(summary:string,threatTypes:string[]):boolean;
