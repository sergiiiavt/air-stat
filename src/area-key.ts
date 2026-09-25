import { areaKey as canonicalKey } from '../shared/area-identity.mjs';
import type { Incident, Scope } from './types/domain';

export { canonicalAreaName } from '../shared/area-identity.mjs';

export function areaKey(scope: Scope, area: string) {
  return canonicalKey(scope, area);
}

export function incidentAreaKey(incident: Pick<Incident, 'scope' | 'district'>) {
  return areaKey(incident.scope, incident.district);
}
