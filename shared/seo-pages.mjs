// Crawlable alert-statistics archive: /stats/<scope>[/<year>[-<month>]] and
// the same under /en/. Pages are rendered by the Worker from D1 alert
// intervals (see shared/seo-stats.mjs) and cached at the edge.
import { ALERT_COVERAGE } from './alert-coverage.mjs';
import { daysInMonth, monthKeysBetween } from './seo-stats.mjs';
import {
  absoluteUrl, alertsPhrase, barChartSvg, capitalize, daysPhrase, esc, formatDate,
  formatDateTime, formatDuration, formatNumber, formatPercent, inMonth, kyivDateOf, kyivTime,
  monthLabel, monthName, renderDocument, SITE_NAME,
} from './seo-layout.mjs';

export const STATS_SCOPES = {
  kyiv: {
    scope: 'kyiv-city',
    uk: { name: 'Київ', where: 'в Києві', of: 'Києва', place: 'Київ, Україна', howMany: 'Скільки було повітряних тривог у Києві' },
    en: { name: 'Kyiv', where: 'in Kyiv', of: 'Kyiv', place: 'Kyiv, Ukraine', howMany: 'How many air raid alerts has Kyiv had?' },
  },
  'kyiv-oblast': {
    scope: 'kyiv-oblast',
    uk: { name: 'Київська область', where: 'у Київській області', of: 'Київської області', place: 'Київська область, Україна', howMany: 'Скільки було повітряних тривог у Київській області' },
    en: { name: 'Kyiv Oblast', where: 'in Kyiv Oblast', of: 'Kyiv Oblast', place: 'Kyiv Oblast, Ukraine', howMany: 'How many air raid alerts has Kyiv Oblast had?' },
  },
};

const SOURCE_NAMES = {
  kyiv_open_data: { uk: 'відкриті дані «Київ Цифровий»', en: 'Kyiv Digital open data' },
  alerts_in_ua: { uk: 'alerts.in.ua', en: 'alerts.in.ua' },
  air_raid_sirens_dataset: {
    uk: 'національний канал повітряних тривог (через відкритий набір ukrainian-air-raid-sirens-dataset)',
    en: 'the national air-alert channel (via the open ukrainian-air-raid-sirens-dataset)',
  },
  kova_telegram: { uk: 'Telegram-канал Київської обласної військової адміністрації', en: 'the Kyiv Oblast Military Administration Telegram channel' },
};

export function coverageFor(scope) {
  return ALERT_COVERAGE.find((entry) => entry.scope === scope);
}

export function coverageStartFor(slug) {
  return coverageFor(STATS_SCOPES[slug].scope).from;
}

export function statsPath(lang, slug, period = null) {
  return `${lang === 'en' ? '/en' : ''}/stats/${slug}${period ? `/${period}` : ''}`;
}

export function alternatesFor(slug, period = null) {
  return { uk: statsPath('uk', slug, period), en: statsPath('en', slug, period) };
}

function dashboardLink(slug, from, to, lang) {
  const params = new URLSearchParams();
  if (slug === 'kyiv') params.set('view', 'daily');
  else { params.set('view', 'map'); params.set('scope', 'kyiv-oblast'); }
  params.set('from', from);
  params.set('to', to);
  if (lang === 'en') params.set('lang', 'en');
  return `/?${params.toString()}`;
}

/**
 * Parses an archive URL path. Returns null when the path is not an archive
 * route, { redirect } for normalisable variants and { lang, slug, kind, period }.
 */
export function parseStatsPath(pathname) {
  const match = /^(\/en)?\/stats(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const lang = match[1] ? 'en' : 'uk';
  const rest = match[2] ?? '';
  if (rest === '' || rest === '/') return { redirect: statsPath(lang, 'kyiv') };
  if (rest.endsWith('/')) return { redirect: `${match[1] ?? ''}/stats${rest.replace(/\/+$/, '')}` };
  const parts = rest.slice(1).split('/');
  const slug = parts[0];
  if (!Object.hasOwn(STATS_SCOPES, slug) || parts.length > 2) return { notFound: true, lang };
  if (parts.length === 1) return { lang, slug, kind: 'hub', period: null };
  const period = parts[1];
  if (/^\d{4}$/.test(period)) return { lang, slug, kind: 'year', period };
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return { lang, slug, kind: 'month', period };
  return { notFound: true, lang };
}

/** Is the archive period inside alert-timing coverage and not in the future? */
export function periodExists(route, today) {
  const from = coverageStartFor(route.slug);
  if (route.kind === 'hub') return true;
  if (route.kind === 'year') return route.period >= from.slice(0, 4) && route.period <= today.slice(0, 4);
  return route.period >= from.slice(0, 7) && route.period <= today.slice(0, 7);
}

function shiftMonth(month, amount) {
  let [y, m] = month.split('-').map(Number);
  m += amount;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Calendar range to compute for a page (includes comparison periods). */
export function computeRangeFor(route, today) {
  const coverage = coverageStartFor(route.slug);
  const clamp = (from, until) => ({
    from: from < coverage ? coverage : from,
    until: until > today ? today : until,
  });
  if (route.kind === 'month') {
    const first = `${shiftMonth(route.period, -12)}-01`;
    const last = `${route.period}-${String(daysInMonth(route.period)).padStart(2, '0')}`;
    return clamp(first, last);
  }
  if (route.kind === 'year') {
    return clamp(`${Number(route.period) - 1}-01-01`, `${route.period}-12-31`);
  }
  return clamp(coverage, today);
}

function scopeNames(slug, lang) {
  return STATS_SCOPES[slug][lang];
}

function otherSlug(slug) {
  return slug === 'kyiv' ? 'kyiv-oblast' : 'kyiv';
}

function sourcesSentence(slug, lang) {
  const coverage = coverageFor(STATS_SCOPES[slug].scope);
  const parts = coverage.sources.map((source) => {
    const name = SOURCE_NAMES[source.key]?.[lang] ?? source.label;
    const from = formatDate(source.from, lang);
    if (lang === 'en') return `${name} (from ${from}${source.to ? ` to ${formatDate(source.to, lang)}` : ''})`;
    return `${name} (з ${from}${source.to ? ` по ${formatDate(source.to, lang)}` : ''})`;
  });
  return parts.join(lang === 'en' ? '; ' : '; ');
}

function methodNote(slug, lang) {
  const names = scopeNames(slug, lang);
  if (lang === 'en') {
    return `<section class="note"><h2>How these numbers are calculated</h2>
<p><strong>Alert count</strong> is the number of alert intervals that started on a Kyiv calendar day; overlapping reports of the same alert are counted once. <strong>Alert time</strong> is the union of all intervals, split at midnight Kyiv time, so an overnight alert counts towards both days. The same method is used by the <a href="/?lang=en">interactive dashboard</a>.</p>
${slug === 'kyiv-oblast'
  ? '<p>For Kyiv Oblast, oblast-wide, district and community alerts are merged: alert time is the time when an alert was active in at least part of the oblast. Kyiv City is not included.</p>'
  : '<p>Kyiv City alerts are city-wide; district-level differences are not part of these figures.</p>'}
<p>Sources for ${esc(names.of)}: ${esc(sourcesSentence(slug, lang))}. Records start on ${esc(formatDate(coverageStartFor(slug), lang))}. A day without a stored interval is not proof that no alert happened. Read the <a href="/en/methodology">methodology</a>.</p></section>`;
  }
  return `<section class="note"><h2>Як рахуються ці числа</h2>
<p><strong>Кількість</strong> — це інтервали тривоги, що почалися в календарний день за київським часом; повідомлення про ту саму тривогу, які перекриваються, рахуються один раз. <strong>Тривалість</strong> — об’єднання всіх інтервалів, поділене по опівночі за Києвом: нічна тривога враховується в обох днях. Так само рахує <a href="/">інтерактивний дашборд</a>.</p>
${slug === 'kyiv-oblast'
  ? '<p>Для Київської області об’єднуються тривоги для всієї області, районів і громад: тривалість — це час, коли тривога діяла хоча б на частині області. Місто Київ сюди не входить.</p>'
  : '<p>Тривоги в Києві оголошуються для всього міста; відмінності між районами в ці числа не входять.</p>'}
<p>Джерела для ${esc(names.of)}: ${esc(sourcesSentence(slug, lang))}. Архів починається ${esc(formatDate(coverageStartFor(slug), lang))}. Відсутність збереженого інтервалу в певний день не доводить, що тривоги не було. Детальніше — у <a href="/methodology">методології</a>.</p></section>`;
}

function citation(title, path, generatedAt, lang) {
  const url = absoluteUrl(path);
  const stamp = formatDateTime(generatedAt, lang);
  return lang === 'en'
    ? `<section class="cite"><h2>How to cite</h2><p>${SITE_NAME}, “${esc(title)}”, ${esc(url)} (data as of ${esc(stamp)} Kyiv time). The underlying daily figures are available as <a href="/en/open-data">open CSV data</a>.</p></section>`
    : `<section class="cite"><h2>Як цитувати</h2><p>${SITE_NAME}, «${esc(title)}», ${esc(url)} (дані станом на ${esc(stamp)} за Києвом). Щоденні значення доступні як <a href="/open-data">відкриті дані CSV</a>.</p></section>`;
}

function longestText(longest, lang) {
  if (!longest) return lang === 'en' ? 'no recorded alerts' : 'немає зафіксованих тривог';
  const startDate = kyivDateOf(longest.startedAt);
  const endDate = kyivDateOf(longest.endedAt);
  const from = `${kyivTime(longest.startedAt)} ${formatDate(startDate, lang, { year: false })}`;
  const to = longest.ongoing
    ? (lang === 'en' ? 'still active' : 'досі триває')
    : `${kyivTime(longest.endedAt)}${endDate !== startDate ? ` ${formatDate(endDate, lang, { year: false })}` : ''}`;
  return lang === 'en'
    ? `${formatDuration(longest.seconds, lang)} (${from} – ${to})`
    : `${formatDuration(longest.seconds, lang)} (${from} — ${to})`;
}

function metricsHtml(period, lang) {
  const avg = period.alertCount ? period.alertSeconds / period.alertCount : 0;
  const rows = lang === 'en'
    ? [
        ['Air raid alerts', formatNumber(period.alertCount, lang)],
        ['Total alert time', formatDuration(period.alertSeconds, lang)],
        ['Share of time under alert', formatPercent(period.observedSeconds ? period.alertSeconds / period.observedSeconds : 0, lang)],
        ['Average alert length', period.alertCount ? formatDuration(avg, lang) : '—'],
        ['Days with alerts', `${formatNumber(period.daysWithAlerts, lang)} of ${formatNumber(period.observedDays, lang)}`],
        ['Longest continuous alert', longestText(period.longest, lang)],
        ['Most alerts in one day', period.maxCountDay ? `${formatNumber(period.maxCountDay.alertCount, lang)} (${formatDate(period.maxCountDay.date, lang)})` : '—'],
        ['Most alert time in one day', period.maxSecondsDay ? `${formatDuration(period.maxSecondsDay.alertSeconds, lang)} (${formatDate(period.maxSecondsDay.date, lang)})` : '—'],
      ]
    : [
        ['Повітряних тривог', formatNumber(period.alertCount, lang)],
        ['Загальна тривалість', formatDuration(period.alertSeconds, lang)],
        ['Частка часу під тривогою', formatPercent(period.observedSeconds ? period.alertSeconds / period.observedSeconds : 0, lang)],
        ['Середня тривалість тривоги', period.alertCount ? formatDuration(avg, lang) : '—'],
        ['Днів із тривогами', `${formatNumber(period.daysWithAlerts, lang)} з ${formatNumber(period.observedDays, lang)}`],
        ['Найдовша безперервна тривога', longestText(period.longest, lang)],
        ['Найбільше тривог за добу', period.maxCountDay ? `${formatNumber(period.maxCountDay.alertCount, lang)} (${formatDate(period.maxCountDay.date, lang)})` : '—'],
        ['Найдовший час тривог за добу', period.maxSecondsDay ? `${formatDuration(period.maxSecondsDay.alertSeconds, lang)} (${formatDate(period.maxSecondsDay.date, lang)})` : '—'],
      ];
  return `<dl class="metrics">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function hourChart(period, lang) {
  const values = period.hourSeconds.map((seconds) => seconds / 3600);
  const labels = values.map((_, hour) => `${String(hour).padStart(2, '0')}:00–${String(hour).padStart(2, '0')}:59`);
  const ticks = values.map((_, hour) => (hour % 3 === 0 ? String(hour).padStart(2, '0') : ''));
  const title = lang === 'en'
    ? 'Alert time by hour of day (hours, Kyiv time)'
    : 'Час тривог за годинами доби (години, київський час)';
  const peak = values.indexOf(Math.max(...values));
  const quiet = values.indexOf(Math.min(...values));
  const sentence = period.alertSeconds > 0
    ? (lang === 'en'
        ? `<p>Alerts were most often active between ${String(peak).padStart(2, '0')}:00 and ${String(peak + 1).padStart(2, '0')}:00 and least often between ${String(quiet).padStart(2, '0')}:00 and ${String(quiet + 1).padStart(2, '0')}:00.</p>`
        : `<p>Найчастіше тривога тривала між ${String(peak).padStart(2, '0')}:00 і ${String(peak + 1).padStart(2, '0')}:00, найрідше — між ${String(quiet).padStart(2, '0')}:00 і ${String(quiet + 1).padStart(2, '0')}:00.</p>`)
    : '';
  return `<h2>${lang === 'en' ? 'Time of day' : 'Пора доби'}</h2>${sentence}${barChartSvg({
    values, labels, ticks, title, valueLabel: (v) => formatDuration(v * 3600, lang),
  })}`;
}

function changeText(current, previous, lang) {
  if (!previous) return '—';
  const diff = current - previous;
  if (previous === 0) return diff === 0 ? '0' : '—';
  const ratio = diff / previous;
  const sign = ratio > 0 ? '+' : ratio < 0 ? '−' : '';
  return `${sign}${formatPercent(Math.abs(ratio), lang)}`;
}

function periodRowHtml(label, href, period, lang) {
  const share = period.observedSeconds ? period.alertSeconds / period.observedSeconds : 0;
  const name = href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label);
  return `<tr><th scope="row">${name}</th><td>${formatNumber(period.alertCount, lang)}</td><td>${esc(formatDuration(period.alertSeconds, lang))}</td><td>${esc(formatPercent(share, lang))}</td></tr>`;
}

function periodTable(rows, lang, caption) {
  const head = lang === 'en'
    ? '<tr><th scope="col">Period</th><th scope="col">Alerts</th><th scope="col">Alert time</th><th scope="col">Share of time</th></tr>'
    : '<tr><th scope="col">Період</th><th scope="col">Тривог</th><th scope="col">Тривалість</th><th scope="col">Частка часу</th></tr>';
  return `<div class="table-wrap"><table class="data"><caption>${esc(caption)}</caption><thead>${head}</thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function statusLine(history, lang) {
  const stamp = formatDateTime(history.generatedAt, lang);
  return lang === 'en'
    ? `<p class="stamp">Data as of ${esc(stamp)} (Kyiv time). Figures for the current period are updated continuously.</p>`
    : `<p class="stamp">Дані станом на ${esc(stamp)} за київським часом. Значення поточного періоду оновлюються.</p>`;
}

// ---------------------------------------------------------------------------

function renderMonth(route, history) {
  const { lang, slug, period: month } = route;
  const names = scopeNames(slug, lang);
  const data = history.months.find((m) => m.key === month);
  if (!data) return null;
  const totalDays = daysInMonth(month);
  const isCurrent = month === history.today.slice(0, 7);
  const coverageStart = coverageStartFor(slug);
  const startsLate = coverageStart.slice(0, 7) === month && coverageStart.slice(8) !== '01';
  const complete = !isCurrent && !startsLate && data.observedDays === totalDays;
  const share = data.observedSeconds ? data.alertSeconds / data.observedSeconds : 0;
  const path = statsPath(lang, slug, month);

  const h1 = lang === 'en'
    ? `Air raid alerts ${names.where} ${inMonth(month, 'en')}`
    : `Повітряні тривоги ${names.where} ${inMonth(month, 'uk')}`;
  const title = lang === 'en'
    ? `${h1}: count and duration | ${SITE_NAME}`
    : `${h1}: кількість і тривалість | ${SITE_NAME}`;

  const periodPhrase = (() => {
    if (lang === 'en') {
      if (isCurrent) return `From 1 to ${formatDate(history.today, 'en', { year: false })} ${month.slice(0, 4)}`;
      if (startsLate) return `From ${formatDate(coverageStart, 'en')} (start of the archive) to the end of ${monthName(month, 'en')}`;
      return capitalize(inMonth(month, 'en'));
    }
    if (isCurrent) return `З 1 по ${formatDate(history.today, 'uk', { year: false })} ${month.slice(0, 4)} року`;
    if (startsLate) return `З ${formatDate(coverageStart, 'uk')} (початок архіву) до кінця ${monthName(month, 'uk', 'genitive')}`;
    return capitalize(inMonth(month, 'uk'));
  })();

  const lead = lang === 'en'
    ? `${periodPhrase}, ${alertsPhrase(data.alertCount, 'en')} were recorded ${names.where}, with a total duration of ${formatDuration(data.alertSeconds, 'en')} — ${formatPercent(share, 'en')} of the time. Alerts sounded on ${data.daysWithAlerts} of ${daysPhrase(data.observedDays, 'en')}.`
    : `${periodPhrase} ${names.where} зафіксовано ${alertsPhrase(data.alertCount, 'uk')} загальною тривалістю ${formatDuration(data.alertSeconds, 'uk')} — ${formatPercent(share, 'uk')} часу. Днів із тривогами: ${data.daysWithAlerts} з ${data.observedDays}.`;

  const description = lang === 'en'
    ? `${lead} Longest alert: ${formatDuration(data.longest?.seconds ?? 0, 'en')}. Daily table, time-of-day chart and comparison with earlier months.`
    : `${lead} Найдовша тривога — ${formatDuration(data.longest?.seconds ?? 0, 'uk')}. Таблиця по днях, графік за годинами доби та порівняння з іншими місяцями.`;

  // Comparisons with complete months only.
  const fullMonth = (key) => {
    const m = history.months.find((x) => x.key === key);
    return m && m.observedDays === daysInMonth(key) && key !== history.today.slice(0, 7) ? m : null;
  };
  const prevKey = shiftMonth(month, -1);
  const yearAgoKey = shiftMonth(month, -12);
  const prev = fullMonth(prevKey);
  const yearAgo = fullMonth(yearAgoKey);
  let comparison = '';
  if (prev || yearAgo) {
    const rows = [periodRowHtml(capitalize(monthLabel(month, lang)), null, data, lang)];
    if (prev) rows.push(periodRowHtml(capitalize(monthLabel(prevKey, lang)), statsPath(lang, slug, prevKey), prev, lang));
    if (yearAgo) rows.push(periodRowHtml(capitalize(monthLabel(yearAgoKey, lang)), statsPath(lang, slug, yearAgoKey), yearAgo, lang));
    const sentence = complete && prev
      ? (lang === 'en'
          ? `<p>Compared with ${monthName(prevKey, 'en')}: alerts ${changeText(data.alertCount, prev.alertCount, 'en')}, alert time ${changeText(data.alertSeconds, prev.alertSeconds, 'en')}.${yearAgo ? ` Compared with ${monthLabel(yearAgoKey, 'en')}: alerts ${changeText(data.alertCount, yearAgo.alertCount, 'en')}, alert time ${changeText(data.alertSeconds, yearAgo.alertSeconds, 'en')}.` : ''}</p>`
          : `<p>Порівняно з попереднім місяцем: кількість ${changeText(data.alertCount, prev.alertCount, 'uk')}, тривалість ${changeText(data.alertSeconds, prev.alertSeconds, 'uk')}.${yearAgo ? ` Порівняно з тим самим місяцем торік: кількість ${changeText(data.alertCount, yearAgo.alertCount, 'uk')}, тривалість ${changeText(data.alertSeconds, yearAgo.alertSeconds, 'uk')}.` : ''}</p>`)
      : (isCurrent
          ? (lang === 'en' ? '<p>The current month is still in progress, so totals are not directly comparable yet.</p>' : '<p>Поточний місяць ще триває, тож підсумки поки що не порівнювані напряму.</p>')
          : '');
    comparison = `<h2>${lang === 'en' ? 'Comparison' : 'Порівняння'}</h2>${sentence}${periodTable(rows, lang, lang === 'en' ? 'Comparison with other months' : 'Порівняння з іншими місяцями')}`;
  }

  // Daily chart and table for every calendar day of the month.
  const days = [];
  for (let d = 1; d <= totalDays; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const stored = history.days.find((x) => x.date === date);
    days.push({ date, stored, before: date < coverageStart, future: date > history.today });
  }
  const chartDays = days.filter((d) => !d.future);
  const chart = barChartSvg({
    values: chartDays.map((d) => (d.stored ? d.stored.alertSeconds / 3600 : 0)),
    labels: chartDays.map((d) => formatDate(d.date, lang, { year: false })),
    ticks: chartDays.map((d) => String(Number(d.date.slice(8)))),
    title: lang === 'en' ? `Alert time per day ${inMonth(month, 'en')} (hours)` : `Тривалість тривог по днях ${inMonth(month, 'uk')} (години)`,
    valueLabel: (v) => formatDuration(v * 3600, lang),
    highlightLast: isCurrent,
  });
  const dayRows = days.map((d) => {
    const label = formatDate(d.date, lang, { year: false });
    if (d.before) return `<tr><th scope="row">${esc(label)}</th><td colspan="2" class="muted">${lang === 'en' ? 'before the archive starts' : 'до початку архіву'}</td></tr>`;
    if (d.future) return '';
    const s = d.stored ?? { alertCount: 0, alertSeconds: 0 };
    const link = dashboardLink(slug, d.date, d.date, lang);
    return `<tr><th scope="row"><a href="${esc(link)}" rel="nofollow">${esc(label)}</a></th><td>${formatNumber(s.alertCount, lang)}</td><td>${esc(s.alertSeconds ? formatDuration(s.alertSeconds, lang) : '—')}</td></tr>`;
  }).join('');
  const dayTable = `<div class="table-wrap"><table class="data"><caption>${esc(lang === 'en' ? `Air raid alerts ${names.where} by day, ${monthLabel(month, 'en')}` : `Повітряні тривоги ${names.where} по днях, ${monthLabel(month, 'uk')}`)}</caption><thead><tr><th scope="col">${lang === 'en' ? 'Date' : 'Дата'}</th><th scope="col">${lang === 'en' ? 'Alerts' : 'Тривог'}</th><th scope="col">${lang === 'en' ? 'Alert time' : 'Тривалість'}</th></tr></thead><tbody>${dayRows}</tbody></table></div>`;

  const prevExists = prevKey >= coverageStart.slice(0, 7);
  const nextKey = shiftMonth(month, 1);
  const nextExists = nextKey <= history.today.slice(0, 7);
  const pager = `<nav class="pager" aria-label="${lang === 'en' ? 'Other months' : 'Інші місяці'}">${prevExists ? `<a rel="prev" href="${esc(statsPath(lang, slug, prevKey))}">← ${esc(capitalize(monthLabel(prevKey, lang)))}</a>` : '<span></span>'}<a href="${esc(statsPath(lang, slug, month.slice(0, 4)))}">${lang === 'en' ? `All of ${month.slice(0, 4)}` : `Увесь ${month.slice(0, 4)} рік`}</a>${nextExists ? `<a rel="next" href="${esc(statsPath(lang, slug, nextKey))}">${esc(capitalize(monthLabel(nextKey, lang)))} →</a>` : '<span></span>'}</nav>`;

  const lastDay = isCurrent ? history.today : `${month}-${String(totalDays).padStart(2, '0')}`;
  const firstDay = startsLate ? coverageStart : `${month}-01`;
  const cta = `<a class="cta" rel="nofollow" href="${esc(dashboardLink(slug, firstDay, lastDay, lang))}">${lang === 'en' ? `Open ${monthLabel(month, 'en')} in the dashboard` : `Відкрити ${monthLabel(month, 'uk')} у дашборді`}</a>`;
  const other = otherSlug(slug);
  const otherLink = month >= coverageStartFor(other).slice(0, 7)
    ? `<p>${lang === 'en' ? 'See also' : 'Див. також'}: <a href="${esc(statsPath(lang, other, month))}">${esc(lang === 'en' ? `${h1.replace(names.where, scopeNames(other, 'en').where)}` : `${h1.replace(names.where, scopeNames(other, 'uk').where)}`)}</a>.</p>`
    : '';

  const main = `<h1>${esc(h1)}</h1>
<p class="lead">${esc(lead)}</p>
${statusLine(history, lang)}
${metricsHtml(data, lang)}
${cta}
<h2>${lang === 'en' ? 'Day by day' : 'По днях'}</h2>
${chart}
${dayTable}
${comparison}
${hourChart(data, lang)}
${pager}
${otherLink}
${methodNote(slug, lang)}
${citation(h1, path, history.generatedAt, lang)}`;

  return {
    title,
    h1,
    description,
    path,
    main,
    complete,
    breadcrumbs: [
      { name: lang === 'en' ? 'Home' : 'Головна', path: lang === 'en' ? '/en/' : '/' },
      { name: lang === 'en' ? `Alert statistics: ${names.name}` : `Статистика тривог: ${names.name}`, path: statsPath(lang, slug) },
      { name: month.slice(0, 4), path: statsPath(lang, slug, month.slice(0, 4)) },
      { name: capitalize(monthName(month, lang)), path },
    ],
  };
}

function renderYear(route, history) {
  const { lang, slug, period: year } = route;
  const names = scopeNames(slug, lang);
  const data = history.years.find((y) => y.key === year);
  if (!data) return null;
  const isCurrent = year === history.today.slice(0, 4);
  const coverageStart = coverageStartFor(slug);
  const startsLate = coverageStart.slice(0, 4) === year;
  const share = data.observedSeconds ? data.alertSeconds / data.observedSeconds : 0;
  const path = statsPath(lang, slug, year);
  const h1 = lang === 'en'
    ? `Air raid alerts ${names.where} in ${year}`
    : `Повітряні тривоги ${names.where} у ${year} році`;
  const title = lang === 'en'
    ? `${h1}: statistics by month | ${SITE_NAME}`
    : `${h1}: статистика по місяцях | ${SITE_NAME}`;
  const span = (() => {
    if (lang === 'en') {
      if (isCurrent) return `From 1 January to ${formatDate(history.today, 'en')}`;
      if (startsLate) return `From ${formatDate(coverageStart, 'en')} (start of the archive) to 31 December ${year}`;
      return `In ${year}`;
    }
    if (isCurrent) return `З 1 січня по ${formatDate(history.today, 'uk')}`;
    if (startsLate) return `З ${formatDate(coverageStart, 'uk')} (початок архіву) до 31 грудня ${year} року`;
    return `У ${year} році`;
  })();
  const lead = lang === 'en'
    ? `${span}, ${alertsPhrase(data.alertCount, 'en')} were recorded ${names.where}, with a total duration of ${formatDuration(data.alertSeconds, 'en')} — ${formatPercent(share, 'en')} of the time.`
    : `${span} ${names.where} зафіксовано ${alertsPhrase(data.alertCount, 'uk')} загальною тривалістю ${formatDuration(data.alertSeconds, 'uk')} — ${formatPercent(share, 'uk')} часу.`;

  const months = history.months.filter((m) => m.key.startsWith(`${year}-`));
  const busiest = months.reduce((best, m) => (!best || m.alertSeconds > best.alertSeconds ? m : best), null);
  const busiestSentence = busiest && busiest.alertSeconds > 0
    ? (lang === 'en'
        ? ` The month with the most alert time was ${monthName(busiest.key, 'en')} (${formatDuration(busiest.alertSeconds, 'en')}).`
        : ` Найбільше часу під тривогою — ${inMonth(busiest.key, 'uk').replace(/ \d{4} року$/, '')} (${formatDuration(busiest.alertSeconds, 'uk')}).`)
    : '';
  const description = `${lead}${busiestSentence} ${lang === 'en' ? 'Monthly table, records and time-of-day chart.' : 'Таблиця по місяцях, рекорди та розподіл за годинами доби.'}`;

  const chart = barChartSvg({
    values: months.map((m) => m.alertSeconds / 3600),
    labels: months.map((m) => capitalize(monthLabel(m.key, lang))),
    ticks: months.map((m) => monthName(m.key, lang).slice(0, 3)),
    title: lang === 'en' ? `Alert time per month ${names.where}, ${year} (hours)` : `Тривалість тривог по місяцях ${names.where}, ${year} (години)`,
    valueLabel: (v) => formatDuration(v * 3600, lang),
    highlightLast: isCurrent,
  });
  const table = periodTable(
    months.map((m) => periodRowHtml(capitalize(monthName(m.key, lang)), statsPath(lang, slug, m.key), m, lang)),
    lang,
    lang === 'en' ? `Air raid alerts ${names.where} by month, ${year}` : `Повітряні тривоги ${names.where} по місяцях, ${year}`,
  );

  const prevYear = String(Number(year) - 1);
  const prev = history.years.find((y) => y.key === prevYear);
  const comparable = prev && !isCurrent && !startsLate && prevYear >= coverageStart.slice(0, 4) && prevYear !== coverageStart.slice(0, 4);
  const comparison = comparable
    ? (lang === 'en'
        ? `<p>Compared with ${prevYear}: alerts ${changeText(data.alertCount, prev.alertCount, 'en')}, alert time ${changeText(data.alertSeconds, prev.alertSeconds, 'en')}.</p>`
        : `<p>Порівняно з ${prevYear} роком: кількість ${changeText(data.alertCount, prev.alertCount, 'uk')}, тривалість ${changeText(data.alertSeconds, prev.alertSeconds, 'uk')}.</p>`)
    : '';

  const firstYear = coverageStart.slice(0, 4);
  const pager = `<nav class="pager" aria-label="${lang === 'en' ? 'Other years' : 'Інші роки'}">${year > firstYear ? `<a rel="prev" href="${esc(statsPath(lang, slug, prevYear))}">← ${prevYear}</a>` : '<span></span>'}<a href="${esc(statsPath(lang, slug))}">${lang === 'en' ? 'All years' : 'Усі роки'}</a>${year < history.today.slice(0, 4) ? `<a rel="next" href="${esc(statsPath(lang, slug, String(Number(year) + 1)))}">${Number(year) + 1} →</a>` : '<span></span>'}</nav>`;

  const first = startsLate ? coverageStart : `${year}-01-01`;
  const last = isCurrent ? history.today : `${year}-12-31`;
  const main = `<h1>${esc(h1)}</h1>
<p class="lead">${esc(lead + busiestSentence)}</p>
${statusLine(history, lang)}
${metricsHtml(data, lang)}
${comparison}
<a class="cta" rel="nofollow" href="${esc(dashboardLink(slug, first, last, lang))}">${lang === 'en' ? `Open ${year} in the dashboard` : `Відкрити ${year} рік у дашборді`}</a>
<h2>${lang === 'en' ? 'Month by month' : 'По місяцях'}</h2>
${chart}
${table}
${hourChart(data, lang)}
${pager}
${methodNote(slug, lang)}
${citation(h1, path, history.generatedAt, lang)}`;

  return {
    title, h1, description, path, main, complete: !isCurrent,
    breadcrumbs: [
      { name: lang === 'en' ? 'Home' : 'Головна', path: lang === 'en' ? '/en/' : '/' },
      { name: lang === 'en' ? `Alert statistics: ${names.name}` : `Статистика тривог: ${names.name}`, path: statsPath(lang, slug) },
      { name: year, path },
    ],
  };
}

function renderHub(route, history) {
  const { lang, slug } = route;
  const names = scopeNames(slug, lang);
  const data = history.total;
  const coverageStart = coverageStartFor(slug);
  const path = statsPath(lang, slug);
  const h1 = lang === 'en'
    ? `Air raid alerts ${names.where}: statistics since ${coverageStart.slice(0, 4)}`
    : `Повітряні тривоги ${names.where}: статистика з ${coverageStart.slice(0, 4)} року`;
  const title = lang === 'en'
    ? `${names.howMany} Statistics by year and month | ${SITE_NAME}`
    : `${names.howMany}: статистика по роках і місяцях | ${SITE_NAME}`;
  const totalDays = data.alertSeconds / 86400;
  const lead = lang === 'en'
    ? `Since ${formatDate(coverageStart, 'en')}, ${alertsPhrase(data.alertCount, 'en')} have been recorded ${names.where}, with a total duration of ${formatDuration(data.alertSeconds, 'en')} (about ${formatNumber(Math.round(totalDays), 'en')} full days) — ${formatPercent(data.observedSeconds ? data.alertSeconds / data.observedSeconds : 0, 'en')} of all time.`
    : `З ${formatDate(coverageStart, 'uk')} ${names.where} зафіксовано ${alertsPhrase(data.alertCount, 'uk')} загальною тривалістю ${formatDuration(data.alertSeconds, 'uk')} (близько ${formatNumber(Math.round(totalDays), 'uk')} повних діб) — ${formatPercent(data.observedSeconds ? data.alertSeconds / data.observedSeconds : 0, 'uk')} усього часу.`;
  const description = `${lead} ${lang === 'en' ? 'Yearly and monthly tables, records and open data.' : 'Таблиці по роках і місяцях, рекорди та відкриті дані.'}`;

  const busiestMonth = history.months.reduce((best, m) => (!best || m.alertSeconds > best.alertSeconds ? m : best), null);
  const records = lang === 'en'
    ? [
        ['Longest continuous alert', `${longestText(data.longest, 'en')}${data.longest ? `, ${kyivDateOf(data.longest.startedAt).slice(0, 4)}` : ''}`],
        ['Most alerts in one day', data.maxCountDay ? `${formatNumber(data.maxCountDay.alertCount, 'en')} (${formatDate(data.maxCountDay.date, 'en')})` : '—'],
        ['Most alert time in one day', data.maxSecondsDay ? `${formatDuration(data.maxSecondsDay.alertSeconds, 'en')} (${formatDate(data.maxSecondsDay.date, 'en')})` : '—'],
        ['Month with the most alert time', busiestMonth ? `${capitalize(monthLabel(busiestMonth.key, 'en'))} (${formatDuration(busiestMonth.alertSeconds, 'en')})` : '—'],
      ]
    : [
        ['Найдовша безперервна тривога', `${longestText(data.longest, 'uk')}${data.longest ? `, ${kyivDateOf(data.longest.startedAt).slice(0, 4)}` : ''}`],
        ['Найбільше тривог за добу', data.maxCountDay ? `${formatNumber(data.maxCountDay.alertCount, 'uk')} (${formatDate(data.maxCountDay.date, 'uk')})` : '—'],
        ['Найдовший час тривог за добу', data.maxSecondsDay ? `${formatDuration(data.maxSecondsDay.alertSeconds, 'uk')} (${formatDate(data.maxSecondsDay.date, 'uk')})` : '—'],
        ['Місяць із найбільшим часом тривог', busiestMonth ? `${capitalize(monthLabel(busiestMonth.key, 'uk'))} (${formatDuration(busiestMonth.alertSeconds, 'uk')})` : '—'],
      ];
  const recordsHtml = `<dl class="metrics">${records.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

  const yearTable = periodTable(
    history.years.map((y) => periodRowHtml(y.key, statsPath(lang, slug, y.key), y, lang)),
    lang,
    lang === 'en' ? `Air raid alerts ${names.where} by year` : `Повітряні тривоги ${names.where} по роках`,
  );
  const chart = barChartSvg({
    values: history.months.map((m) => m.alertSeconds / 3600),
    labels: history.months.map((m) => capitalize(monthLabel(m.key, lang))),
    ticks: history.months.map((m) => (m.key.endsWith('-01') ? m.key.slice(0, 4) : '')),
    title: lang === 'en' ? `Alert time per month ${names.where} (hours)` : `Тривалість тривог по місяцях ${names.where} (години)`,
    valueLabel: (v) => formatDuration(v * 3600, lang),
    highlightLast: true,
  });
  const monthTable = periodTable(
    [...history.months].reverse().map((m) => periodRowHtml(capitalize(monthLabel(m.key, lang)), statsPath(lang, slug, m.key), m, lang)),
    lang,
    lang === 'en' ? `Air raid alerts ${names.where} by month` : `Повітряні тривоги ${names.where} по місяцях`,
  );
  const other = otherSlug(slug);
  const main = `<h1>${esc(h1)}</h1>
<p class="lead">${esc(lead)}</p>
${statusLine(history, lang)}
${metricsHtml(data, lang)}
<h2>${lang === 'en' ? 'Records' : 'Рекорди'}</h2>
${recordsHtml}
<h2>${lang === 'en' ? 'By year' : 'По роках'}</h2>
${yearTable}
<h2>${lang === 'en' ? 'By month' : 'По місяцях'}</h2>
${chart}
${monthTable}
${hourChart(data, lang)}
<p>${lang === 'en' ? 'See also' : 'Див. також'}: <a href="${esc(statsPath(lang, other))}">${esc(lang === 'en' ? `air raid alert statistics ${scopeNames(other, 'en').where}` : `статистика повітряних тривог ${scopeNames(other, 'uk').where}`)}</a> · <a href="${lang === 'en' ? '/en/open-data' : '/open-data'}">${lang === 'en' ? 'download the data (CSV)' : 'завантажити дані (CSV)'}</a>.</p>
${methodNote(slug, lang)}
${citation(h1, path, history.generatedAt, lang)}`;

  return {
    title, h1, description, path, main, complete: false,
    breadcrumbs: [
      { name: lang === 'en' ? 'Home' : 'Головна', path: lang === 'en' ? '/en/' : '/' },
      { name: lang === 'en' ? `Alert statistics: ${names.name}` : `Статистика тривог: ${names.name}`, path },
    ],
  };
}

/** Full HTML document for an archive route, or null when the period has no data. */
export function renderStatsPage(route, history) {
  const page = route.kind === 'month' ? renderMonth(route, history)
    : route.kind === 'year' ? renderYear(route, history)
      : renderHub(route, history);
  if (!page) return null;
  const names = scopeNames(route.slug, route.lang);
  const html = renderDocument({
    lang: route.lang,
    path: page.path,
    alternates: alternatesFor(route.slug, route.period),
    title: page.title,
    h1: page.h1,
    description: page.description,
    breadcrumbs: page.breadcrumbs,
    main: page.main,
    dateModified: history.generatedAt,
    about: { '@type': 'Place', name: names.place },
  });
  return { html, complete: page.complete };
}

// ---------------------------------------------------------------------------
// URL inventory, sitemap and CSV

/** Every indexable archive URL. lastmods: Map("<scope>:<YYYY-MM>" -> YYYY-MM-DD). */
export function statsInventory(today, lastmods = new Map()) {
  const entries = [];
  for (const slug of Object.keys(STATS_SCOPES)) {
    const scope = STATS_SCOPES[slug].scope;
    const months = monthKeysBetween(coverageStartFor(slug).slice(0, 7), today.slice(0, 7));
    const monthMod = (key) => lastmods.get(`${scope}:${key}`) ?? null;
    const maxOf = (values) => values.filter(Boolean).sort().at(-1) ?? null;
    for (const lang of ['uk', 'en']) {
      entries.push({ path: statsPath(lang, slug), lang, alternates: alternatesFor(slug), lastmod: maxOf(months.map(monthMod)) ?? today });
      const years = [...new Set(months.map((m) => m.slice(0, 4)))];
      for (const year of years) {
        entries.push({
          path: statsPath(lang, slug, year), lang, alternates: alternatesFor(slug, year),
          lastmod: maxOf(months.filter((m) => m.startsWith(year)).map(monthMod)) ?? today,
        });
      }
      for (const month of months) {
        entries.push({ path: statsPath(lang, slug, month), lang, alternates: alternatesFor(slug, month), lastmod: monthMod(month) ?? today });
      }
    }
  }
  return entries;
}

export function renderSitemap(entries) {
  const urls = entries.map((entry) => {
    const alternates = entry.alternates
      ? Object.entries(entry.alternates).map(([lang, path]) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${esc(absoluteUrl(path))}"/>`).join('')
      : '';
    return `<url><loc>${esc(absoluteUrl(entry.path))}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}${alternates}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

export function historyCsv(history) {
  const lines = ['date,alert_count,alert_seconds,alert_hours'];
  for (const day of history.days) {
    lines.push(`${day.date},${day.alertCount},${day.alertSeconds},${(day.alertSeconds / 3600).toFixed(2)}`);
  }
  return `${lines.join('\n')}\n`;
}

