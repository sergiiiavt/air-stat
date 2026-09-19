import { useMemo } from 'react';
import { formatDuration } from '../format';
import { translate, type Language } from '../i18n';
import type { RangeDay } from '../types/domain';

interface Props {
  from: string;
  to: string;
  days: RangeDay[];
  language: Language;
}

interface TrendDay {
  date: string;
  alertCount: number;
  alertSeconds: number;
}

interface Totals {
  alertCount: number;
  alertSeconds: number;
  activeRate: number;
  averageAlertSeconds: number;
}

function dateSequence(from: string, to: string) {
  const dates: string[] = [];
  const cursor = new Date(from + 'T12:00:00Z');
  const end = new Date(to + 'T12:00:00Z');

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function shortDate(date: string, language: Language) {
  return new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'));
}

function rangeLabel(days: TrendDay[], language: Language) {
  if (!days.length) return '—';
  return shortDate(days[0].date, language) + ' — ' + shortDate(days[days.length - 1].date, language);
}

function movingAverage(values: number[], windowSize: number) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const window = values.slice(start, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
}

function movingAlertAverage(days: TrendDay[], windowSize: number) {
  return days.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const window = days.slice(start, index + 1);
    const alerts = window.reduce((sum, day) => sum + day.alertCount, 0);
    const seconds = window.reduce((sum, day) => sum + day.alertSeconds, 0);
    return alerts > 0 ? seconds / alerts : 0;
  });
}

function summarize(days: TrendDay[]): Totals {
  const alertCount = days.reduce((sum, day) => sum + day.alertCount, 0);
  const alertSeconds = days.reduce((sum, day) => sum + day.alertSeconds, 0);
  const activeDays = days.filter((day) => day.alertCount > 0).length;

  return {
    alertCount,
    alertSeconds,
    activeRate: days.length ? (activeDays / days.length) * 100 : 0,
    averageAlertSeconds: alertCount > 0 ? alertSeconds / alertCount : 0,
  };
}

function formatCount(value: number) {
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return value.toFixed(1);
}

function ComparisonCard({
  label,
  previous,
  recent,
  language,
  formatter,
  percentagePoints = false,
}: {
  label: string;
  previous: number;
  recent: number;
  language: Language;
  formatter: (value: number) => string;
  percentagePoints?: boolean;
}) {
  let deltaLabel: string;

  if (percentagePoints) {
    const delta = recent - previous;
    const rounded = Math.abs(delta) < 0.05 ? 0 : delta;
    deltaLabel =
      (rounded > 0 ? '+' : '') +
      rounded.toFixed(Math.abs(rounded) >= 10 ? 0 : 1) +
      ' ' +
      translate(language, 'trendsPercentagePoints');
  } else if (previous === 0 && recent > 0) {
    deltaLabel = translate(language, 'trendsFromZero');
  } else if (previous === 0) {
    deltaLabel = '0%';
  } else {
    const delta = ((recent - previous) / previous) * 100;
    const rounded = Math.abs(delta) < 0.05 ? 0 : delta;
    deltaLabel =
      (rounded > 0 ? '+' : '') +
      rounded.toFixed(Math.abs(rounded) >= 10 ? 0 : 1) +
      '%';
  }

  return (
    <article className="trend-comparison-card">
      <span>{label}</span>
      <strong>{formatter(recent)}</strong>
      <b>{deltaLabel}</b>
      <small>
        {translate(language, 'trendsVsPrevious')}: {formatter(previous)}
      </small>
    </article>
  );
}

function LineChart({
  title,
  days,
  rawValues,
  trendValues,
  smoothingWindow,
  language,
  formatter,
}: {
  title: string;
  days: TrendDay[];
  rawValues: number[];
  trendValues: number[];
  smoothingWindow: number;
  language: Language;
  formatter: (value: number) => string;
}) {
  const width = 680;
  const height = 220;
  const left = 58;
  const right = 18;
  const top = 18;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(1, ...rawValues, ...trendValues);

  const x = (index: number) =>
    left + (days.length <= 1 ? plotWidth / 2 : (index / (days.length - 1)) * plotWidth);
  const y = (value: number) => top + plotHeight - (value / maxValue) * plotHeight;
  const points = (values: number[]) =>
    values.map((value, index) => x(index).toFixed(1) + ',' + y(value).toFixed(1)).join(' ');
  const middleIndex = Math.floor((days.length - 1) / 2);

  return (
    <article className="trend-chart-card">
      <div className="trend-chart-card__heading">
        <div>
          <h3>{title}</h3>
          <p>
            {smoothingWindow > 1
              ? translate(language, 'trendsMovingAverage', { days: smoothingWindow })
              : translate(language, 'trendsDailyValues')}
          </p>
        </div>
        <strong>{formatter(trendValues[trendValues.length - 1] ?? 0)}</strong>
      </div>

      <div className="trend-chart-wrap">
        <svg
          className="trend-chart"
          viewBox={'0 0 ' + width + ' ' + height}
          role="img"
          aria-label={title}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const lineY = top + plotHeight * fraction;
            return (
              <line
                key={fraction}
                className="trend-chart__grid"
                x1={left}
                x2={width - right}
                y1={lineY}
                y2={lineY}
              />
            );
          })}
          <text className="trend-chart__axis-label" x={left - 8} y={top + 4} textAnchor="end">
            {formatter(maxValue)}
          </text>
          <text className="trend-chart__axis-label" x={left - 8} y={top + plotHeight} textAnchor="end">
            0
          </text>

          {smoothingWindow > 1 && (
            <polyline className="trend-chart__raw" points={points(rawValues)} />
          )}
          <polyline className="trend-chart__line" points={points(trendValues)} />

          {days.length <= 31 &&
            rawValues.map((value, index) => (
              <circle
                className="trend-chart__point"
                key={days[index].date}
                cx={x(index)}
                cy={y(value)}
                r={2.5}
              >
                <title>{shortDate(days[index].date, language) + ': ' + formatter(value)}</title>
              </circle>
            ))}
        </svg>

        <div className="trend-chart__dates" aria-hidden="true">
          <span>{days[0] ? shortDate(days[0].date, language) : '—'}</span>
          <span>{days[middleIndex] ? shortDate(days[middleIndex].date, language) : '—'}</span>
          <span>{days[days.length - 1] ? shortDate(days[days.length - 1].date, language) : '—'}</span>
        </div>
      </div>

      <div className="trend-chart__legend">
        {smoothingWindow > 1 && (
          <span><i className="trend-legend trend-legend--raw" />{translate(language, 'trendsDailyValues')}</span>
        )}
        <span>
          <i className="trend-legend trend-legend--line" />
          {smoothingWindow > 1
            ? translate(language, 'trendsMovingAverage', { days: smoothingWindow })
            : translate(language, 'trendsDailyValues')}
        </span>
      </div>
    </article>
  );
}

export function TrendsPanel({ from, to, days, language }: Props) {
  const trendDays = useMemo(() => {
    const byDate = new Map<string, TrendDay>();

    for (const date of dateSequence(from, to)) {
      byDate.set(date, { date, alertCount: 0, alertSeconds: 0 });
    }

    for (const day of days) {
      const current = byDate.get(day.date);
      if (!current) continue;
      current.alertCount += day.alertCount;
      current.alertSeconds += day.alertSeconds;
    }

    return [...byDate.values()];
  }, [days, from, to]);

  const smoothingWindow = trendDays.length >= 14 ? 7 : trendDays.length >= 6 ? 3 : 1;
  const rawDuration = trendDays.map((day) => day.alertSeconds);
  const rawCount = trendDays.map((day) => day.alertCount);
  const rawAverage = trendDays.map((day) =>
    day.alertCount > 0 ? day.alertSeconds / day.alertCount : 0,
  );
  const durationTrend = movingAverage(rawDuration, smoothingWindow);
  const countTrend = movingAverage(rawCount, smoothingWindow);
  const averageTrend = movingAlertAverage(trendDays, smoothingWindow);

  const comparisonLength = Math.floor(trendDays.length / 2);
  const canCompare = comparisonLength > 0;
  const previousDays = canCompare ? trendDays.slice(0, comparisonLength) : [];
  const recentDays = canCompare ? trendDays.slice(-comparisonLength) : [];
  const previous = summarize(previousDays);
  const recent = summarize(recentDays);

  return (
    <div className="trends-panel">
      <div className="trends-inner">
        <header className="trends-header">
          <small>{translate(language, 'trendsEyebrow')}</small>
          <h2>{translate(language, 'trendsTitle')}</h2>
          <p>{translate(language, 'trendsDescription')}</p>
        </header>

        <section className="trend-comparison">
          <div className="trend-comparison__heading">
            <div>
              <h3>{translate(language, 'trendsComparisonTitle')}</h3>
              <p>{translate(language, 'trendsComparisonDescription')}</p>
            </div>
            {canCompare && (
              <div className="trend-comparison__periods">
                <span>
                  {translate(language, 'trendsPreviousWindow')}
                  <strong>{rangeLabel(previousDays, language)}</strong>
                </span>
                <span>
                  {translate(language, 'trendsRecentWindow')}
                  <strong>{rangeLabel(recentDays, language)}</strong>
                </span>
              </div>
            )}
          </div>

          {canCompare ? (
            <div className="trend-comparison-grid">
              <ComparisonCard
                label={translate(language, 'alertTime')}
                previous={previous.alertSeconds}
                recent={recent.alertSeconds}
                language={language}
                formatter={(value) => formatDuration(Math.round(value), language)}
              />
              <ComparisonCard
                label={translate(language, 'alerts')}
                previous={previous.alertCount}
                recent={recent.alertCount}
                language={language}
                formatter={(value) => String(Math.round(value))}
              />
              <ComparisonCard
                label={translate(language, 'trendsAverageAlertDuration')}
                previous={previous.averageAlertSeconds}
                recent={recent.averageAlertSeconds}
                language={language}
                formatter={(value) => formatDuration(Math.round(value), language)}
              />
              <ComparisonCard
                label={translate(language, 'trendsActiveDays')}
                previous={previous.activeRate}
                recent={recent.activeRate}
                language={language}
                formatter={(value) => Math.round(value) + '%'}
                percentagePoints
              />
            </div>
          ) : (
            <div className="trend-comparison__empty">
              {translate(language, 'trendsNotEnoughComparison')}
            </div>
          )}
        </section>

        <div className="trend-charts">
          <LineChart
            title={translate(language, 'trendsDurationChart')}
            days={trendDays}
            rawValues={rawDuration}
            trendValues={durationTrend}
            smoothingWindow={smoothingWindow}
            language={language}
            formatter={(value) => formatDuration(Math.round(value), language)}
          />
          <LineChart
            title={translate(language, 'trendsCountChart')}
            days={trendDays}
            rawValues={rawCount}
            trendValues={countTrend}
            smoothingWindow={smoothingWindow}
            language={language}
            formatter={formatCount}
          />
          <div className="trend-chart-card--wide">
            <LineChart
              title={translate(language, 'trendsAverageChart')}
              days={trendDays}
              rawValues={rawAverage}
              trendValues={averageTrend}
              smoothingWindow={smoothingWindow}
              language={language}
              formatter={(value) => formatDuration(Math.round(value), language)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
