import { useMemo } from 'react';
import { translate, type Language } from '../i18n';
import type { Incident, RangeDay } from '../types/domain';

interface Props {
  from: string;
  to: string;
  days: RangeDay[];
  incidents: Incident[];
  language: Language;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

interface TimelineDay {
  date: string;
  alertCount: number;
  alertSeconds: number;
  incidentCount: number;
  killed: number;
  injured: number;
  hasDamage: boolean;
}

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

function durationLabel(seconds: number, language: Language) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (language === 'uk') {
    return hours ? `${hours} год ${String(remainder).padStart(2, '0')} хв` : `${minutes} хв`;
  }

  return hours ? `${hours}h ${String(remainder).padStart(2, '0')}m` : `${minutes}m`;
}

function monthLabel(month: string, language: Language) {
  return new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T12:00:00Z`));
}

function dayLabel(date: string, language: Language) {
  return new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function hasReportedDamage(incident: Incident) {
  return (
    incident.damage.length > 0 ||
    incident.damagedObjects.length > 0 ||
    ['impact', 'fire', 'damage'].includes(incident.kind)
  );
}

export function DailyTimeline({
  from,
  to,
  days,
  incidents,
  language,
  selectedDate,
  onSelectDate,
}: Props) {
  const timelineDays = useMemo(() => {
    const byDate = new Map<string, TimelineDay>();

    for (const date of dateSequence(from, to)) {
      byDate.set(date, {
        date,
        alertCount: 0,
        alertSeconds: 0,
        incidentCount: 0,
        killed: 0,
        injured: 0,
        hasDamage: false,
      });
    }

    for (const day of days) {
      const current = byDate.get(day.date);
      if (!current) continue;
      current.alertCount += day.alertCount;
      current.alertSeconds += day.alertSeconds;
      current.incidentCount += day.incidentCount;
      current.killed += day.killed;
      current.injured += day.injured;
    }

    for (const incident of incidents) {
      const current = byDate.get(incident.date);
      if (!current) continue;
      current.hasDamage ||= hasReportedDamage(incident);
    }

    return [...byDate.values()];
  }, [days, from, incidents, to]);

  const months = useMemo(() => {
    const grouped = new Map<string, TimelineDay[]>();
    for (const day of timelineDays) {
      const key = day.date.slice(0, 7);
      const current = grouped.get(key) ?? [];
      current.push(day);
      grouped.set(key, current);
    }
    return [...grouped.entries()];
  }, [timelineDays]);

  const maxSeconds = Math.max(3600, ...timelineDays.map((day) => day.alertSeconds));

  return (
    <div className="daily-timeline">
      <header className="timeline-header">
        <div>
          <small>{translate(language, 'timelineEyebrow')}</small>
          <h2>{translate(language, 'timelineTitle')}</h2>
          <p>{translate(language, 'timelineDescription')}</p>
        </div>
        <div className="timeline-scale">
          <span>{translate(language, 'timelineScale')}</span>
          <strong>{durationLabel(maxSeconds, language)}</strong>
        </div>
      </header>

      <div className="timeline-legend" aria-label={translate(language, 'timelineConsequences')}>
        <span><i className="timeline-key timeline-key--bar" />{translate(language, 'timelineDuration')}</span>
        <span><i className="timeline-key timeline-key--damage" />{translate(language, 'timelineDamage')}</span>
        <span><i className="timeline-key timeline-key--injured" />{translate(language, 'injured')}</span>
        <span><i className="timeline-key timeline-key--fatal" />{translate(language, 'killed')}</span>
      </div>

      <div className="timeline-months">
        {months.map(([month, monthDays]) => {
          const monthAlerts = monthDays.reduce((sum, day) => sum + day.alertCount, 0);
          const monthSeconds = monthDays.reduce((sum, day) => sum + day.alertSeconds, 0);

          return (
            <section className="timeline-month" key={month}>
              <div className="timeline-month__heading">
                <h3>{monthLabel(month, language)}</h3>
                <span>
                  {monthAlerts} {translate(language, 'alerts').toLowerCase()}
                  {' · '}
                  {durationLabel(monthSeconds, language)}
                </span>
              </div>

              <div className="timeline-chart">
                <div className="timeline-y-axis" aria-hidden="true">
                  <span>{durationLabel(maxSeconds, language)}</span>
                  <span>0</span>
                </div>

                <div className="timeline-scroll">
                  <div
                    className="timeline-days"
                    style={{
                      gridTemplateColumns: `repeat(${monthDays.length}, minmax(28px, 1fr))`,
                    }}
                  >
                    {monthDays.map((day) => {
                      const height = Math.min(100, (day.alertSeconds / maxSeconds) * 100);
                      const tooltip = [
                        dayLabel(day.date, language),
                        `${translate(language, 'alerts')}: ${day.alertCount}`,
                        `${translate(language, 'alertTime')}: ${durationLabel(day.alertSeconds, language)}`,
                        `${translate(language, 'incidents')}: ${day.incidentCount}`,
                        `${translate(language, 'killed')}: ${day.killed}`,
                        `${translate(language, 'injured')}: ${day.injured}`,
                        day.hasDamage
                          ? translate(language, 'timelineDamageReported')
                          : translate(language, 'timelineNoDamageReported'),
                      ].join('\n');

                      return (
                        <button
                          key={day.date}
                          type="button"
                          className={`timeline-day${selectedDate === day.date ? ' selected' : ''}`}
                          onClick={() => onSelectDate(selectedDate === day.date ? null : day.date)}
                          title={tooltip}
                          aria-label={tooltip}
                        >
                          <div className="timeline-bar-shell">
                            {day.alertCount > 0 && (
                              <span
                                className="timeline-alert-count"
                                style={{ bottom: `calc(${Math.max(height, 2)}% + 5px)` }}
                              >
                                {day.alertCount}
                              </span>
                            )}
                            <span
                              className="timeline-bar-fill"
                              style={{ height: day.alertSeconds > 0 ? `${Math.max(height, 2)}%` : '0%' }}
                            />
                          </div>

                          <span className="timeline-day-number">{Number(day.date.slice(8, 10))}</span>

                          <span className="timeline-consequence-lanes" aria-hidden="true">
                            <i className={day.hasDamage ? 'active damage' : ''} />
                            <i className={day.injured > 0 ? 'active injured' : ''} />
                            <i className={day.killed > 0 ? 'active fatal' : ''} />
                          </span>

                          {day.incidentCount > 0 && (
                            <span className="timeline-incident-count">{day.incidentCount}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
