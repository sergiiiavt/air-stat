# SEO, discoverability and traffic measurement

Updated 2026-10-16. Production: https://air-alert-stat.com/.

## Search visibility contract

- Primary HTTPS canonical host: `air-alert-stat.com` (non-www). Actual redirects from www/HTTP require **Cloudflare verification** and may need dashboard rules.
- `/` is the canonical dashboard URL. Shareable query parameters `view`, `days`, `from`, `to`, `scope` are UI state, not indexable pages for every date and scope combination.
- `/kyiv-air-alerts.html`, `/kyiv-oblast-alerts.html`, `/methodology.html` contain standalone, server-served HTML with real explanatory content and links to the relevant dashboard views.
- The SPA index includes source-level descriptive fallback HTML, removed on successful React boot. This is progressive enhancement, not alternative facts shown only to bots.
- `/progress` is operational and excluded from sitemap; the head script marks it `noindex,follow` when loaded. `/api/` is crawl-disallowed; this is not authorization.
- Sitemap contains only real stable URLs with canonical matches, not thousands of empty synthetic daily/region pages. Do not add unverified rating, FAQ or review rich snippets.
- Editorial URLs are Ukrainian. EN is currently a client-side preference, not separately indexable; add reciprocal `hreflang` only if complete English URL content exists.
- No tactical forecasts or exact recent strike, air-defence or critical-infrastructure coordinates.

## Google Search Console — manual ownership required

1. Create and verify a **Domain property** for `air-alert-stat.com` with DNS TXT in the DNS provider (recommended). A repository PR cannot access domain ownership or create DNS verification automatically.
2. Submit `https://air-alert-stat.com/sitemap.xml` at **Indexing → Sitemaps**.
3. Run URL Inspection on home and three editorials; verify status/index eligibility, rendered content, Google-selected canonical and mobile usability. Request indexing if needed.
4. Review `Performance → Search results` weekly: **impressions**, **clicks**, **CTR**, **average position**, and breakdown by query/page/country/device. Search Console **does not count website users**.
5. Verify proper HTTPS and www redirects to canonical host in Cloudflare. Separate site ownership in Bing Webmaster Tools is useful for Bing discovery.

## Web analytics and meaning of “unique visitors”

Recommended: Cloudflare Dashboard → **Web Analytics** → Add/Manage site → `air-alert-stat.com` → enable automatic browser beacon injection (or install its generated per-site snippet). Cloudflare Worker/custom domain deployment alone does not prove this feature is enabled. Test that live browser visits appear and verify real-user Core Web Vitals.

- **Page views:** successful HTML page loads. One person may produce many.
- **Visits:** navigations/referral-based visit events; not distinct people.
- **Cloudflare zone HTTP Traffic Unique Visitors:** approximate visitors based on traffic at Cloudflare edge; this metric may include bots and API clients. Do not present it as an exact count of distinct people.
- **Unique humans:** not measurable exactly without persistent identity/consent; one human may use multiple devices or browsers. Cloudflare privacy-first Web Analytics avoids persistent visitor identifiers or tracking cookies.
- **View changes within the SPA:** using history.replaceState does not imply a new browser page view. Never infer dashboard selections from HTML page view counts.

If persistent cross-session unique-user estimates or conversion funnels are later needed, evaluate GA4 or privacy-preserving alternatives with explicit privacy/consent review. Do not invent an analytics measurement ID/token.

## Weekly operational metrics

| KPI | Source | Why |
|---|---|---|
| Impressions, organic clicks, CTR and average position | Google Search Console | Search discovery and ranking |
| Indexed canonical pages, exclusions, crawl errors | Search Console | Technical indexing health |
| Page views, visits, landing pages, referrals, devices | Cloudflare Web Analytics | Website acquisition and usage |
| Approximate unique visitors | Cloudflare zone HTTP Analytics | Directional reach, with bot caveats |
| LCP / INP / CLS (75th percentile) | Cloudflare Web Analytics RUM / Search Console | Actual perceived performance |

**Current baseline unknown until account-level analytics and Search Console access are confirmed.** No invented visitor numbers or guaranteed rankings.

## Growth after foundation

Use Search Console queries to determine which public questions deserve full, accurate editorial coverage. High-value areas: the difference between alert timing and incident reports, archive coverage by geography, reading 24-hour alert durations, source verification, and a glossary of alert statistics. Create distinct useful pages with citations, not doorway pages for each date/district. Seek relevant links through data documentation/open datasets, not bought backlinks.

## CI and production validation

`npm run test:seo` validates indexable source content, metadata, sitemap and internal links. Production smoke checks the deployed robots/sitemap and HTML content, independent of the API smoke. Full deployment also requires existing CI/Cloudflare dry-run and the production deployment workflow. After **each deploy**, re-check this doc, README, docs/ARCHITECTURE.md, docs/DESIGN.md and operational instructions against actual production. Do not mark deployed until the main workflow deploy + production smoke succeed.
