import { useMemo } from 'react';
import { translate, type Language } from '../i18n';
import { alertLevelLabel } from '../alert-levels';
import { AlertLevelLegend } from './AlertLevelLegend';
import { dailyAlertLevelSeconds } from '../../shared/alert-levels.mjs';
import type { AlertLevel, AlertWindow, Scope, ScopeFilter, ThreatType } from '../types/domain';

interface Props {
  from: string;
  to: string;
  scope: ScopeFilter;
  windows: AlertWindow[];
  language: Language;
  splitAlertLevels?: boolean;
}

interface TimelineSegment {
  startMinute: number;
  endMinute: number;
  threatTypes: ThreatType[];
  isActive: boolean;
  alertLevel: AlertLevel;
}

const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

const kyivClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function dateSequence(from: string, to: string) {
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function localClockParts(iso: string) {
  const parts = kyivClock.formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}

function dayLabel(date: string, language: Language) {
  return new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace('.', '');
}

function timeLabel(minute: number) {
  const bounded = Math.max(0, Math.min(1440, minute));
  const hours = Math.floor(bounded / 60);
  const minutes = bounded % 60;
  return `${String(hours === 24 ? 24 : hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function compactDuration(minutes: number) {
  const bounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(bounded / 60);
  const rest = bounded % 60;
  return `${hours}:${String(rest).padStart(2, '0')}`;
}

function dayShareLabel(minutes: number, language: Language) {
  const percentage = (minutes / 1440) * 100;
  return `${new Intl.NumberFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    maximumFractionDigits: 1,
  }).format(percentage)}%`;
}

function threatLabel(language: Language, threat: ThreatType) {
  const keys: Record<ThreatType, Parameters<typeof translate>[1]> = {
    uav: 'uav',
    ballistic: 'ballistic',
    cruise: 'cruise',
    aviation: 'aviation',
    combined: 'combined',
    unknown: 'unspecifiedMissile',
  };
  return translate(language, keys[threat]);
}

function splitWindow(window: AlertWindow, from: string, to: string) {
  const startMs = new Date(window.startedAt).getTime();
  const endMs = new Date(window.endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

  const start = localClockParts(window.startedAt);
  const end = localClockParts(window.endedAt);
  const pieces: Array<{ date: string; scope: Scope; segment: TimelineSegment }> = [];

  for (const date of dateSequence(start.date, end.date)) {
    if (date < from || date > to) continue;

    const startMinute = date === start.date ? start.minute : 0;
    const endMinute = date === end.date ? end.minute : 1440;
    if (endMinute <= startMinute) continue;

    pieces.push({
      date,
      scope: window.scope,
      segment: {
        startMinute,
        endMinute,
        threatTypes: window.threatTypes,
        isActive: window.isActive && date === end.date,
        alertLevel: window.alertLevel ?? 'unknown',
      },
    });
  }

  return pieces;
}

function mergeSegments(segments: TimelineSegment[], splitAlertLevels: boolean) {
  const sorted = [...segments].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );
  const merged: TimelineSegment[] = [];

  for (const segment of sorted) {
    const current = merged.at(-1);
    if (!current || segment.startMinute > current.endMinute ||
        (splitAlertLevels && segment.alertLevel !== current.alertLevel)) {
      merged.push({
        ...segment,
        threatTypes: [...new Set(segment.threatTypes)],
      });
      continue;
    }

    current.endMinute = Math.max(current.endMinute, segment.endMinute);
    current.isActive ||= segment.isActive;
    current.threatTypes = [...new Set([...current.threatTypes, ...segment.threatTypes])];
  }

  return merged;
}

export function HourlyTimeline({ from, to, scope, windows, language, splitAlertLevels = false }: Props) {
  const dates = useMemo(() => dateSequence(from, to).reverse(), [from, to]);
  const lanes: Scope[] = scope === 'both' ? ['kyiv-city', 'kyiv-oblast'] : [scope];
  const totalsByDay = useMemo(() => {
    const totals = new Map<string, number>();
    for (const day of dailyAlertLevelSeconds(windows.map((window) => ({
      ...window, alertLevel: window.alertLevel ?? 'unknown',
    })), from, to)) {
      totals.set(day.date, (totals.get(day.date) ?? 0) + day.yellow + day.red + day.unknown);
    }
    return totals;
  }, [windows, from, to]);

  const byDayAndScope = useMemo(() => {
    const grouped = new Map<string, TimelineSegment[]>();

    for (const window of windows) {
      for (const piece of splitWindow(window, from, to)) {
        const key = `${piece.date}:${piece.scope}`;
        const current = grouped.get(key) ?? [];
        current.push(piece.segment);
        grouped.set(key, current);
      }
    }

    for (const [key, segments] of grouped) {
      grouped.set(key, mergeSegments(segments, splitAlertLevels));
    }

    return grouped;
  }, [from, to, windows, splitAlertLevels]);

  return (
    <div className="hourly-timeline">
      <div className="hourly-timeline__inner" style={{ minWidth: '1020px' }}>
        <header className="hourly-timeline__header">
          <div>
            <h2>{translate(language, 'hourlyTimelineTitle')}</h2>
            <p>{translate(language, 'hourlyTimelineDescription')}</p>
            {scope !== 'kyiv-city' && from < '2026-09-19' && (
              <p className="hourly-timeline__coverage-note">
                {translate(language, 'hourlyOblastCoverageWarning')}
              </p>
            )}
          </div>
        </header>
        <AlertLevelLegend language={language} splitAlertLevels={splitAlertLevels} />

        <div
          className="hourly-time-axis"
          aria-hidden="true"
          style={{ gridTemplateColumns: '86px 128px 76px minmax(720px, 1fr)' }}
        >
          <span className="hourly-time-axis__day-spacer" />
          <span
            style={{
              alignSelf: 'end',
              padding: '0 12px 8px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              textAlign: 'center',
            }}
          >
            {translate(language, 'alertTime')}
          </span>
          <span />
          <div className="hourly-time-axis__ticks">
            {HOUR_TICKS.map((hour) => (
              <span
                key={hour}
                style={{
                  left: `${(hour / 24) * 100}%`,
                  transform:
                    hour === 0 ? 'none' : hour === 24 ? 'translateX(-100%)' : 'translateX(-50%)',
                }}
              >
                {String(hour).padStart(2, '0')}
              </span>
            ))}
          </div>
        </div>

        <div className="hourly-days">
          {dates.map((date) => {
            const totalMinutes = (totalsByDay.get(date) ?? 0) / 60;
            const dayShare = dayShareLabel(totalMinutes, language);
            const dayTotal = compactDuration(totalMinutes);
            const daySummary = `${dayTotal} | ${dayShare}`;

            return (
              <section
                className="hourly-day"
                key={date}
                style={{ gridTemplateColumns: '86px 128px minmax(0, 1fr)' }}
              >
                <div className="hourly-day__label" style={{ paddingRight: '8px' }}>
                  <strong>{dayLabel(date, language)}</strong>
                </div>

                <div className="hourly-day__total" title={daySummary} aria-label={daySummary}>
                  <strong className="hourly-day__total-duration">{dayTotal}</strong>
                  <span className="hourly-day__total-separator" aria-hidden="true">|</span>
                  <strong className="hourly-day__total-share">{dayShare}</strong>
                </div>

                <div className="hourly-day__lanes">
                  {lanes.map((laneScope) => {
                    const segments = byDayAndScope.get(`${date}:${laneScope}`) ?? [];

                    return (
                      <div
                        className="hourly-lane-row"
                        key={laneScope}
                        style={{ gridTemplateColumns: '76px minmax(720px, 1fr)' }}
                      >
                        <span className="hourly-lane-label">
                          {translate(
                            language,
                            laneScope === 'kyiv-city' ? 'kyivCity' : 'kyivOblast',
                          )}
                        </span>
                        <div className="hourly-lane">
                          {segments.length === 0 && (
                            <span className="hourly-lane__empty">
                              {translate(language, 'hourlyNoAlerts')}
                            </span>
                          )}
                          {segments.map((segment, index) => {
                            const threats = segment.threatTypes.length
                              ? segment.threatTypes.map((threat) => threatLabel(language, threat)).join(', ')
                              : translate(language, 'hourlyAirRaid');
                            const title = [
                              `${timeLabel(segment.startMinute)}–${timeLabel(segment.endMinute)}`,
                              threats,
                              splitAlertLevels ? alertLevelLabel(language, segment.alertLevel) : '',
                              segment.isActive ? translate(language, 'hourlyActive') : '',
                            ]
                              .filter(Boolean)
                              .join(' · ');

                            return (
                              <span
                                key={`${segment.startMinute}-${segment.endMinute}-${index}`}
                                className={`hourly-segment alert-level--${splitAlertLevels ? segment.alertLevel : 'combined'}${segment.isActive ? ' hourly-segment--active' : ''}`}
                                style={{
                                  left: `${(segment.startMinute / 1440) * 100}%`,
                                  width: `${((segment.endMinute - segment.startMinute) / 1440) * 100}%`,
                                }}
                                title={title}
                                aria-label={title}
                              >
                                <span>{title}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
