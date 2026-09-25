import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Moon, RefreshCw, Sun } from 'lucide-react';
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
    subtitle: 'Event dates researched and research added to the archive.',
    back: 'Back to statistics',
    completed: 'Completed',
    remaining: 'Remaining',
    active: 'Collection',
    ready: 'Running',
    stale: 'Stalled',
    completeState: 'Complete',
    issues: 'Needs attention',
    archive: 'Indexed archive',
    days: 'days',
    lastCompleted: 'Last completed date',
    next: 'Working on',
    expires: 'Until',
    lastAccepted: 'Last result accepted',
    reviewCount: 'Dates needing review',
    queue: 'Dates researched',
    queueHelp:
      'Each square is one event date. This is collection progress, not a claim that an attack happened on that date.',
    archiveTitle: 'Imported research archive',
    archiveHelp:
      'Dates with recorded events. A researched date with no confirmed consequence keeps no file, so these differ from the dates researched above.',
    firstDate: 'First indexed date',
    lastDate: 'Latest indexed date',
    imported: 'Last imported',
    queueUpdated: 'Collection updated',
    backendPolled: 'Backend polled',
    browserUpdated: 'Page refreshed',
    auto: 'Auto-refresh every 15 seconds',
    refresh: 'Refresh now',
    noData: 'Collection status is not available yet.',
    failed: 'Failed',
    retry: 'Retry',
    review: 'Needs review',
    pending: 'Pending',
    inProgress: 'In progress',
    done: 'Completed',
    sourceNote:
      'Updates may take about a minute to appear. A pause of more than six hours is marked as stalled.',
    attempts: 'attempts',
    outcomeLabel: 'result',
    errorLabel: 'last error',
    loadError: 'Unable to load progress.',
  },
  uk: {
    title: 'Прогрес збору даних',
    subtitle: 'Опрацьовані дати подій та зібрані дані про події.',
    back: 'Назад до статистики',
    completed: 'Завершено',
    remaining: 'Залишилось',
    active: 'Стан збору',
    ready: 'Працює',
    stale: 'Застопорився',
    completeState: 'Завершено',
    issues: 'Потребує уваги',
    archive: 'Днів в архіві',
    days: 'днів',
    lastCompleted: 'Остання завершена дата',
    next: 'У роботі',
    expires: 'До',
    lastAccepted: 'Останній прийнятий результат',
    reviewCount: 'Дати на перевірку',
    queue: 'Опрацьовані дати',
    queueHelp:
      'Кожен квадрат — одна дата події. Це прогрес збору, а не твердження, що цього дня була атака.',
    archiveTitle: 'Імпортований архів досліджень',
    archiveHelp:
      'Дати зафіксованих подій. Опрацьована дата без підтверджених наслідків не має файлу, тому ці дати відрізняються від опрацьованих вище.',
    firstDate: 'Перша дата в архіві',
    lastDate: 'Остання дата в архіві',
    imported: 'Останній імпорт',
    queueUpdated: 'Збір оновлено',
    backendPolled: 'Сервер перевірив',
    browserUpdated: 'Сторінку оновлено',
    auto: 'Автооновлення кожні 15 секунд',
    refresh: 'Оновити зараз',
    noData: 'Статус збору поки недоступний.',
    failed: 'Помилка',
    retry: 'Повтор',
    review: 'На перевірці',
    pending: 'Очікує',
    inProgress: 'В роботі',
    done: 'Завершено',
    sourceNote:
      'Зміни можуть з’являтися із затримкою близько хвилини. Пауза понад шість годин позначається як зупинка збору.',
    attempts: 'спроб',
    outcomeLabel: 'результат',
    errorLabel: 'остання помилка',
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

// Monday-first column for one date. Derived per cell rather than offsetting only
// the first one, so a queue with a gap or out-of-order dates cannot silently
// shift every later day into the wrong weekday.
function weekdayColumn(date: string) {
  return ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
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
    document.title =
      language === 'uk'
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
      : backfill.pipelineStatus === 'complete'
        ? t.completeState
        : t.ready
    : '—';
  const issueCount = backfill
    ? backfill.retry + backfill.needs_review + backfill.failed + (backfill.stale ? 1 : 0)
    : 0;

  const dayTooltip = (day: BackfillDay) => {
    const parts = [
      formatDate(day.date, language),
      statusLabel(language, day.status),
      `${t.attempts}: ${day.attempts}`,
    ];
    if (day.outcome) parts.push(`${t.outcomeLabel}: ${day.outcome}`);
    if (day.lastError) parts.push(`${t.errorLabel}: ${day.lastError}`);
    return parts.join(' · ');
  };

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
          <div
            className="language-switch"
            role="group"
            aria-label={translate(language, 'language')}
          >
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
          <button
            className="progress-refresh"
            type="button"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
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
                  <span>
                    {backfill.completed} / {backfill.total} {t.days}
                  </span>
                </div>
                {/* An empty cursor has no range to report, so the bar stays
                    indeterminate instead of declaring min === max === 0. */}
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={t.completed}
                  aria-valuemin={0}
                  aria-valuemax={backfill.total || undefined}
                  aria-valuenow={backfill.total ? backfill.completed : undefined}
                  aria-valuetext={`${backfill.completed} / ${backfill.total} ${t.days}`}
                >
                  <span
                    style={{
                      width: `${Math.min(100, Math.max(0, backfill.completionPercent))}%`,
                    }}
                  />
                </div>
                <div className="progress-range">
                  <span>{formatDate(backfill.from, language)}</span>
                  <span>{formatDate(backfill.to, language)}</span>
                </div>
              </div>

              <div className="progress-metrics">
                <div>
                  <span>{t.completed}</span>
                  <strong>{backfill.completed}</strong>
                </div>
                <div>
                  <span>{t.remaining}</span>
                  <strong>{remaining}</strong>
                </div>
                <div className={backfill.stale ? 'has-issues' : ''}>
                  <span>{t.active}</span>
                  <strong className="progress-state">{replayState}</strong>
                </div>
                <div className={issueCount ? 'has-issues' : ''}>
                  <span>{t.issues}</span>
                  <strong>{issueCount}</strong>
                </div>
                <div>
                  <span>{t.archive}</span>
                  <strong>{archive?.indexedDays ?? 0}</strong>
                </div>
              </div>
            </section>

            <section className="progress-now">
              <div>
                <span>{t.next}</span>
                <strong>
                  {backfill.current ? formatDate(backfill.current.date, language) : '—'}
                </strong>
              </div>
              <div>
                <span>{t.expires}</span>
                <strong>{formatTime(backfill.current?.expiresAt, language)}</strong>
              </div>
              <div>
                <span>{t.lastCompleted}</span>
                <strong>{formatDate(backfill.lastCompletedDate, language)}</strong>
              </div>
              <div>
                <span>{t.lastAccepted}</span>
                <strong>{formatTime(backfill.lastAcceptedAt, language)}</strong>
              </div>
              <div className={backfill.needs_review ? 'has-issues' : ''}>
                <span>{t.reviewCount}</span>
                <strong>{backfill.needs_review}</strong>
              </div>
            </section>

            <section className="progress-calendar-section">
              <div className="progress-section-heading">
                <div>
                  <h2>{t.queue}</h2>
                  <p>{t.queueHelp}</p>
                </div>
                <div className="progress-legend">
                  {(
                    [
                      'completed',
                      'in_progress',
                      'retry',
                      'needs_review',
                      'failed',
                      'pending',
                    ] as const
                  ).map((item) => (
                    <span key={item}>
                      <i className={`progress-dot progress-dot--${item}`} />
                      {statusLabel(language, item)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="progress-months">
                {groupedDays.map(([month, days]) => (
                  <section className="progress-month" key={month}>
                    <h3>
                      {new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'UTC',
                      }).format(new Date(`${month}-15T12:00:00Z`))}
                    </h3>
                    <div className="progress-weekdays" aria-hidden="true">
                      {Array.from({ length: 7 }, (_, day) => (
                        <span key={day}>
                          {new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
                            weekday: 'short',
                            timeZone: 'UTC',
                          }).format(new Date(Date.UTC(2026, 0, 5 + day)))}
                        </span>
                      ))}
                    </div>
                    <div className="progress-days">
                      {days.map((day) => (
                        <div
                          className={`progress-day progress-day--${day.status}`}
                          key={day.date}
                          style={{ gridColumnStart: weekdayColumn(day.date) }}
                          title={dayTooltip(day)}
                        >
                          <span>{Number(day.date.slice(-2))}</span>
                          <small className="sr-only">{statusLabel(language, day.status)}</small>
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
                <div>
                  <span>{t.firstDate}</span>
                  <strong>{formatDate(archive?.firstDate, language)}</strong>
                </div>
                <div>
                  <span>{t.lastDate}</span>
                  <strong>{formatDate(archive?.lastDate, language)}</strong>
                </div>
                <div>
                  <span>{t.archive}</span>
                  <strong>
                    {archive?.indexedDays ?? 0} {t.days}
                  </strong>
                </div>
                <div>
                  <span>{t.imported}</span>
                  <strong>{formatTime(archive?.lastImportedAt, language)}</strong>
                </div>
              </div>
            </section>

            <footer className="progress-footer">
              <span>
                {t.queueUpdated}: <strong>{formatTime(backfill.updatedAt, language)}</strong>
              </span>
              <span>
                {t.backendPolled}:{' '}
                <strong>{formatTime(status?.researchPipeline?.backfillLastPoll, language)}</strong>
              </span>
              <span>
                {t.browserUpdated}: <strong>{formatTime(browserUpdatedAt, language)}</strong>
              </span>
              <span>{t.auto}</span>
              <small>{t.sourceNote}</small>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
