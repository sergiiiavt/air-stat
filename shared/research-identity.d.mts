export function normalizeIncidentIdentity(value: unknown): string;
export function legacyAutomatedIncidentExternalId(
  date: string,
  scope: string,
  areaName: string,
): string;
export function automatedIncidentExternalId(
  date: string,
  scope: string,
  areaName: string,
  incidentKey: string,
): string;
