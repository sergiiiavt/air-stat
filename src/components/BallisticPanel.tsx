import { useMemo } from 'react';
import { ballisticDays, ballisticTime } from '../../shared/ballistic-stats.mjs';
import { createDateTimeFormat } from '../date-time';
import { translate, type Language } from '../i18n';
import type { BallisticResult } from '../types/domain';

interface Props {
  data: BallisticResult | null;
  language: Language;
  loading: boolean;
  error: string | null;
}

function readableDay(date: string, language: Language) {
  return createDateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`));
}

export function BallisticPanel({ data, language, loading, error }: Props) {
  const attacks = data?.attacks ?? [];
  const days = useMemo(() => ballisticDays(attacks), [attacks]);
  const timed = attacks.filter((attack) => ballisticTime(attack.startedAt, attack.date)).length;

  return (
    <section className="ballistic-panel">
      <header className="ballistic-heading">
        <h1>{translate(language, 'ballisticTitle')}</h1>
        <p>{translate(language, 'ballisticDescription')}</p>
      </header>
      <div className="ballistic-metrics">
        <div><span>{translate(language, 'ballisticEpisodes')}</span><strong>{attacks.length}</strong></div>
        <div><span>{translate(language, 'ballisticKnownTime')}</span><strong>{timed}</strong></div>
        <div><span>{translate(language, 'ballisticUnknownTime')}</span><strong>{attacks.length - timed}</strong></div>
      </div>
      <p className="ballistic-caveat">{translate(language, 'ballisticMethod')}</p>
      {loading && <p role="status">{translate(language, 'loadingPeriod')}</p>}
      {!loading && error && <p role="alert">{error}</p>}
      {!loading && !error && days.length === 0 && (
        <p className="ballistic-empty">{translate(language, 'ballisticEmpty')}</p>
      )}
      {!loading && !error && days.length > 0 && (
        <>
          <div className="ballistic-chart">
            <div className="ballistic-chart-header">
              <h2>{translate(language, 'ballisticChart')}</h2>
              <span>{translate(language, 'ballisticZone')}</span>
            </div>
            <div className="ballistic-time-axis" aria-hidden="true">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} style={{ left: `${i * 100 / 6}%` }}>{String(i * 4).padStart(2, '0')}</span>
              ))}
            </div>
            {days.map((day) => (
              <div className="ballistic-chart-row" key={day.date}>
                <div className="ballistic-chart-date">
                  <strong>{readableDay(day.date, language)}</strong>
                  <span>{day.attacks.length} · {day.timed}/{day.attacks.length} {translate(language, 'ballisticTimedShort')}</span>
                </div>
                <div className="ballistic-lane" role="img"
                  aria-label={`${readableDay(day.date, language)}: ${day.attacks.map((attack) => ballisticTime(attack.startedAt, attack.date)?.label ?? translate(language, 'timeUnknown')).join(', ')}`}>
                  {Array.from({ length: 7 }, (_, i) => <span className="ballistic-gridline" key={i} style={{ left: `${i * 100 / 6}%` }} />)}
                  {day.attacks.map((attack) => {
                    const time = ballisticTime(attack.startedAt, attack.date);
                    return time ? (
                      <span key={attack.id} className="ballistic-marker"
                        style={{ left: `${Math.max(1, Math.min(99, time.minuteOfDay / 1440 * 100))}%` }}
                        title={`${time.label} — ${attack.summary}`} />
                    ) : null;
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="ballistic-events">
            <h2>{translate(language, 'ballisticRecordedEvents')}</h2>
            {days.flatMap((day) => day.attacks).map((attack) => {
              const time = ballisticTime(attack.startedAt, attack.date);
              return (
                <article key={attack.id} className="ballistic-event">
                  <div className="ballistic-event-meta">
                    <strong>{readableDay(attack.date, language)}</strong>
                    <span>{time ? `${time.label} · ${translate(language, 'ballisticEpisodeStart')}` : translate(language, 'ballisticDateOnly')}</span>
                    <span>{translate(language, 'verificationConfirmed')}</span>
                  </div>
                  <p>{attack.summary}</p>
                  <div className="ballistic-source-list">
                    {attack.sources.map((source) => (
                      <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.label}
                      </a>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
