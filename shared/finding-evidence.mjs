// Evidence policy applied to normalized research findings.
//
// A Google News RSS item is a headline plus a redirect link; the publisher
// article is never read. Per the project's research rules, search snippets and
// headlines are not sufficient evidence for a physical incident or casualty
// count. A finding supported only by such discovery-only candidates may still
// confirm that an attack happened, but it cannot create an incident or set
// casualties. (Production 21 Nov 2026: headline-only findings produced six
// city-level duplicates, one of them a misdated 19 Nov embassy report.)

export function isHeadlineOnlyFinding(finding, candidates) {
  const indexes = Array.isArray(finding?.sourceIndexes) ? finding.sourceIndexes : [];
  if (!indexes.length) return false;
  return indexes.every((index) => candidates[index]?.discoveryOnly === true);
}

export function applyHeadlineOnlyPolicy(finding, candidates) {
  if (!isHeadlineOnlyFinding(finding, candidates)) return finding;
  return {
    ...finding,
    attackKilled: null,
    attackInjured: null,
    attackCasualtyStatus: 'unknown',
    hasIncident: false,
    incidentKey: '',
    publicLocationText: '',
    publicLocationSpecificity: 'none',
    incidentSummary: '',
    incidentKilled: null,
    incidentInjured: null,
    incidentCasualtyStatus: 'unknown',
    damage: [],
    confidence: 'low',
  };
}

// Classifies why a raw model finding was rejected. "drop" reasons carry no
// usable fact (an empty non-incident entry, or no valid supporting source,
// which the extraction rules already forbid, or an event on another date in a
// historical job), so the rest of the batch can be
// kept. Any other reason aborts the scan so the date is retried instead of
// silently losing an incident.
// 'event-date-mismatch' only occurs in historical research: a finding about a
// different date is outside that date's job and is researched on its own date.
export const DROPPABLE_FINDING_REASONS = new Set(['empty-finding', 'no-valid-source', 'event-date-mismatch']);

export function summarizeInvalidFindings(reasons) {
  const counts = new Map();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts.entries()].map(([reason, count]) => `${reason}×${count}`).join(', ');
}
