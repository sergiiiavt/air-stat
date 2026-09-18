import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  Cross,
  ExternalLink,
  MapPinned,
  ShieldAlert,
} from 'lucide-react';
import { getRange, getStatus, type ApiStatus } from './api';
import { MapPanel } from './components/MapPanel';
import type {
  Incident,
  RangeResult,
  ScopeFilter,
  SourceRef,
  ThreatType,
} from './types/domain';

const presets = [
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '3 months', days: 90 },
] as const;

function kyivToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function shiftDate(date: string, days: number) {
  const current = new Date(`${date}T12:00:00Z`);
  current.setUTCDate(current.getUTCDate() + days);
  return current.toISOString().slice(0, 10);
}

function prettyDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}

function prettyDate(date: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function prettyTime(iso: string | null) {
  if (!iso) return 'time not established';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Kyiv',
  }).format(new Date(iso));
}

const threatLabel: Record<ThreatType, string> = {
  uav: 'UAV',
  ballistic: 'Ballistic',
  cruise: 'Cruise',
  aviation: 'Aviation',
  combined: 'Combined',
  unknown: 'Unspecified missile',
};

function SourceLink({ source }: { source: SourceRef }) {
  return (
    <a className="source-ref" href={source.url} target="_blank" rel="noreferrer">
      {source.label} <ExternalLink size={10} />
    </a>
  );
}

function IncidentDetail({
  incident,
  onBack,
}: {
  incident: Incident;
  onBack: () => void;
}) {
  return (
    <div className="incident-detail">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={14} /> Back to period
      </button>

      <div className="incident-detail__meta">
        <span>{prettyDate(incident.date)}</span>
        <span>{incident.verification} · {incident.confidence} confidence</span>
      </div>

      <h2>{incident.locationName}</h2>
      <p className="incident-summary">{incident.summary}</p>

      <div className="casualty-grid">
        <div><Cross size={15} /><span>Killed</span><strong>{incident.killed}</strong></div>
        <div><AlertTriangle size={15} /><span>Injured</span><strong>{incident.injured}</strong></div>
      </div>

      <div className="detail-block">
        <span className={`impact-chip impact-chip--${incident.kind}`}>
          {incident.kind.replaceAll('-', ' ')}
        </span>
        <span className="incident-time">{prettyTime(incident.occurredAt)}</span>
      </div>

      {incident.threatTypes.length > 0 && (
        <div className="threats">
          {incident.threatTypes.map((threat) => (
            <span key={threat}>{threatLabel[threat]}</span>
          ))}
        </div>
      )}

      <section className="detail-section compact">
        <h3>Damage</h3>
        {incident.damage.length ? (
          <div className="damage-items">
            {incident.damage.map((item, index) => (
              <div key={`${item.type}-${index}`}>
                <strong>{item.count ?? '—'}</strong>
                <span>{item.type}</span>
                <small>{item.description}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No structured damage has been confirmed.</p>
        )}
      </section>

      <section className="detail-section compact">
        <h3>Sources</h3>
        <div className="sources-row source-list">
          {incident.sources.map((source) => (
            <SourceLink key={`${source.label}-${source.url}`} source={source} />
          ))}
        </div>
      </section>

      {incident.reportedLocation && (
        <section className="detail-section compact">
          <h3>Reported location</h3>
          <p className="muted">
            {incident.reportedLocation.text}
            {incident.reportedLocation.redacted ? ' · generalized for public display' : ''}
          </p>
        </section>
      )}

      <p className="precision-note">
        Map precision: {incident.precision}
        {incident.displayRadiusMeters > 0 ? ` · approximately ${incident.displayRadiusMeters} m display area` : ''}.
        Recent or sensitive locations are intentionally generalized.
      </p>
    </div>
  );
}

function App() {
  const today = useMemo(() => kyivToday(), []);
  const [scope, setScope] = useState<ScopeFilter>('both');
  const [from, setFrom] = useState(() => shiftDate(today, -29));
  const [to, setTo] = useState(today);
  const [presetDays, setPresetDays] = useState<number | null>(30);
  const [range, setRange] = useState<RangeResult | null>(null);
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedArea(null);
    setSelectedIncidentId(null);

    getRange(scope, from, to)
      .then((result) => {
        if (!cancelled) setRange(result);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load period');
          setRange(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, from, to]);

  const selectedIncident =
    range?.incidents.find((incident) => incident.id === selectedIncidentId) ?? null;

  const visibleIncidents = selectedArea
    ? range?.incidents.filter((incident) => incident.district === selectedArea) ?? []
    : range?.incidents ?? [];

  const applyPreset = (days: number) => {
    setPresetDays(days);
    setTo(today);
    setFrom(shiftDate(today, -(days - 1)));
  };

  const setCustomFrom = (value: string) => {
    setPresetDays(null);
    setFrom(value);
  };

  const setCustomTo = (value: string) => {
    setPresetDays(null);
    setTo(value);
  };

  const researchStatus = status?.researchPipeline?.lastPoll
    ? `Research synced ${prettyTime(status.researchPipeline.lastPoll)}`
    : 'Research pipeline ready';

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><ShieldAlert size={18} /></span>
          <div>
            <strong>Air Alert Stat</strong>
            <small>Kyiv attack, consequence and alert history</small>
          </div>
        </div>

        <div className="scope-switch" role="tablist" aria-label="Geographic scope">
          {([
            ['kyiv-city', 'Kyiv'],
            ['kyiv-oblast', 'Oblast'],
            ['both', 'Both'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scope === value}
              className={scope === value ? 'active' : ''}
              onClick={() => setScope(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="status-pill">
          <span className={status?.latestRun?.status === 'error' ? 'status-error' : ''} />
          {researchStatus}
        </div>
      </header>

      <section className="filterbar">
        <div className="preset-switch">
          {presets.map((preset) => (
            <button
              key={preset.days}
              type="button"
              className={presetDays === preset.days ? 'active' : ''}
              onClick={() => applyPreset(preset.days)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="date-range">
          <label>
            From
            <input type="date" value={from} max={to} onChange={(event) => setCustomFrom(event.target.value)} />
          </label>
          <span>→</span>
          <label>
            To
            <input type="date" value={to} min={from} max={today} onChange={(event) => setCustomTo(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="workspace workspace--range">
        <aside className="range-panel">
          {selectedIncident ? (
            <IncidentDetail incident={selectedIncident} onBack={() => setSelectedIncidentId(null)} />
          ) : (
            <>
              <div className="period-heading">
                <small>Selected period</small>
                <h1>{prettyDate(from)} — {prettyDate(to)}</h1>
                <p>{scope === 'both' ? 'Kyiv City + Kyiv Oblast' : scope === 'kyiv-city' ? 'Kyiv City' : 'Kyiv Oblast'}</p>
              </div>

              {loading && <div className="panel-message">Loading period statistics…</div>}
              {error && <div className="panel-message panel-message--error">{error}</div>}

              {range && (
                <>
                  <div className="range-metrics">
                    <div><span>Alerts</span><strong>{range.stats.alertCount}</strong></div>
                    <div><span>Alert time</span><strong>{prettyDuration(range.stats.alertSeconds)}</strong></div>
                    <div><span>Attacks</span><strong>{range.stats.attackCount}</strong></div>
                    <div><span>Incidents</span><strong>{range.stats.incidentCount}</strong></div>
                    <div><span>Killed</span><strong>{range.stats.killed}</strong></div>
                    <div><span>Injured</span><strong>{range.stats.injured}</strong></div>
                    <div><span>Affected areas</span><strong>{range.stats.affectedAreas}</strong></div>
                  </div>

                  <section className="panel-section">
                    <div className="section-title">
                      <h3>Affected areas</h3>
                      <span>{range.areas.length}</span>
                    </div>
                    {range.areas.length ? (
                      <div className="area-list">
                        {range.areas.map((area) => (
                          <button
                            type="button"
                            key={`${area.scopes.join('-')}-${area.area}`}
                            className={selectedArea === area.area ? 'selected' : ''}
                            onClick={() => setSelectedArea(selectedArea === area.area ? null : area.area)}
                          >
                            <div>
                              <strong>{area.area}</strong>
                              <span>{area.incidentCount} incidents</span>
                            </div>
                            <div className="area-casualties">
                              <span>{area.killed} killed</span>
                              <span>{area.injured} injured</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <MapPinned size={20} />
                        <p>No researched consequence incidents in this period yet.</p>
                      </div>
                    )}
                  </section>

                  <section className="panel-section">
                    <div className="section-title">
                      <h3>{selectedArea ? selectedArea : 'Incidents'}</h3>
                      <span>{visibleIncidents.length}</span>
                    </div>
                    <div className="incident-list">
                      {visibleIncidents.map((incident) => (
                        <button
                          type="button"
                          key={incident.id}
                          onClick={() => {
                            setSelectedArea(incident.district);
                            setSelectedIncidentId(incident.id);
                          }}
                        >
                          <div className="incident-list__top">
                            <span>{prettyDate(incident.date)}</span>
                            <span className={`verification verification--${incident.verification}`}>
                              {incident.verification}
                            </span>
                          </div>
                          <strong>{incident.locationName}</strong>
                          <p>{incident.summary}</p>
                          <div className="incident-list__stats">
                            <span>{incident.killed} killed</span>
                            <span>{incident.injured} injured</span>
                            <span>{incident.sources.length} sources</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </aside>

        <section className="map-panel">
          <MapPanel
            areas={range?.areas ?? []}
            incidents={range?.incidents ?? []}
            scope={scope}
            selectedArea={selectedArea}
            onSelectArea={(area) => {
              setSelectedArea(area);
              setSelectedIncidentId(null);
            }}
            onSelectIncident={setSelectedIncidentId}
          />

          <div className="map-overlay map-overlay--top">
            <strong>{selectedArea ?? (scope === 'both' ? 'Kyiv + Kyiv Oblast' : scope === 'kyiv-city' ? 'Kyiv City' : 'Kyiv Oblast')}</strong>
            <span>{prettyDate(from)} — {prettyDate(to)}</span>
            {range && (
              <small>{range.stats.incidentCount} incidents · {range.stats.killed} killed · {range.stats.injured} injured</small>
            )}
          </div>

          {selectedArea && (
            <button
              type="button"
              className="map-back"
              onClick={() => {
                setSelectedArea(null);
                setSelectedIncidentId(null);
              }}
            >
              <ArrowLeft size={13} /> All areas
            </button>
          )}

          <div className="map-legend">
            <span><i className="legend-bubble" />incident count</span>
            <span><i className="legend-bubble legend-bubble--injured" />injuries</span>
            <span><i className="legend-bubble legend-bubble--fatal" />deaths</span>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
