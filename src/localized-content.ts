import { localizedAreaNames } from '../shared/area-identity.mjs';
import type { Language } from './i18n';
import { translate } from './i18n';
import type { DamageItem, Incident } from './types/domain';

const PRECISION = {
  'city-centroid': { en: 'city level', uk: 'рівень міста' },
  'oblast-centroid': { en: 'oblast level', uk: 'рівень області' },
  'district-centroid': { en: 'district level', uk: 'рівень району' },
  'raion-centroid': { en: 'raion level', uk: 'рівень району' },
  'hromada-centroid': { en: 'hromada level', uk: 'рівень громади' },
  'settlement-centroid': { en: 'settlement level', uk: 'рівень населеного пункту' },
  'neighborhood-centroid': { en: 'neighborhood level', uk: 'рівень місцевості' },
  'street-segment': { en: 'street segment', uk: 'ділянка вулиці' },
  'address-generalized': { en: 'generalized address', uk: 'узагальнена адреса' },
  'address-point': { en: 'address point', uk: 'адресна точка' },
} as const;

const DAMAGE_TYPES: Record<string, { en: string; uk: string }> = {
  building: { en: 'building', uk: 'будівля' },
  buildings: { en: 'buildings', uk: 'будівлі' },
  'private-house': { en: 'private house', uk: 'приватний будинок' },
  private_house: { en: 'private house', uk: 'приватний будинок' },
  'residential-building': { en: 'residential building', uk: 'житловий будинок' },
  'non-residential': { en: 'non-residential building', uk: 'нежитлова будівля' },
  vehicle: { en: 'vehicle', uk: 'транспортний засіб' },
  vehicles: { en: 'vehicles', uk: 'транспортні засоби' },
  warehouse: { en: 'warehouse', uk: 'склад' },
  infrastructure: { en: 'infrastructure', uk: 'інфраструктура' },
  'civilian-objects': { en: 'civilian property', uk: 'цивільні об’єкти' },
  'civilian property': { en: 'civilian property', uk: 'цивільні об’єкти' },
  'vegetation-fire': { en: 'vegetation', uk: 'рослинність' },
};

const CONTENT_COPY = {
  en: {
    locationFallback: 'Location in Kyiv region',
    damagedObject: 'damaged object',
    killed: 'Killed',
    injured: 'injured',
    damageRecorded: 'Damage recorded',
  },
  uk: {
    locationFallback: 'Локація в Київському регіоні',
    damagedObject: 'пошкоджений об’єкт',
    killed: 'Загиблі',
    injured: 'поранені',
    damageRecorded: 'Зафіксовано пошкодження',
  },
} as const;

function containsCyrillic(value: string) {
  return /[А-Яа-яІіЇїЄєҐґ]/.test(value);
}

function containsLatin(value: string) {
  return /[A-Za-z]/.test(value);
}

export function textMatchesLanguage(value: string, language: Language) {
  const cyrillic = containsCyrillic(value);
  const latin = containsLatin(value);
  if (language === 'uk') return cyrillic || !latin;
  return latin && !cyrillic;
}

export function localizeAreaName(value: string, language: Language) {
  const known = localizedAreaNames(value);
  if (known) return known[language];

  if (textMatchesLanguage(value, language)) return value;
  return CONTENT_COPY[language].locationFallback;
}

export function localizePrecision(value: string, language: Language) {
  return PRECISION[value as keyof typeof PRECISION]?.[language] ?? translate(language, 'unknown');
}

export function localizeDamageType(value: string, language: Language) {
  const normalized = value.trim().toLocaleLowerCase('en');
  return DAMAGE_TYPES[normalized]?.[language] ?? CONTENT_COPY[language].damagedObject;
}

export function incidentDamageType(
  incident: Incident,
  index: number,
  item: DamageItem,
  language: Language,
) {
  const localized = incident.localizations?.[language]?.damage?.[index]?.type?.trim();
  if (localized && textMatchesLanguage(localized, language)) return localized;
  return localizeDamageType(item.type, language);
}

export function incidentDamageDescription(
  incident: Incident,
  index: number,
  item: DamageItem,
  language: Language,
) {
  const localized = incident.localizations?.[language]?.damage?.[index]?.description?.trim();
  if (localized && textMatchesLanguage(localized, language)) return localized;

  const description = item.description?.trim();
  return description && textMatchesLanguage(description, language) ? description : null;
}

function localizedImpact(incident: Incident, language: Language) {
  const key = {
    impact: 'impact',
    debris: 'debris',
    'air-defense': 'airDefense',
    fire: 'fire',
    damage: 'damageKind',
    'no-confirmed-impact': 'noConfirmedImpact',
    unknown: 'unknown',
  }[incident.kind] as Parameters<typeof translate>[1];
  return translate(language, key);
}

export function incidentNarrative(incident: Incident, language: Language) {
  const localized = incident.localizations?.[language]?.summary?.trim();
  if (localized && textMatchesLanguage(localized, language)) return localized;

  const source = incident.summary?.trim();
  if (source && textMatchesLanguage(source, language)) return source;

  const copy = CONTENT_COPY[language];
  const parts = [
    localizedImpact(incident, language) + '.',
    `${copy.killed}: ${incident.killed}; ${copy.injured}: ${incident.injured}.`,
  ];

  if (incident.damage.length > 0) {
    const types = [...new Set(incident.damage.map((item) => localizeDamageType(item.type, language)))];
    parts.push(`${copy.damageRecorded}: ${types.join(', ')}.`);
  }

  return parts.join(' ');
}

export function localizedIncidentArea(incident: Incident, language: Language) {
  const localized = incident.localizations?.[language]?.areaName?.trim();
  if (localized && textMatchesLanguage(localized, language)) return localized;
  return localizeAreaName(incident.locationName || incident.district, language);
}

export function localizedReportedLocation(incident: Incident, language: Language) {
  const localized = incident.localizations?.[language]?.sourceLocationText?.trim();
  if (localized && textMatchesLanguage(localized, language)) return localized;

  const reported = incident.reportedLocation?.text?.trim();
  if (reported && textMatchesLanguage(reported, language)) return reported;
  return localizedIncidentArea(incident, language);
}
