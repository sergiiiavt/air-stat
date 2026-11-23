import type { AlertHistory } from './seo-stats.mjs';
type Lang = 'uk' | 'en';
export type StatsSlug = 'kyiv' | 'kyiv-oblast';
export interface StatsRoute { lang: Lang; slug: StatsSlug; kind: 'hub' | 'year' | 'month'; period: string | null }
export type ParsedStatsPath = StatsRoute | { redirect: string } | { notFound: true; lang: Lang } | null;
export interface InventoryEntry { path: string; lang: Lang; alternates: Record<Lang, string>; lastmod: string }
export const STATS_SCOPES: Record<StatsSlug, { scope: 'kyiv-city' | 'kyiv-oblast'; uk: Record<string, string>; en: Record<string, string> }>;
export function coverageFor(scope: string): { scope: string; from: string; sources: Array<{ key: string; label: string; from: string; to: string | null }> } | undefined;
export function coverageStartFor(slug: StatsSlug): string;
export function statsPath(lang: Lang, slug: StatsSlug, period?: string | null): string;
export function alternatesFor(slug: StatsSlug, period?: string | null): Record<Lang, string>;
export function parseStatsPath(pathname: string): ParsedStatsPath;
export function periodExists(route: StatsRoute, today: string): boolean;
export function computeRangeFor(route: StatsRoute, today: string): { from: string; until: string };
export function renderStatsPage(route: StatsRoute, history: AlertHistory): { html: string; complete: boolean } | null;
export function statsInventory(today: string, lastmods?: Map<string, string>): InventoryEntry[];
export function renderSitemap(entries: Array<{ path: string; lastmod?: string | null; alternates?: Record<string, string> }>): string;
export function historyCsv(history: AlertHistory): string;
