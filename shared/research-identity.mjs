function normalizedText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\s+/gu, ' ')
    .trim();
}

function slugPart(value) {
  return normalizedText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40) || 'area';
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0));
    hash = (hash * prime) & mask;
  }
  return hash.toString(36).padStart(13, '0');
}

export function normalizeIncidentIdentity(value) {
  return normalizedText(value);
}

export function incidentEvidenceMatchKey(
  date,
  scope,
  areaName,
  impactType,
  sourceIndexes,
) {
  const sources = [...new Set(
    (Array.isArray(sourceIndexes) ? sourceIndexes : [])
      .map(Number)
      .filter(Number.isInteger),
  )].sort((a, b) => a - b);
  return [
    String(date),
    String(scope),
    normalizedText(areaName),
    normalizedText(impactType),
    sources.join(','),
  ].join('|');
}

export function legacyAutomatedIncidentExternalId(date, scope, areaName) {
  return `auto-incident-${String(date).replaceAll('-', '')}-${scope}-${slugPart(areaName)}`;
}

export function automatedIncidentExternalId(date, scope, areaName, incidentKey) {
  const normalizedKey = normalizeIncidentIdentity(incidentKey);
  if (!normalizedKey) {
    throw new Error('incidentKey is required for automated incident identity');
  }
  const base = `${date}|${scope}|${normalizedText(areaName)}|${normalizedKey}`;
  return `${legacyAutomatedIncidentExternalId(date, scope, areaName)}-${fnv1a64(base)}`;
}
