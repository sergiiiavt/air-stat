import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BellRing,
  CircleX,
  Clock3,
  ExternalLink,
  HeartPulse,
  History,
  Languages,
  MapPinned,
  Moon,
  Sun,
} from 'lucide-react';
import { getRange, getStatus, type ApiStatus } from './api';
import { BrandMark } from './components/BrandMark';
import { DailyTimeline } from './components/DailyTimeline';
import { MapPanel } from './components/MapPanel';
import { TrendsPanel } from './components/TrendsPanel';
import { formatDuration } from './format';
import { detectLanguage, translate, type Language } from './i18n';
import {
  incidentDamageDescription,
  incidentDamageType,
  incidentNarrative,
  localizeAreaName,
  localizePrecision,
  localizedIncidentArea,
  localizedReportedLocation,
} from './localized-content';
import { applyTheme, detectTheme, type Theme } from './theme';
import type {
  Confidence,
  Incident,
  ImpactKind,
  RangeResult,
  ScopeFilter,
  SourceRef,
  ThreatType,
  Verification,
} from './types/domain';

const presets = [
  { key: 'preset3', days: 3 },
  { key: 'preset7', days: 7 },
  { key: 'preset30', days: 30 },
  { key: 'preset90', days: 90 },
  { key: 'preset180', days: 180 },
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

function prettyDate(date: string, language: Language) {
  return new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function prettyTime(iso: string | null, language: Language) {
  if (!iso) return translate(language, 'timeUnknown');

  return new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Kyiv',
  }).format(new Date(iso));
}

function threatText(language: Language, threat: ThreatType) {
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

function impactText(language: Language, kind: ImpactKind) {
  const keys: Record<ImpactKind, Parameters<typeof translate>[1]> = {
    impact: 'impact',
    debris: 'debris',
    'air-defense': 'airDefense',
    fire: 'fire',
    damage: 'damageKind',
    'no-confirmed-impact': 'noConfirmedImpact',
    unknown: 'unknown',
  };
  return translate(language, keys[kind]);
}

function verificationText(language: Language, value: Verification) {
  const keys: Record<Verification, Parameters<typeof translate>[1]> = {
    provisional: 'verificationProvisional',
    confirmed: 'verificationConfirmed',
    final: 'verificationFinal',
  };
  return translate(language, keys[value]);
}

function confidenceText(language: Language, value: Confidence) {
  const keys: Record<Confidence, Parameters<typeof translate>[1]> = {
    low: 'confidenceLow',
    medium: 'confidenceMedium',
    high: 'confidenceHigh',
  };
  return translate(language, keys[value]);
}

function SourceLink({ source }: { source: SourceRef }) {
  return (
    <a className="source-ref" href={source.url} target="_blank" rel="noreferrer">
      {source.label} <ExternalLink size={10} />
    </a>
  );
}

function IncidentDetail({
  incident,
  language,
  onClose,
}: {
  incident: Incident;
  language: Language;
  onClose: () => void;
}) {
  return (
    <div className="incident-detail">
      <button className="back-button" type="button" onClick={onClose}>
        <CircleX size={14} /> {translate(language, 'closeDetails')}
      </button>

      <div className="incident-detail__meta">
        <span>{prettyDate(incident.date, language)}</span>
        <span>
          {verificationText(language, incident.verification)}
          {' · '}
          {translate(language, 'confidence', {
            value: confidenceText(language, incident.confidence),
          })}
        </span>
      </div>

      <h2>{localizedIncidentArea(incident, language)}</h2>
      <p className="incident-summary">{incidentNarrative(incident, language)}</p>

      <div className="casualty-grid">
        <div>
          <CircleX size={15} />
          <span>{translate(language, 'killed')}</span>
          <strong>{incident.killed}</strong>
        </div>
        <div>
          <HeartPulse size={15} />
          <span>{translate(language, 'injured')}</span>
          <strong>{incident.injured}</strong>
        </div>
      </div>

      <div className="detail-block">
        <span className={`impact-chip impact-chip--${incident.kind}`}>
          {impactText(language, incident.kind)}
        </span>
        <span className="incident-time">{prettyTime(incident.occurredAt, language)}</span>
      </div>

      {incident.threatTypes.length > 0 && (
        <div className="threats">
          {incident.threatTypes.map((threat) => (
            <span key={threat}>{threatText(language, threat)}</span>
          ))}
        </div>
      )}

      <section className="detail-section compact">
        <h3>{translate(language, 'damage')}</h3>
        {incident.damage.length ? (
          <div className="damage-items">
            {incident.damage.map((item, index) => (
              <div key={`${item.type}-${index}`}>
                <strong>{item.count ?? '—'}</strong>
                <span>{incidentDamageType(incident, index, item, language)}</span>
                {incidentDamageDescription(incident, index, item, language) && (
                  <small>{incidentDamageDescription(incident, index, item, language)}</small>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{translate(language, 'noDamage')}</p>
        )}
      </section>

      <section className="detail-section compact">
        <h3>{translate(language, 'sources')}</h3>
        <div className="sources-row source-list">
          {incident.sources.map((source) => (
            <SourceLink key={`${source.label}-${source.url}`} source={source} />
          ))}
        </div>
      </section>

      {incident.reportedLocation && (
        <section className="detail-section compact">
          <h3>{translate(language, 'reportedLocation')}</h3>
          <p className="muted">
            {localizedReportedLocation(incident, language)}
            {incident.reportedLocation.redacted
              ? ` · ${translate(language, 'generalizedForDisplay')}`
              : ''}
          </p>
        </section>
      )}

      <p className="precision-note">
        {translate(language, 'mapPrecision')}: {localizePrecision(incident.precision, language)}
        {incident.displayRadiusMeters > 0
          ? ` · ${translate(language, 'displayArea', {
              meters: incident.displayRadiusMeters,
            })}`
          : ''}
        . {translate(language, 'sensitiveGeneralized')}
      </p>
    </div>
  );
}


function ResearchArchiveIndicator({
  archive,
  language,
}: {
  archive: NonNullable<ApiStatus['researchArchive']>;
  language: Language;
}) {
  if (!archive.firstDate || !archive.lastDate) return null;

  return (
    <div className="research-archive">
      <History size={12} />
      <span>{translate(language, 'researchArchive')}</span>
      <strong>
        {prettyDate(archive.firstDate, language)} — {prettyDate(archive.lastDate, language)}
      </strong>
      <small>
        {translate(language, 'researchIndexedDays', { count: archive.indexedDays })}
      </small>
    </div>
  );
}

function App() {
  const today = useMemo(() => kyivToday(), []);
  const [language, setLanguage] = useState<Language>(() => detectLanguage());
  const [theme, setTheme] = useState<Theme>(() => detectTheme());
  const [scope, setScope] = useState<ScopeFilter>('both');
  const [showHeatmap, setShowHeatmap] = useState(() => {
    const saved = window.localStorage.getItem('air-alert-map-heatmap');
    if (saved === 'true' || saved === 'false') return saved === 'true';
    const legacyMode = window.localStorage.getItem('air-alert-map-mode');
    return legacyMode === 'heatmap' || legacyMode === 'both';
  });
  const [viewMode, setViewMode] = useState<'map' | 'timeline' | 'trends'>(() => {
    const saved = window.localStorage.getItem('air-alert-view-mode');
    return saved === 'timeline' || saved === 'trends' ? saved : 'map';
  });
  const [from, setFrom] = useState(() => shiftDate(today, -89));
  const [to, setTo] = useState(today);
  const [presetDays, setPresetDays] = useState<number | null>(90);
  const [range, setRange] = useState<RangeResult | null>(null);
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const selectedIncidentRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem('air-alert-language', language);
    document.documentElement.lang = language;
    document.title = language === 'uk' ? 'Air Alert Stat — Київ' : 'Air Alert Stat — Kyiv';
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem('air-alert-theme', theme);
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('air-alert-map-heatmap', String(showHeatmap));
  }, [showHeatmap]);

  useEffect(() => {
    window.localStorage.setItem('air-alert-view-mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;

    const refreshStatus = () => {
      getStatus()
        .then((nextStatus) => {
          if (!cancelled) setStatus(nextStatus);
        })
        .catch(() => {
          // Keep the last known status on transient polling failures.
        });
    };

    refreshStatus();
    const timer = window.setInterval(refreshStatus, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedArea(null);
    setSelectedDate(null);
    setSelectedIncidentId(null);

    getRange(scope, from, to)
      .then((result) => {
        if (!cancelled) setRange(result);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(translate(language, 'loadPeriodError'));
          setRange(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, from, to, language]);

  const selectedIncident =
    range?.incidents.find((incident) => incident.id === selectedIncidentId) ?? null;

  const visibleIncidents =
    range?.incidents.filter(
      (incident) =>
        (!selectedArea || incident.district === selectedArea) &&
        (!selectedDate || incident.date === selectedDate),
    ) ?? [];

  const selectedAreaSummary =
    selectedArea && range
      ? range.areas.find((area) => area.area === selectedArea) ?? null
      : null;

  useEffect(() => {
    if (!selectedIncidentId) return;

    const frame = window.requestAnimationFrame(() => {
      selectedIncidentRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedIncidentId]);

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
    ? translate(language, 'researchSynced', {
        time: prettyTime(status.researchPipeline.lastPoll, language),
      })
    : translate(language, 'researchReady');

  const scopeLabel =
    scope === 'both'
      ? translate(language, 'kyivAndOblast')
      : scope === 'kyiv-city'
        ? translate(language, 'kyivCity')
        : translate(language, 'kyivOblast');

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><BrandMark /></span>
          <div>
            <strong>Air Alert Stat</strong>
            <small>{translate(language, 'brandSubtitle')}</small>
          </div>
        </div>

        <div className="view-switch" role="group" aria-label={translate(language, 'viewMode')}>
          {([
            ['map', translate(language, 'mapView')],
            ['timeline', translate(language, 'timelineView')],
            ['trends', translate(language, 'trendsView')],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={viewMode === value ? 'active' : ''}
              aria-pressed={viewMode === value}
              onClick={() => {
                setViewMode(value);
                setSelectedIncidentId(null);
                if (value === 'map') {
                  setSelectedDate(null);
                } else if (value === 'timeline') {
                  setSelectedArea(null);
                } else {
                  setSelectedArea(null);
                  setSelectedDate(null);
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="topbar-actions">
          <button
            className="theme-toggle"
            type="button"
            aria-label={`${translate(language, 'theme')}: ${translate(
              language,
              theme === 'dark' ? 'lightTheme' : 'darkTheme',
            )}`}
            title={translate(language, theme === 'dark' ? 'lightTheme' : 'darkTheme')}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            <span>{translate(language, theme === 'dark' ? 'lightTheme' : 'darkTheme')}</span>
          </button>

          <a
            className="status-pill"
            href="/progress"
            title={translate(language, 'dataCollectionProgress')}
          >
            <span className={status?.latestRun?.status === 'error' ? 'status-error' : ''} />
            {researchStatus}
          </a>

          <div className="language-switch" aria-label={translate(language, 'language')}>
            <Languages size={14} />
            <button
              type="button"
              className={language === 'uk' ? 'active' : ''}
              aria-pressed={language === 'uk'}
              onClick={() => setLanguage('uk')}
            >
              УКР
            </button>
            <button
              type="button"
              className={language === 'en' ? 'active' : ''}
              aria-pressed={language === 'en'}
              onClick={() => setLanguage('en')}
            >
              EN
            </button>
          </div>
        </div>
      </header>

      <section className="filterbar">
        <div className="filterbar-main">
          <div className="scope-switch" role="tablist" aria-label={translate(language, 'scopeAria')}>
            {([
              ['kyiv-city', translate(language, 'kyiv')],
              ['kyiv-oblast', translate(language, 'oblast')],
              ['both', translate(language, 'both')],
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

          <div className="preset-switch">
            {presets.map((preset) => (
              <button
                key={preset.days}
                type="button"
                className={presetDays === preset.days ? 'active' : ''}
                onClick={() => applyPreset(preset.days)}
              >
                {translate(language, preset.key)}
              </button>
            ))}
          </div>
        </div>

        <div className="date-range">
          <label>
            {translate(language, 'from')}
            <input
              type="date"
              value={from}
              max={to}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
          </label>
          <span>→</span>
          <label>
            {translate(language, 'to')}
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className={`workspace workspace--range${viewMode === 'trends' ? ' workspace--full' : ''}`}>
        {viewMode !== 'trends' && (
        <aside className="range-panel">
              <div className="period-heading">
                <small>{translate(language, 'selectedPeriod')}</small>
                <h1>{prettyDate(from, language)} — {prettyDate(to, language)}</h1>
                <p>{scopeLabel}</p>
                {status?.researchArchive && (
                  <ResearchArchiveIndicator
                    archive={status.researchArchive}
                    language={language}
                  />
                )}
              </div>

              {loading && (
                <div className="panel-message">{translate(language, 'loadingPeriod')}</div>
              )}
              {error && <div className="panel-message panel-message--error">{error}</div>}

              {range && (
                <>
                  <div className="range-metrics">
                    <div>
                      <Clock3 size={13} />
                      <span>{translate(language, 'alertTime')}</span>
                      <strong>{formatDuration(range.stats.alertSeconds, language)}</strong>
                    </div>
                    <div>
                      <BellRing size={13} />
                      <span>{translate(language, 'alerts')}</span>
                      <strong>{range.stats.alertCount}</strong>
                    </div>
                    <div>
                      <MapPinned size={13} />
                      <span>{translate(language, 'incidents')}</span>
                      <strong>{range.stats.incidentCount}</strong>
                    </div>
                  </div>
                  <div className="range-secondary-metrics">
                    <span>{translate(language, 'attacks')} <strong>{range.stats.attackCount}</strong></span>
                    <span>{translate(language, 'affectedAreas')} <strong>{range.stats.affectedAreas}</strong></span>
                    <span>{translate(language, 'killed')} <strong>{range.stats.killed}</strong></span>
                    <span>{translate(language, 'injured')} <strong>{range.stats.injured}</strong></span>
                  </div>

                  <section className="panel-section">
                    <div className="section-title">
                      <h3>{translate(language, 'affectedAreas')}</h3>
                      <span>{range.areas.length}</span>
                    </div>
                    {range.areas.length ? (
                      <div className="area-list">
                        {range.areas.map((area) => (
                          <button
                            type="button"
                            key={`${area.scopes.join('-')}-${area.area}`}
                            className={selectedArea === area.area ? 'selected' : ''}
                            onClick={() => {
                              setSelectedDate(null);
                              setSelectedIncidentId(null);
                              setSelectedArea(selectedArea === area.area ? null : area.area);
                            }}
                          >
                            <div>
                              <strong>{localizeAreaName(area.area, language)}</strong>
                              <span>
                                {area.incidentCount} {translate(language, 'incidents').toLowerCase()}
                              </span>
                            </div>
                            <div className="area-casualties">
                              <span>{area.killed} {translate(language, 'killed').toLowerCase()}</span>
                              <span>{area.injured} {translate(language, 'injured').toLowerCase()}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <MapPinned size={20} />
                        <p>{translate(language, 'noResearched')}</p>
                      </div>
                    )}
                  </section>

                  <section className="panel-section">
                    <div className="section-title">
                      <h3>
                        {selectedDate
                          ? prettyDate(selectedDate, language)
                          : selectedArea
                            ? localizeAreaName(selectedArea, language)
                            : translate(language, 'incidents')}
                      </h3>
                      <span>{visibleIncidents.length}</span>
                    </div>
                    {selectedAreaSummary && (
                      <div className="area-aggregate-summary">
                        <div>
                          <span>{translate(language, 'aggregatePeriodSummary')}</span>
                          <strong>{localizeAreaName(selectedAreaSummary.area, language)}</strong>
                        </div>
                        <div className="area-aggregate-summary__metrics">
                          <span>
                            <strong>{selectedAreaSummary.incidentCount}</strong>
                            {translate(language, 'incidents').toLowerCase()}
                          </span>
                          <span>
                            <strong>{selectedAreaSummary.killed}</strong>
                            {translate(language, 'killed').toLowerCase()}
                          </span>
                          <span>
                            <strong>{selectedAreaSummary.injured}</strong>
                            {translate(language, 'injured').toLowerCase()}
                          </span>
                        </div>
                      </div>
                    )}
                    {selectedIncident && (
                      <div ref={selectedIncidentRef}>
                        <IncidentDetail
                          incident={selectedIncident}
                          language={language}
                          onClose={() => setSelectedIncidentId(null)}
                        />
                      </div>
                    )}
                    <div className="incident-list">
                      {visibleIncidents.map((incident) => (
                        <button
                          type="button"
                          key={incident.id}
                          className={selectedIncidentId === incident.id ? 'selected' : ''}
                          aria-pressed={selectedIncidentId === incident.id}
                          onClick={() => {
                            setSelectedDate(null);
                            setSelectedIncidentId(incident.id);
                          }}
                        >
                          <div className="incident-list__top">
                            <span>{prettyDate(incident.date, language)}</span>
                            <span className={`verification verification--${incident.verification}`}>
                              {verificationText(language, incident.verification)}
                            </span>
                          </div>
                          <strong>{localizedIncidentArea(incident, language)}</strong>
                          <p>{incidentNarrative(incident, language)}</p>
                          <div className="incident-list__stats">
                            <span>{incident.killed} {translate(language, 'killed').toLowerCase()}</span>
                            <span>{incident.injured} {translate(language, 'injured').toLowerCase()}</span>
                            <span>
                              {incident.sources.length}{' '}
                              {incident.sources.length === 1
                                ? translate(language, 'sourceSingular')
                                : translate(language, 'sourcePlural')}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}
        </aside>
        )}

        <section className="visualization-panel">
          {viewMode === 'map' ? (
            <>
              <MapPanel
                incidents={range?.incidents ?? []}
                scope={scope}
                language={language}
                theme={theme}
                showHeatmap={showHeatmap}
                selectedArea={selectedArea}
                selectedIncidentId={selectedIncidentId}
                onSelectIncident={(id) => {
                  setSelectedDate(null);
                  setSelectedArea(null);
                  setSelectedIncidentId(id);
                }}
                onSelectArea={(area) => {
                  setSelectedDate(null);
                  setSelectedIncidentId(null);
                  setSelectedArea(area);
                }}
              />

              <div className="map-overlay-switch">
                <button
                  type="button"
                  className={showHeatmap ? 'active' : ''}
                  aria-pressed={showHeatmap}
                  onClick={() => setShowHeatmap((current) => !current)}
                >
                  {translate(language, 'mapHeatmap')}
                </button>
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
                  <ArrowLeft size={13} /> {translate(language, 'allAreas')}
                </button>
              )}

              <div className="map-legend">
                <span>
                  <i className="legend-aggregate">#</i>
                  {translate(language, 'aggregateMarkerMeaning')}
                </span>
                <span>
                  <i className="legend-bubble" />
                  {translate(language, 'exactAddressMarkerMeaning')}
                </span>
                {showHeatmap && (
                  <span className="heat-legend">
                    <i className="heat-gradient" />
                    {translate(language, 'heatmapDensity')}
                  </span>
                )}
              </div>
            </>
          ) : viewMode === 'timeline' ? (
            <DailyTimeline
              from={from}
              to={to}
              days={range?.days ?? []}
              incidents={range?.incidents ?? []}
              language={language}
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setSelectedArea(null);
                setSelectedIncidentId(null);
              }}
            />
          ) : (
            <TrendsPanel
              from={from}
              to={to}
              days={range?.days ?? []}
              language={language}
            />
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
