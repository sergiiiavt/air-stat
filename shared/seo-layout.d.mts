export const SITE_ORIGIN: string;
export const SITE_NAME: string;
export const REPOSITORY_URL: string;
export const OG_IMAGE: { path: string; width: number; height: number };
export const KYIV_TIME_ZONE: string;
export const LANGS: Array<'uk' | 'en'>;
export type Lang = 'uk' | 'en';
export interface Breadcrumb { name: string; path: string }
export interface SeoDocument {
  lang: Lang; path: string; alternates?: Partial<Record<Lang, string>>; title: string; description: string;
  h1?: string; ogType?: string; breadcrumbs?: Breadcrumb[]; main: string; jsonLd?: object[];
  robots?: string; dateModified?: string; about?: object; schemaType?: string; noCanonical?: boolean;
}
export function chrome(lang: Lang): Record<string, unknown>;
export function esc(value: unknown): string;
export function absoluteUrl(path: string): string;
export function jsonLdScript(data: unknown): string;
export function breadcrumbJsonLd(items: Breadcrumb[]): object;
export function renderDocument(page: SeoDocument): string;
export function monthName(month: string, lang: Lang, form?: 'nominative' | 'locative' | 'genitive'): string;
export function capitalize(value: string): string;
export function monthLabel(month: string, lang: Lang): string;
export function inMonth(month: string, lang: Lang): string;
export function formatDate(date: string, lang: Lang, options?: { year?: boolean }): string;
export function kyivTime(iso: string): string;
export function kyivDateOf(iso: string): string;
export function formatDateTime(iso: string, lang: Lang): string;
export function formatNumber(value: number, lang: Lang): string;
export function formatPercent(ratio: number, lang: Lang): string;
export function formatDuration(seconds: number, lang: Lang): string;
export function pluralUk(n: number, one: string, few: string, many: string): string;
export function alertsPhrase(n: number, lang: Lang): string;
export function daysPhrase(n: number, lang: Lang): string;
export function barChartSvg(options: {
  values: number[]; labels: string[]; ticks?: string[]; title: string;
  valueLabel: (value: number) => string; highlightLast?: boolean; tickEvery?: number;
}): string;
