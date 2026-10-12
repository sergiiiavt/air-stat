import { useEffect, useState } from 'react';
import { getHistoricalProgress, type ApiStatus, type HistoricalProgress, type HistoryStatus } from '../api';
import type { Language } from '../i18n';

type Backfill = NonNullable<ApiStatus['researchBackfill']>;

const labels = {
  en: {
    title: 'Historical processing details',
    intro: 'All queued dates, retries and latest collection attempts. Processed means scanned, not independently verified.',
    show: 'Show details',
    hide: 'Hide details',
    health: 'Collector health',
    current: 'Current date',
    queued: 'Next queued dates',
    none: 'None at this moment',
    active: 'Active',
    stalled: 'Stalled',
    complete: 'Complete',
    pending: 'Pending',
    running: 'Running',
    retry: 'Retry',
    done: 'Processed',
    needs_review: 'Needs review',
    all: 'All statuses',
    status: 'Status',
    days: 'Historical dates',
    date: 'Date',
    attempts: 'Attempts',
    last: 'Last activity (Kyiv)',
    findings: 'Findings',
    outcome: 'Result',
    updated: 'Findings saved',
    noFindings: 'No findings (not verified)',
    runsTitle: 'Latest 12 historical attempts',
    discovered: 'Sources',
    writes: 'Writes',
    error: 'Error',
    success: 'Success',
    loadError: 'Historical details could not be loaded.',
    noRows: 'No dates match this filter.',
    previous: 'Previous',
    next: 'Next',
    page: 'Page',
    of: 'of',
    noAttempts: 'No historical run records yet.',
  },
  uk: {
    title: 'Деталі історичного збору',
    intro: 'Усі дати черги, повторні спроби та останні запуски. Опрацьовано не означає незалежно перевірено.',
    show: 'Показати деталі',
    hide: 'Приховати деталі',
    health: 'Стан збору',
    current: 'Поточна дата',
    queued: 'Наступні дати в черзі',
    none: 'Наразі немає',
    active: 'Активний',
    stalled: 'Зупинився',
    complete: 'Завершений',
    pending: 'Очікує',
    running: 'В роботі',
    retry: 'Повтор',
    done: 'Опрацьовано',
    needs_review: 'Потрібна перевірка',
    all: 'Всі статуси',
    status: 'Статус',
    days: 'Історичні дати',
    date: 'Дата',
    attempts: 'Спроби',
    last: 'Остання активність (Київ)',
    findings: 'Знахідки',
    outcome: 'Результат',
    updated: 'Дані збережено',
    noFindings: 'Нічого не знайдено (не перевірено)',
    runsTitle: 'Останні 12 історичних запусків',
    discovered: 'Джерела',
    writes: 'Записи',
    error: 'Помилка',
    success: 'Успішно',
    loadError: 'Не вдалося завантажити деталі історичного збору.',
    noRows: 'Для цього статусу дат немає.',
    previous: 'Назад',
    next: 'Далі',
    page: 'Сторінка',
    of: 'з',
    noAttempts: 'Історичних запусків ще немає.',
  },
} as const;

function kyivTime(value: string | null | undefined, language: Language) {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Kyiv', hour12: false,
  }).format(date);
}

export function HistoricalProgressDetails({
  backfill,
  language,
}: {
  backfill: Backfill;
  language: Language;
}) {
  const t = labels[language];
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<HistoryStatus>('all');
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<HistoricalProgress | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    const refresh = async () => {
      try {
        const next = await getHistoricalProgress(filter, page);
        if (active) {
          setDetails(next);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [expanded, filter, page]);

  const statuses: Array<Exclude<HistoryStatus, 'all'>> = [
    'running', 'retry', 'needs_review', 'pending', 'done',
  ];
  const counts = {
    running: backfill.in_progress,
    retry: backfill.retry,
    needs_review: backfill.needs_review,
    pending: backfill.pending,
    done: backfill.completed,
  };
  const pageCount = Math.max(1, Math.ceil((details?.total ?? 0) / (details?.pageSize ?? 40)));

  return (
    <section className="historical-details">
      <div className="historical-details-heading">
        <div>
          <h2>{t.title}</h2>
          <p>{t.intro}</p>
        </div>
        <button type="button" className="history-toggle"
          aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? t.hide : t.show}
        </button>
      </div>
      {expanded && (
        <>
          <div className="historical-health">
            <span><b>{t.health}:</b> {backfill.health === 'stalled' || backfill.stale ? t.stalled : backfill.health === 'complete' ? t.complete : t.active}</span>
            <span><b>{t.current}:</b> {backfill.current?.date ?? t.none}</span>
            <span><b>{t.queued}:</b> {backfill.nextDates.length ? backfill.nextDates.join(', ') : t.none}</span>
          </div>
          <div className="historical-status-counts">
            {statuses.map((status) => (
              <button type="button" key={status}
                className={'historical-count historical-count--' + status + (filter === status ? ' selected' : '')}
                aria-pressed={filter === status}
                onClick={() => { setFilter(status); setPage(1); }}>
                <span>{t[status]}</span>
                <strong>{counts[status]}</strong>
              </button>
            ))}
          </div>
          <div className="historical-details-subhead">
            <h3>{t.days}</h3>
            <label>
              {t.status}
              <select value={filter} onChange={(event) => { setFilter(event.target.value as HistoryStatus); setPage(1); }}>
                <option value="all">{t.all}</option>
                {statuses.map((status) => <option key={status} value={status}>{t[status]}</option>)}
              </select>
            </label>
          </div>
          {error && <p className="historical-detail-error" role="alert">{t.loadError}</p>}
          {details && (
            <>
              <div className="historical-table" role="table" aria-label={t.days}>
                <div className="historical-row historical-row--head" role="row">
                  <span role="columnheader">{t.date}</span>
                  <span role="columnheader">{t.status}</span>
                  <span role="columnheader">{t.attempts}</span>
                  <span role="columnheader">{t.findings}</span>
                  <span role="columnheader">{t.last}</span>
                </div>
                {details.days.map((day) => (
                  <div className="historical-row" role="row" key={day.date}>
                    <strong role="cell">{day.date}</strong>
                    <span role="cell">
                      <span className={'historical-state historical-state--' + day.status}>{t[day.status]}</span>
                      {day.outcome && <small>{day.outcome === 'updated' ? t.updated : t.noFindings}</small>}
                      {day.error && <small className="historical-detail-error" title={day.error}>{day.error}</small>}
                    </span>
                    <span role="cell">{day.attempts}</span>
                    <span role="cell">{day.findings}</span>
                    <span role="cell">{kyivTime(day.completedAt ?? day.startedAt, language)}</span>
                  </div>
                ))}
                {details.days.length === 0 && <div className="historical-empty">{t.noRows}</div>}
              </div>
              <nav className="historical-pagination" aria-label={t.days}>
                <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t.previous}</button>
                <span>{t.page} {page} {t.of} {pageCount} ({details.total})</span>
                <button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>{t.next}</button>
              </nav>
              <h3 className="historical-run-title">{t.runsTitle}</h3>
              {details.recentRuns.length === 0 ? (
                <p>{t.noAttempts}</p>
              ) : (
                <div className="historical-table" role="table" aria-label={t.runsTitle}>
                  <div className="historical-run-row historical-row--head" role="row">
                    <span role="columnheader">{t.date}</span>
                    <span role="columnheader">{t.status}</span>
                    <span role="columnheader">{t.last}</span>
                    <span role="columnheader">{t.discovered}</span>
                    <span role="columnheader">{t.findings}</span>
                    <span role="columnheader">{t.writes}</span>
                  </div>
                  {details.recentRuns.map((run, index) => (
                    <div className="historical-run-row" role="row" key={run.date + run.startedAt + index}>
                      <strong role="cell">{run.date}</strong>
                      <span role="cell">
                        <span className={'historical-state historical-state--' + run.status}>
                          {run.status === 'error' ? t.error : run.status === 'running' ? t.running : t.success}
                        </span>
                        {run.error && <small className="historical-detail-error" title={run.error}>{run.error}</small>}
                      </span>
                      <span role="cell">{kyivTime(run.finishedAt ?? run.startedAt, language)}</span>
                      <span role="cell">{run.discovered}</span>
                      <span role="cell">{run.findings}</span>
                      <span role="cell">{run.writes}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
