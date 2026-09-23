import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Database,
  Languages,
  Moon,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { getProgress, type ApiStatus } from './api';
import { BrandMark } from './components/BrandMark';
import { detectLanguage, translate, type Language } from './i18n';
import { applyTheme, detectTheme, type Theme } from './theme';
import './progress.css';

type Backfill = NonNullable<ApiStatus['researchBackfill']>;
type BackfillDay = NonNullable<Backfill['days']>[number];

const copy = {
  en: {
    title: 'Data collection progress',
    subtitle: 'Live view of the six-month publication replay and imported research archive.',
    back: 'Back to statistics',
    completed: 'Completed',
    remaining: 'Remaining',
    active: 'Replay state',
    ready: 'Ready',
    blocked: 'Blocked',
    stale: 'Stalled',
    completeState: 'Complete',
    issues: 'Needs attention',
    archive: 'Indexed archive',
    days: 'days',
    lastCompleted: 'Last completed publication day',
    next: 'Next publication days',
    queue: 'Publication replay calendar',
    queueHelp: 'Each square is one publication date. This is queue progress, not a claim that an attack happened on that date.',
    archiveTitle: 'Imported research archive',
    archiveHelp: 'Event-date files already imported into D1. This metric is intentionally different from publication replay coverage.',
    firstDate: 'First indexed date',
    lastDate: 'Latest indexed date',
    imported: 'Last imported',
    queueUpdated: 'Replay updated',
    backendPolled: 'Backend polled',
    browserUpdated: 'Page refreshed',
    auto: 'Auto-refresh every 15 seconds',
    refresh: 'Refresh now',
    noData: 'Backfill status is not available yet.',
    failed: 'Failed',
    retry: 'Retry',
    review: 'Needs review',
    pending: 'Pending',
    inProgress: 'In progress',
    done: 'Completed',
    sourceNote: 'The progress endpoint refreshes the small GitHub replay cursor before returning status. A replay that has not advanced within its stale threshold is shown as stalled.' ,
    attempts: 'attempts',
    loadError: 'Unable to load progress.',
  },
  uk: {
    title: 'Прогрес збору даних',
    subtitle: 'Динамічний стан шестимісячного повторного опрацювання публікацій та імпортованого архіву досліджень.',
    back: 'Назад до статистики',
    completed: 'Завершено',
    remaining: 'Залишилось',
    active: 'Стан реплею',
    ready: 'Готовий',
    blocked: 'Заблоковано',
    stale: 'Застопорився',
    completeState: 'Завершено',
    issues: 'Потребує уваги',
    archive: 'Архів у D1',
    days: 'днів',
    lastCompleted: 'Останній завершений день публікацій',
    next: 'Наступні дні публікацій',
    queue: 'Календар повторного опрацювання публікацій',
    queueHelp: 'Кожен квадрат — один день публікацій. Це прогрес черги, а не твердження, що цього дня була атака.',
    archiveTitle: 'Імпортований архів досліджень',
    archiveHelp: 'Файли за датами подій, уже імпортовані в D1. Цей показник навмисно відрізняється від покриття повторного опрацювання публікацій.',
    firstDate: 'Перша дата в архіві',
    lastDate: 'Остання дата в архіві',
    imported: 'Останній імпорт',
    queueUpdated: 'Реплей оновлено',
    backendPolled: 'Сервер перевірив',
    browserUpdated: 'Сторінку оновлено',
    auto: 'Автооновлення кожні 15 секунд',
    refresh: 'Оновити зараз',
    noData: 'Статус історичного опрацювання поки недоступний.',
    failed: 'Помилка',
    retry: 'Повтор',
    review: 'На перевірці',
    pending: 'Очікує',
    inProgress: 'В роботі',
    done: 'Завершено',
    sourceNote: 'Сторінка прогресу перед відповіддю оновлює компактний cursor реплею з GitHub. Якщо cursor не просунувся в межах допустимого часу, стан показується як застопорений.',
    attempts: 'спроб',
    loadError: 'Не вдалося завантажити прогрес.',
  },
} as const;

function formatDate(value: string | null | undefined, language: Language) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
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
  return new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Europe/Kyiv',
  }).format(date);
}

function groupByMonth(days: BackfillDay[]) {
  const groups = new Map<string, BackfillDay[]>();
  for (const day of days) {
    const month = day.date.slice(0, 7);
    const list = groups.get(month) ?? [];
    list.push(day);
    groups.set(month, list);
  }
  return [...groups.entries()];
}

function statusLabel(language: Language, status: BackfillDay['status']) {
  const t = copy[language];
  const labels = {
    completed: t.done,
    in_progress: t.inProgress,
    retry: t.retry,
    needs_review: t.review,
    failed: t.failed,
    pending: t.pending,
  };
  return labels[status];
}

export default function ProgressPage() {
  const [language, setLanguage] = useState<Language>(() => detectLanguage());
  const [theme, setTheme] = useState<Theme>(() => detectTheme());
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [browserUpdatedAt, setBrowserUpdatedAt] = useState<string | null>(null);
  const t = copy[language];

  const refresh = async () => {
    setRefreshing(true);
    try {
      const next = await getProgress();
      setStatus(next);
      setError(null);
      setBrowserUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      setError(copy[language].loadError);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    window.localStorage.setItem('air-alert-language', language);
    document.documentElement.lang = language;
    document.title = language === 'uk'
      ? 'Прогрес збору даних — Air Alert Stat'
      : 'Data collection progress — Air Alert Stat';
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem('air-alert-theme', theme);
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const backfill = status?.researchBackfill ?? null;
  const archive = status?.researchArchive ?? null;
  const groupedDays = useMemo(() => groupByMonth(backfill?.days ?? []), [backfill?.days]);
  const remaining = backfill ? Math.max(0, backfill.total - backfill.completed) : 0;
  const replayState = backfill
    ? backfill.stale
      ? t.stale
      : backfill.pipelineStatus === 'blocked'
        ? t.blocked
        : backfill.pipelineStatus === 'complete'
          ? t.completeState
          : backfill.pipelineStatus === 'retry'
            ? t.retry
            : t.ready
    : '—';
  const issueCount = backfill
    ? backfill.retry + backfill.needs_review + backfill.failed + (backfill.stale ? 1 : 0)
    : 0;

  return (
    <main className="progress-page">
      <header className="progress-topbar">
        <div className="brand">
          <span className="brand-mark"><BrandMark /></span>
          <div>
            <strong>Air Alert Stat</strong>
            <small>{t.title}</small>
          </div>
        </div>

        <div className="progress-topbar-actions">
          <a className="progress-back" href="/">
            <ArrowLeft size={14} /> {t.back}
          </a>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            <span>{translate(language, theme === 'dark' ? 'lightTheme' : 'darkTheme')}</span>
          </button>
          <div className="language-switch">
            <Languages size={14} />
            <button type="button" className={language === 'uk' ? 'active' : ''} onClick={() => setLanguage('uk')}>УКР</button>
            <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
          </div>
        </div>
      </header>

      <div className="progress-content">
        <section className="progress-hero">
          <div>
            <small>{t.queue}</small>
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
            <section className="progress-overview">
              <div className="progress-primary">
                <div className="progress-percent">
                  <strong>{backfill.completionPercent.toFixed(1)}%</strong>
                  <span>{backfill.completed} / {backfill.total} {t.days}</span>
                </div>
                <div className="progress-track" aria-label={`${backfill.completionPercent}%`}>
                  <span style={{ width: `${Math.min(100, Math.max(0, backfill.completionPercent))}%` }} />
                </div>
                <div className="progress-range">
                  <span>{formatDate(backfill.from, language)}</span>
                  <span>{formatDate(backfill.to, language)}</span>
                </div>
              </div>

              <div className="progress-metrics">
                <div><CheckCircle2 size={16} /><span>{t.completed}</span><strong>{backfill.completed}</strong></div>
                <div><CalendarDays size={16} /><span>{t.remaining}</span><strong>{remaining}</strong></div>
                <div className={backfill.stale ? 'has-issues' : ''}><RefreshCw size={16} /><span>{t.active}</span><strong className="progress-state">{replayState}</strong></div>
                <div className={issueCount ? 'has-issues' : ''}><AlertTriangle size={16} /><span>{t.issues}</span><strong>{issueCount}</strong></div>
                <div><Database size={16} /><span>{t.archive}</span><strong>{archive?.indexedDays ?? 0}</strong></div>
              </div>
            </section>

            <section className="progress-now">
              <div>
                <span>{t.lastCompleted}</span>
                <strong>{formatDate(backfill.lastCompletedDate, language)}</strong>
              </div>
              <div>
                <span>{t.next}</span>
                <strong>{backfill.nextDates.length ? backfill.nextDates.map((date) => formatDate(date, language)).join(' · ') : '—'}</strong>
              </div>
            </section>

            <section className="progress-calendar-section">
              <div className="progress-section-heading">
                <div>
                  <h2>{t.queue}</h2>
                  <p>{t.queueHelp}</p>
                </div>
                <div className="progress-legend">
                  {(['completed', 'in_progress', 'retry', 'needs_review', 'failed', 'pending'] as const).map((item) => (
                    <span key={item}><i className={`progress-dot progress-dot--${item}`} />{statusLabel(language, item)}</span>
                  ))}
                </div>
              </div>

              <div className="progress-months">
                {groupedDays.map(([month, days]) => (
                  <section className="progress-month" key={month}>
                    <h3>{new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    }).format(new Date(`${month}-15T12:00:00Z`))}</h3>
                    <div className="progress-days">
                      {days.map((day) => (
                        <div
                          className={`progress-day progress-day--${day.status}`}
                          key={day.date}
                          title={`${formatDate(day.date, language)} · ${statusLabel(language, day.status)} · ${t.attempts}: ${day.attempts}`}
                        >
                          <span>{Number(day.date.slice(-2))}</span>
                          <small>{statusLabel(language, day.status)}</small>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section className="progress-archive-card">
              <div>
                <h2>{t.archiveTitle}</h2>
                <p>{t.archiveHelp}</p>
              </div>
              <div className="progress-archive-metrics">
                <div><span>{t.firstDate}</span><strong>{formatDate(archive?.firstDate, language)}</strong></div>
                <div><span>{t.lastDate}</span><strong>{formatDate(archive?.lastDate, language)}</strong></div>
                <div><span>{t.archive}</span><strong>{archive?.indexedDays ?? 0} {t.days}</strong></div>
                <div><span>{t.imported}</span><strong>{formatTime(archive?.lastImportedAt, language)}</strong></div>
              </div>
            </section>

            <footer className="progress-footer">
              <span>{t.queueUpdated}: <strong>{formatTime(backfill.updatedAt, language)}</strong></span>
              <span>{t.backendPolled}: <strong>{formatTime(status?.researchPipeline?.backfillLastPoll, language)}</strong></span>
              <span>{t.browserUpdated}: <strong>{formatTime(browserUpdatedAt, language)}</strong></span>
              <span>{t.auto}</span>
              <small>{t.sourceNote}</small>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
