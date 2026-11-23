// Alert-timing coverage per scope. A date before a scope's `from` has no
// stored alert intervals at all; blank charts there mean "no data", not "no
// alerts". Values reflect verified D1 contents (23 Nov 2026).
export const ALERT_COVERAGE = [
  {
    scope: 'kyiv-city',
    from: '2022-02-25',
    sources: [
      { key: 'kyiv_open_data', label: 'Kyiv Digital / Kyiv City open data', from: '2022-02-25', to: null },
      { key: 'alerts_in_ua', label: 'alerts.in.ua', from: '2026-09-16', to: null },
    ],
  },
  {
    scope: 'kyiv-oblast',
    from: '2022-03-15',
    sources: [
      {
        key: 'air_raid_sirens_dataset',
        label: 'National air-alert channel via ukrainian-air-raid-sirens-dataset',
        from: '2022-03-15',
        to: '2026-05-16',
      },
      { key: 'kova_telegram', label: 'KOVA Telegram', from: '2026-05-16', to: null },
      { key: 'alerts_in_ua', label: 'alerts.in.ua', from: '2026-09-16', to: null },
    ],
  },
];

// First date with alert-timing coverage for a scope filter; for "both" the
// later of the two starts, because earlier days are complete for one scope only.
export function alertCoverageStart(scopeFilter) {
  const starts = ALERT_COVERAGE
    .filter((entry) => scopeFilter === 'both' || entry.scope === scopeFilter)
    .map((entry) => entry.from);
  if (!starts.length) return null;
  return starts.sort().at(-1);
}

export function alertCoverageIncomplete(scopeFilter, from) {
  const start = alertCoverageStart(scopeFilter);
  return Boolean(start && from < start);
}
