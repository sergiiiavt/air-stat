import type { Incident, Scope } from './types/domain';

export function areaKey(scope: Scope, area: string) {
  return `${scope}:${area}`;
}

export function incidentAreaKey(
  incident: Pick<Incident, 'scope' | 'district'>,
) {
  return areaKey(incident.scope, incident.district);
}
