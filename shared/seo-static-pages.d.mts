import type { SeoDocument } from './seo-layout.mjs';
export const CONTENT_UPDATED: string;
export interface StaticPage extends SeoDocument { file: string; alternates: { uk: string; en: string } }
export const STATIC_PAGES: StaticPage[];
export const NOT_FOUND_PAGE: SeoDocument & { file: string };
