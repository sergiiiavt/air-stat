export type CampaignHealth = 'complete' | 'active' | 'stalled' | 'no-submissions';

export interface CampaignHealthState {
  createdAt: string;
  lastAcceptedAt: string | null;
  staleAfterHours: number;
  days: Array<{ status: string; rejections?: number }>;
}

export declare function submissionsSeen(state: CampaignHealthState): boolean;
export declare function hoursSinceProgress(state: CampaignHealthState, nowMs?: number): number | null;
export declare function campaignHealth(state: CampaignHealthState, nowMs?: number): CampaignHealth;
