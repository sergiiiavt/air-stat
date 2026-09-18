import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Cross,
  ExternalLink,
  MapPinned,
  ShieldAlert,
} from 'lucide-react';
import { getDay, getDays, getStatus, type ApiStatus, type DaySummary } from './api';
import { MapPanel } from './components/MapPanel';
import type { DayRecord, Scope, SourceRef, ThreatType } from './types/domain';

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Kyiv',
  }).format(new Date(iso));

const fmtDate = (date: string, long = false) =>
  new Intl.DateTimeFormat('en-GB', {
    ...(long
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : { weekday: 'short', day: '2-digit', month: 'short' }),
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));

const minutesBetween = (start: string, end: string) =>
  Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 60000);

const totalMinutes = (day: DayRecord) =>
  day.alertWindows.reduce(
    (sum, alert) => sum + minutesBetween(alert.startedAt, alert.endedAt),
    0,
  );

const prettyDuration = (minutes: number) => {
  const rounded = Math.max(0, Math.round(minutes));
  return `${Math.floor(rounded / 60)}h ${String(rounded % 60).padStart(2, '0')}m`;
};

const threatLabel: Record<ThreatType, string> = {
  uav: 'UAV',
  ballistic: 'Ballistic',
  cruise: 'Cruise missile',
  aviation: 'Aviation',
  combined: 'Combined',
  unknown: 'Unknown',
};

function SourceLink({ source }: { source: SourceRef }) {
  if (!source.url || source.url === '#') {
    return <span className="source-ref">{source.label}</span>;
  }

  return (
    <a className="source-ref" href={source.url} target="_blank" rel="noreferrer">
      {source.label} <ExternalLink size={10} />
    </a>
  );
}

function statusText(status: ApiStatus | null) {
  if (!status) return 'Connecting';
  if (!status.alertsSourceConfigured) return 'Source token pending';
  if (status.latestRun?.status === 'error') return 'Ingestion error';
  return 'Live backend';
}

function App() {
  const [scope, setScope] = useState<Scope>('kyiv-city');
  const [days, setDays] = useState<DaySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selected, setSelected] = useState<DayRecord | null>(null);
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [loadingDays, setLoadingDays] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingDays(true);
    setError(null);
    setDays([]);
    setSelected(null);
    setSelectedDate('');

    getDays(scope)
      .then((result) => {
        if (cancelled) return;
        setDays(result.days);
        setSelectedDate(result.days[0]?.date ?? '');
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load days');
      })
      .finally(() => {
        if (!cancelled) setLoadingDays(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope]);

  useEffect(() => {
    if (!selectedDate) {
      setSelected(null);
      return;
    }

    let cancelled = false;
    setLoadingDay(true);
    setError(null);

    getDay(scope, selectedDate)
      .then((day) => {
        if (!cancelled) setSelected(day);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setSelected(null);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load day');
      })
      .finally(() => {
        if (!cancelled) setLoadingDay(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, selectedDate]);

  const killed = selected?.incidents.reduce((sum, item) => sum + item.killed, 0) ?? 0;
  const injured = selected?.incidents.reduce((sum, item) => sum + item.injured, 0) ?? 0;

  const selectScope = (nextScope: Scope) => {
    if (nextScope !== scope) setScope(nextScope);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><ShieldAlert size={18} /></span>
          <div>
            <strong>AirAlert Kyiv</strong>
            <small>historical air-raid alert & consequence statistics</small>
          </div>
        </div>

        <div className="scope-switch" role="tablist" aria-label="Map scope">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'kyiv-city'}
            className={scope === 'kyiv-city' ? 'active' : ''}
            onClick={() => selectScope('kyiv-city')}
          >
            Kyiv City
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'kyiv-oblast'}
            className={scope === 'kyiv-oblast' ? 'active' : ''}
            onClick={() => selectScope('kyiv-oblast')}
          >
            Kyiv Oblast
          </button>
        </div>

        <div className="status-pill" title={status?.latestRun?.error_message ?? undefined}>
          <span className={status?.latestRun?.status === 'error' ? 'status-error' : ''} />
          {statusText(status)}
        </div>
      </header>

      <section className="workspace">
        <aside className="days-panel">
          <div className="panel-heading">
            <div><small>Timeline</small><h2>Days</h2></div>
            <CalendarDays size={18} />
          </div>

          <div className="day-list">
            {loadingDays && <div className="panel-message">Loading stored alert days…</div>}

            {!loadingDays && error && days.length === 0 && (
              <div className="panel-message panel-message--error">
                API error: {error}
              </div>
            )}

            {!loadingDays && !error && days.length === 0 && (
              <div className="panel-message">
                <strong>No stored alerts yet.</strong>
                <span>
                  {status?.alertsSourceConfigured
                    ? 'The collector is active; data will appear after the first successful sync.'
                    : 'The backend is deployed. alerts.in.ua ingestion starts when its API token is configured.'}
                </span>
              </div>
            )}

            {days.map((day) => (
              <button
                type="button"
                key={day.date}
                className={`day-card ${day.date === selectedDate ? 'selected' : ''}`}
                onClick={() => setSelectedDate(day.date)}
              >
                <div className="day-date">
                  <strong>{fmtDate(day.date)}</strong>
                  <span>{day.alertCount} alerts</span>
                </div>
                <div className="day-time">
                  <Clock3 size={14} /> {prettyDuration(day.alertSeconds / 60)}
                </div>
                <div className="day-impact">
                  {day.incidentCount
                    ? `${day.killed} killed · ${day.injured} injured · ${day.affectedAreas} affected areas`
                    : 'No confirmed consequences stored'}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <aside className="detail-panel">
          {loadingDay && <div className="empty">Loading day details…</div>}

          {!loadingDay && selected ? (
            <>
              <div className="detail-header">
                <small>Selected day</small>
                <h1>{fmtDate(selected.date, true)}</h1>
                <div className="metrics">
                  <div><span>Alert time</span><strong>{prettyDuration(totalMinutes(selected))}</strong></div>
                  <div><span>Killed</span><strong>{killed}</strong></div>
                  <div><span>Injured</span><strong>{injured}</strong></div>
                </div>
              </div>

              <section className="detail-section">
                <div className="section-title">
                  <h3>Alert windows</h3><span>{selected.alertWindows.length}</span>
                </div>

                {selected.alertWindows.length ? (
                  <div className="timeline">
                    {selected.alertWindows.map((alert) => (
                      <article className="timeline-item" key={alert.id}>
                        <div className="timeline-dot" />
                        <div>
                          <div className="time-row">
                            <strong>
                              {fmtTime(alert.startedAt)}–{alert.isActive ? 'active' : fmtTime(alert.endedAt)}
                            </strong>
                            <span>{prettyDuration(minutesBetween(alert.startedAt, alert.endedAt))}</span>
                          </div>
                          <div className="threats">
                            {alert.threatTypes.length ? (
                              alert.threatTypes.map((threat) => (
                                <span key={threat}>{threatLabel[threat]}</span>
                              ))
                            ) : (
                              <span>Threat not classified</span>
                            )}
                          </div>
                          <div className="sources-row"><SourceLink source={alert.source} /></div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">No alert windows stored for this day.</div>
                )}
              </section>

              <section className="detail-section">
                <div className="section-title">
                  <h3>Consequences</h3><span>{selected.incidents.length}</span>
                </div>

                {selected.incidents.length ? (
                  selected.incidents.map((incident) => (
                    <article className="incident-card" key={incident.id}>
                      <div className="incident-top">
                        <span className={`impact-chip impact-chip--${incident.kind}`}>
                          {incident.kind.replaceAll('-', ' ')}
                        </span>
                        <span>{incident.verification}</span>
                      </div>
                      <h4>{incident.district}</h4>
                      <p>{incident.summary}</p>
                      <div className="casualties">
                        <span><Cross size={13} /> {incident.killed} killed</span>
                        <span><AlertTriangle size={13} /> {incident.injured} injured</span>
                      </div>
                      {incident.damagedObjects.length > 0 && (
                        <p className="damage-list">Damage: {incident.damagedObjects.join(', ')}</p>
                      )}
                      <div className="sources-row">
                        {incident.sources.map((source) => (
                          <SourceLink key={`${incident.id}-${source.label}-${source.url}`} source={source} />
                        ))}
                      </div>
                      <small>
                        Map positions, when present, use administrative-area precision rather than tactical coordinates.
                      </small>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <MapPinned size={20} />
                    <p>No official consequence record stored for this day.</p>
                  </div>
                )}
              </section>
            </>
          ) : null}

          {!loadingDay && !selected && selectedDate === '' && (
            <div className="empty">
              Select a stored day when alert history becomes available.
            </div>
          )}
        </aside>

        <section className="map-panel">
          <MapPanel incidents={selected?.incidents ?? []} scope={scope} />
          <div className="map-overlay map-overlay--top">
            <strong>{scope === 'kyiv-city' ? 'Kyiv City' : 'Kyiv Oblast'}</strong>
            <span>{selected?.date ?? 'No stored day selected'}</span>
          </div>
          <div className="map-legend">
            <span><i className="legend-dot legend-dot--impact" />Impact</span>
            <span><i className="legend-dot legend-dot--debris" />Debris</span>
            <span><i className="legend-dot legend-dot--air-defense" />Air defense</span>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
