export interface TelegramFeedPost {
  channel: string;
  number: number;
  time: string;
  text: string;
  url: string;
}

export declare function decodeTelegramHtml(html: string): string;
export declare function parseTelegramFeed(html: string): TelegramFeedPost[];
export declare function oldestTelegramPostNumber(posts: TelegramFeedPost[]): number | null;
