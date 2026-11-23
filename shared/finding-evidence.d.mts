export interface EvidenceCandidate {
  discoveryOnly?: boolean;
}

export declare function isHeadlineOnlyFinding(
  finding: { sourceIndexes: number[] },
  candidates: EvidenceCandidate[],
): boolean;

export declare function applyHeadlineOnlyPolicy<T extends { sourceIndexes: number[] }>(
  finding: T,
  candidates: EvidenceCandidate[],
): T;

export declare const DROPPABLE_FINDING_REASONS: Set<string>;
export declare function summarizeInvalidFindings(reasons: string[]): string;
