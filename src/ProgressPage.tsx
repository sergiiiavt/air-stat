import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Moon, RefreshCw, Sun } from 'lucide-react';
import { getProgress, type ApiStatus } from './api';
import { BrandMark } from './components/BrandMark';
import { createDateTimeFormat } from './date-time';
import { detectLanguage, translate, type Language } from './i18n';
import { applyTheme, detectTheme, writeBrowserStorage, type Theme } from './theme';
import './progress.css';

type Backfill = NonNullable<ApiStatus['researchBackfill']>;
type DailyDay = NonNullable<Backfill['dailyDays']>[number];
type WindowDays = 7 | 14 | 30;

const copy = {
  en: {
    title: 'Data collection',
    subtitle: 'Operational view of the ongoing daily research pipeline.',
    back: 'Back to statistics',
    refresh: 'Refresh now',
    loadError: 'Unable to load collection status.',
    noData: 'Collection status is not available yet.',
    pipeline: 'Pipeline',
    running: 'Running',
    idle: 'Idle',
    lastPoll: 'Last pipeline poll',
    activeRuns: 'Active runs',
    yesterday: 'Yesterday',
    latestCompleted: 'Latest completed day',
    recentCoverage: 'Last 7 days completed',
    findings: 'Findings · 7 days',
    writes: 'Writes · 7 days',
    operationalHistory: 'Recent daily processing',
    operationalHelp:
      'This is the ongoing process only. Use the range selector to inspect recent daily runs; historical backfill is summarized separately below.',
    date: 'Date',
    status: 'Status',
    lastRun: 'Last run',
    runs: 'Runs',
    findingsColumn: 'Findings',
    writesColumn: 'Writes',
    pending: 'Not run',
    inProgress: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    today: 'today',
    yesterdayShort: 'yesterday',
    noDailyDays: 'Daily analysis has not started yet.',
    historical: 'Historical collection',
    historicalComplete: 'Historical backfill complete',
    historicalIncomplete: 'Historical backfill still incomplete',
    historicalHelpComplete:
      'Historical dates are already processed, so the full backfill calendar is intentionally hidden from this operational page.',
    historicalHelpIncomplete:
      'The operational page stays focused on daily collection, but historical gaps still require attention.',
    historicalRange: 'Range',
    historicalProcessed: 'Processed',
    historicalRemaining: 'Remaining',
    indexedArchive: 'Indexed archive',
    lastAccepted: 'Last historical result',
    pageUpdated: 'Page refreshed',
    auto: 'Auto-refresh every 15 seconds',
    statusNote:
      'Daily rows come directly from recorded research runs. A pending or failed yesterday row is the clearest signal that the ongoing process needs attention.',
  },
  uk: {
    title: 'Збір даних',
    subtitle: 'Операційний стан поточного щоденного процесу збору та аналізу.',
    back: 'Назад до статистики',
    refresh: 'Оновити зараз',
    loadError: 'Не вдалося завантажити стан збору.',
    noData: 'Статус збору поки недоступний.',
    pipeline: 'Пайплайн',
    running: 'Працює',
    idle: 'Очікує',
    lastPoll: 'Остання перевірка пайплайна',
    activeRuns: 'Активні запуски',
    yesterday: 'Учора',
    latestCompleted: 'Останній завершений день',
    recentCoverage: 'Завершено за 7 днів',
    findings: 'Знахідки · 7 днів',
    writes: 'Записи · 7 днів',
    operationalHistory: 'Остання щоденна обробка',
    operationalHelp:
      'Тут лише ongoing-процес. Перемикач нижче показує останні щоденні запуски; історичний backfill винесений у компактний підсумок.',
    date: 'Дата',
    status: 'Статус',
    lastRun: 'Останній запуск',
    runs: 'Запуски',
    findingsColumn: 'Знахідки',
    writesColumn: 'Записи',
    pending: 'Не запускався',
    inProgress: 'В роботі',
    completed: 'Завершено',
    failed: 'Помилка',
    today: 'сьогодні',
    yesterdayShort: 'учора',
    noDailyDays: 'Щоденний аналіз ще не запускався.',
    historical: 'Історичний збір',
    historicalComplete: 'Історичний backfill завершено',
    historicalIncomplete: 'Історичний backfill ще не завершено',
    historicalHelpComplete:
      'Історичні дати вже опрацьовані, тому повний календар backfill навмисно прибраний з цієї операційної сторінки.',
    historicalHelpIncomplete:
      'Сторінка лишається сфокусованою на щоденному зборі, але історичні пропуски все ще потребують уваги.',
    historicalRange: 'Період',
    historicalProcessed: 'Опрацьовано',
    historicalRemaining: 'Залишилось',
    indexedArchive: 'В архіві',
    lastAccepted: 'Останній історичний результат',
    pageUpdated: 'Сторінку оновлено',
    auto: 'Автооновлення кожні 15 секунд',
    statusNote:
      'Щоденні рядки будуються напряму із записаних research runs. Pending або failed для вчора — найпростіший сигнал, що ongoing-процес потребує уваги.',
  },
} as const;

function formatDate(value: string | null | undefined, language: Language) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return createDateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatTime(value: string | null | undefined, language: Language) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return createDateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Europe/Kyiv',
  }).format(date);
}

function kyivDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function dailyStatusLabel(language: Language, status: DailyDay['status']) {
  const t = copy[language];
  return {
    pending: t.pending,
    in_progress: t.inProgress,
    completed: t.completed,
    failed: t.failed,
  }[status];
}

export default function ProgressPage() {
  const [language, setLanguage] = useState<Language>(() => detectLanguage());
  const [theme, setTheme] = useState<Theme>(() => detectTheme());
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [browserUpdatedAt, setBrowserUpdatedAt] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<WindowDays>(14);
  const t = copy[language];

  const refresh = async () => {
    setRefreshing(true);
    try {
      const next = await getProgress();
      setStatus(next);
      setError(null);
      setBrowserUpdatedAt(new Date().toISOString());
    } catch {
      setError(copy[language].loadError);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    writeBrowserStorage('air-alert-language', language);
    document.documentElement.lang = language;
    document.title = language === 'uk' ? 'Збір даних — Air Alert Stat' : 'Data collection — Air Alert Stat';
  }, [language]);

  useEffect(() => {
    writeBrowserStorage('air-alert-theme', theme);
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const backfill = status?.researchBackfill ?? null;
  const archive = status?.researchArchive ?? null;
  const today = kyivDate();
  const yesterdayDate = shiftDate(today, -1);
  const dailyDays = useMemo(
    () => [...(backfill?.dailyDays ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [backfill?.dailyDays],
  );
  const visibleDailyDays = useMemo(() => dailyDays.slice(0, windowDays), [dailyDays, windowDays]);
  const yesterday = dailyDays.find((day) => day.date === yesterdayDate) ?? null;
  const lastCompleted = dailyDays.find((day) => day.status === 'completed') ?? null;
  const recentSeven = dailyDays.filter((day) => day.date <= yesterdayDate).slice(0, 7);
  const recentCompleted = recentSeven.filter((day) => day.status === 'completed').length;
  const recentFindings = recentSeven.reduce((sum, day) => sum + day.findingCount, 0);
  const recentWrites = recentSeven.reduce(
    (sum, day) => sum + day.attackWriteCount + day.incidentWriteCount,
    0,
  );
  const activeRuns = status?.researchPipeline?.recentRunningCount ?? 0;
  const pipelineState = activeRuns > 0 ? t.running : t.idle;
  const historicalComplete = backfill?.pipelineStatus === 'complete' || backfill?.completionPercent === 100;
  const historicalRemaining = backfill ? Math.max(0, backfill.total - backfill.completed) : 0;

  return (
    <main className="progress-page">
      <header className="progress-topbar">
        <div className="brand">
          <span className="brand-mark">
            <BrandMark />
          </span>
          <strong>Air Alert Stat</strong>
        </div>

        <div className="progress-topbar-actions">
          <a className="progress-back" href="/">
            <ArrowLeft size={14} /> {t.back}
          </a>
          <button
            className="theme-toggle"
            type="button"
            aria-label={`${translate(language, 'theme')}: ${translate(language, theme === 'dark' ? 'lightTheme' : 'darkTheme')}`}
            title={translate(language, theme === 'dark' ? 'lightTheme' : 'darkTheme')}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            <span>{translate(language, theme === 'dark' ? 'lightTheme' : 'darkTheme')}</span>
          </button>
          <div className="language-switch" role="group" aria-label={translate(language, 'language')}>
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

      <div className="progress-content">
        <section className="progress-hero">
          <div>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          <button className="progress-refresh" type="button" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw size={14} className={refreshing ? 'is-spinning' : ''} />
            {t.refresh}
          </button>
        </section>

        {error && <div className="progress-error">{error}</div>}

        {!backfill ? (
          <div className="progress-empty">{t.noData}</div>
        ) : (
          <>
            <section className="monitor-grid" aria-label={t.pipeline}>
              <article className="monitor-card monitor-card--primary">
                <span>{t.yesterday}</span>
                <strong className={`monitor-status monitor-status--${yesterday?.status ?? 'pending'}`}>
                  {yesterday ? dailyStatusLabel(language, yesterday.status) : t.pending}
                </strong>
                <small>{formatDate(yesterdayDate, language)}</small>
              </article>

              <article className="monitor-card">
                <span>{t.pipeline}</span>
                <strong>{pipelineState}</strong>
                <small>{t.activeRuns}: {activeRuns}</small>
              </article>

              <article className="monitor-card">
                <span>{t.latestCompleted}</span>
                <strong>{formatDate(lastCompleted?.date, language)}</strong>
                <small>{formatTime(lastCompleted?.lastFinishedAt, language)}</small>
              </article>

              <article className="monitor-card">
                <span>{t.recentCoverage}</span>
                <strong>{recentCompleted} / {recentSeven.length || 7}</strong>
                <small>{t.findings}: {recentFindings}</small>
              </article>

              <article className="monitor-card">
                <span>{t.writes}</span>
                <strong>{recentWrites}</strong>
                <small>{t.lastPoll}: {formatTime(status?.researchPipeline?.lastPoll, language)}</small>
              </article>
            </section>

            <section className="progress-daily-section">
              <div className="progress-section-heading">
                <div>
                  <h2>{t.operationalHistory}</h2>
                  <p>{t.operationalHelp}</p>
                </div>
                <div className="progress-window-switch" role="group" aria-label={t.operationalHistory}>
                  {([7, 14, 30] as WindowDays[]).map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={windowDays === days ? 'active' : ''}
                      aria-pressed={windowDays === days}
                      onClick={() => setWindowDays(days)}
                    >
                      {days}
                    </button>
                  ))}
                </div>
              </div>

              {visibleDailyDays.length === 0 ? (
                <div className="progress-empty">{t.noDailyDays}</div>
              ) : (
                <div className="progress-daily-table" role="table" aria-label={t.operationalHistory}>
                  <div className="progress-daily-row progress-daily-row--head" role="row">
                    <span role="columnheader">{t.date}</span>
                    <span role="columnheader">{t.status}</span>
                    <span role="columnheader">{t.lastRun}</span>
                    <span role="columnheader">{t.runs}</span>
                    <span role="columnheader">{t.findingsColumn}</span>
                    <span role="columnheader">{t.writesColumn}</span>
                  </div>
                  {visibleDailyDays.map((day) => {
                    const marker = day.date === today ? t.today : day.date === yesterdayDate ? t.yesterdayShort : null;
                    const writes = day.attackWriteCount + day.incidentWriteCount;
                    return (
                      <div className={`progress-daily-row progress-daily-row--${day.status}`} role="row" key={day.date}>
                        <strong role="cell">
                          {formatDate(day.date, language)}
                          {marker && <small className="date-marker">{marker}</small>}
                        </strong>
                        <span role="cell">
                          <i className={`progress-daily-status progress-daily-status--${day.status}`}>
                            {dailyStatusLabel(language, day.status)}
                          </i>
                          {day.lastError && day.status === 'failed' ? (
                            <small className="progress-row-error" title={day.lastError}>{day.lastError}</small>
                          ) : null}
                        </span>
                        <span role="cell">{formatTime(day.lastFinishedAt ?? day.lastStartedAt, language)}</span>
                        <span role="cell">{day.attempts}</span>
                        <span role="cell">{day.findingCount}</span>
                        <span role="cell">{writes}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={`historical-summary ${historicalComplete ? '' : 'historical-summary--warning'}`}>
              <div>
                <span className="historical-eyebrow">{t.historical}</span>
                <h2>{historicalComplete ? t.historicalComplete : t.historicalIncomplete}</h2>
                <p>{historicalComplete ? t.historicalHelpComplete : t.historicalHelpIncomplete}</p>
              </div>
              <div className="historical-metrics">
                <div>
                  <span>{t.historicalRange}</span>
                  <strong>{formatDate(backfill.from, language)} — {formatDate(backfill.to, language)}</strong>
                </div>
                <div>
                  <span>{t.historicalProcessed}</span>
                  <strong>{backfill.completed} / {backfill.total}</strong>
                </div>
                <div>
                  <span>{t.historicalRemaining}</span>
                  <strong>{historicalRemaining}</strong>
                </div>
                <div>
                  <span>{t.indexedArchive}</span>
                  <strong>{archive?.indexedDays ?? 0}</strong>
                </div>
                <div>
                  <span>{t.lastAccepted}</span>
                  <strong>{formatTime(backfill.lastAcceptedAt, language)}</strong>
                </div>
              </div>
            </section>

            <footer className="progress-footer">
              <span>{t.lastPoll}: <strong>{formatTime(status?.researchPipeline?.lastPoll, language)}</strong></span>
              <span>{t.pageUpdated}: <strong>{formatTime(browserUpdatedAt, language)}</strong></span>
              <span>{t.auto}</span>
              <small>{t.statusNote}</small>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
