import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Cross,
  ExternalLink,
  MapPinned,
  ShieldAlert,
} from 'lucide-react';
import { MapPanel } from './components/MapPanel';
import { mockDays } from './data/mock';
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
  const rounded = Math.round(minutes);
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

function App() {
  const [scope, setScope] = useState<Scope>('kyiv-city');
  const records = useMemo(() => mockDays.filter((day) => day.scope === scope), [scope]);
  const [selectedDate, setSelectedDate] = useState(
    mockDays.find((day) => day.scope === 'kyiv-city')?.date ?? '',
  );

  const selected = records.find((day) => day.date === selectedDate) ?? records[0];
  const killed = selected?.incidents.reduce((sum, item) => sum + item.killed, 0) ?? 0;
  const injured = selected?.incidents.reduce((sum, item) => sum + item.injured, 0) ?? 0;

  const selectScope = (nextScope: Scope) => {
    setScope(nextScope);
    setSelectedDate(mockDays.find((day) => day.scope === nextScope)?.date ?? '');
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

        <div className="status-pill"><span /> Prototype / mock data</div>
      </header>

      <section className="workspace">
        <aside className="days-panel">
          <div className="panel-heading">
            <div><small>Timeline</small><h2>Days</h2></div>
            <CalendarDays size={18} />
          </div>

          <div className="day-list">
            {records.map((day) => {
              const dayKilled = day.incidents.reduce((sum, item) => sum + item.killed, 0);
              const dayInjured = day.incidents.reduce((sum, item) => sum + item.injured, 0);

              return (
                <button
                  type="button"
                  key={day.date}
                  className={`day-card ${day.date === selected?.date ? 'selected' : ''}`}
                  onClick={() => setSelectedDate(day.date)}
                >
                  <div className="day-date">
                    <strong>{fmtDate(day.date)}</strong>
                    <span>{day.alertWindows.length} alerts</span>
                  </div>
                  <div className="day-time">
                    <Clock3 size={14} /> {prettyDuration(totalMinutes(day))}
                  </div>
                  <div className="day-impact">
                    {day.incidents.length
                      ? `${dayKilled} killed · ${dayInjured} injured · ${day.incidents.length} affected areas`
                      : 'No confirmed consequences'}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <aside className="detail-panel">
          {selected ? (
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
                <div className="timeline">
                  {selected.alertWindows.map((alert) => (
                    <article className="timeline-item" key={alert.id}>
                      <div className="timeline-dot" />
                      <div>
                        <div className="time-row">
                          <strong>{fmtTime(alert.startedAt)}–{fmtTime(alert.endedAt)}</strong>
                          <span>{prettyDuration(minutesBetween(alert.startedAt, alert.endedAt))}</span>
                        </div>
                        <div className="threats">
                          {alert.threatTypes.map((threat) => (
                            <span key={threat}>{threatLabel[threat]}</span>
                          ))}
                        </div>
                        <div className="sources-row"><SourceLink source={alert.source} /></div>
                      </div>
                    </article>
                  ))}
                </div>
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
                          <SourceLink key={`${incident.id}-${source.label}`} source={source} />
                        ))}
                      </div>
                      <small>Map position is an administrative-area centroid, not an exact strike coordinate.</small>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <MapPinned size={20} />
                    <p>No officially confirmed impact for this day.</p>
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="empty">Select a day.</div>
          )}
        </aside>

        <section className="map-panel">
          <MapPanel incidents={selected?.incidents ?? []} scope={scope} />
          <div className="map-overlay map-overlay--top">
            <strong>{scope === 'kyiv-city' ? 'Kyiv City' : 'Kyiv Oblast'}</strong>
            <span>{selected?.date ?? 'No day selected'}</span>
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
