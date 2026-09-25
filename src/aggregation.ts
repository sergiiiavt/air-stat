import { canonicalAreaName, incidentAreaKey } from './area-key';
import type { Incident, Scope } from './types/domain';

/**
 * Every count the dashboard shows — the number on a map dot, the affected-area
 * rows, the incident-list header — is derived here from the same incident
 * array. Anything computed independently eventually drifts, and a dot that
 * disagrees with the list it opens is the one thing the map must never do.
 */

export interface AreaAggregate {
  key: string;
  area: string;
  scope: Scope;
  incidentCount: number;
  killed: number;
  injured: number;
  /** Incidents in the area that carry a coordinate precise enough to publish. */
  mappedCount: number;
  lat: number | null;
  lng: number | null;
  incidentIds: string[];
}

/** Precisions the project is willing to draw as a point on the map. */
const MAPPABLE_PRECISIONS = new Set([
  'district-centroid',
  'raion-centroid',
  'hromada-centroid',
  'settlement-centroid',
  'neighborhood-centroid',
  'street-segment',
  'address-generalized',
  'address-point',
]);

/** Area-level centroids: the honest place to anchor an aggregate dot. */
const AGGREGATE_ANCHOR_PRECISIONS = new Set([
  'district-centroid',
  'raion-centroid',
  'hromada-centroid',
  'settlement-centroid',
  'neighborhood-centroid',
]);

export const EXACT_ADDRESS_PRECISION = 'address-point';

export function isMappableIncident(incident: Incident) {
  return (
    typeof incident.lat === 'number' &&
    typeof incident.lng === 'number' &&
    MAPPABLE_PRECISIONS.has(incident.precision)
  );
}

/**
 * Guards the UI against an incident arriving twice. A duplicated id repeats a
 * React key, and React then leaves the stale card in the DOM when the list is
 * filtered, so unrelated incidents appear under the selected area.
 */
export function dedupeIncidents(incidents: Incident[]): Incident[] {
  const seen = new Set<string>();
  const out: Incident[] = [];

  for (const incident of incidents) {
    if (seen.has(incident.id)) continue;
    seen.add(incident.id);
    out.push(incident);
  }

  return out;
}

/**
 * Picks the coordinate an aggregate dot sits on: the most frequently published
 * area centroid. Averaging instead would place the dot where nothing happened
 * whenever an area mixes distant points.
 */
function anchorCoordinate(members: Incident[]) {
  const preferred = members.filter((incident) => AGGREGATE_ANCHOR_PRECISIONS.has(incident.precision));
  const candidates = preferred.length ? preferred : members;
  if (!candidates.length) return null;

  const tally = new Map<string, { lat: number; lng: number; count: number; order: number }>();
  for (const [order, incident] of candidates.entries()) {
    const key = `${incident.lat},${incident.lng}`;
    const current = tally.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    tally.set(key, {
      lat: incident.lat as number,
      lng: incident.lng as number,
      count: 1,
      order,
    });
  }

  return [...tally.values()].sort((a, b) => b.count - a.count || a.order - b.order)[0];
}

export function buildAreaAggregates(incidents: Incident[]): AreaAggregate[] {
  const groups = new Map<string, { scope: Scope; area: string; members: Incident[] }>();

  for (const incident of incidents) {
    const key = incidentAreaKey(incident);
    const current = groups.get(key) ?? {
      scope: incident.scope,
      area: canonicalAreaName(incident.district),
      members: [],
    };
    current.members.push(incident);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const mapped = group.members.filter(isMappableIncident);
      const anchor = anchorCoordinate(mapped);

      return {
        key,
        area: group.area,
        scope: group.scope,
        incidentCount: group.members.length,
        killed: group.members.reduce((sum, incident) => sum + incident.killed, 0),
        injured: group.members.reduce((sum, incident) => sum + incident.injured, 0),
        mappedCount: mapped.length,
        lat: anchor?.lat ?? null,
        lng: anchor?.lng ?? null,
        incidentIds: group.members.map((incident) => incident.id),
      };
    })
    .sort(
      (a, b) =>
        b.incidentCount - a.incidentCount ||
        b.injured - a.injured ||
        a.key.localeCompare(b.key),
    );
}
