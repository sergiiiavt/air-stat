/**
 * One administrative unit reaches the archive under several English spellings
 * ("Brovary raion" and "Brovarskyi raion" are the same raion). Both render
 * under the identical Ukrainian label, so without normalisation they become
 * two aggregates: two map dots with the same name, each holding part of the
 * incidents. Worker, dashboard and validators all resolve area names here so
 * one place decides what counts as the same area.
 */

/**
 * @typedef {'city' | 'oblast' | 'raion' | 'district' | 'settlement' | 'hromada'} AreaLevel
 * @typedef {{ canonical: string, uk: string, level: AreaLevel, aliases?: string[] }} AreaDefinition
 */

/** @type {AreaDefinition[]} */
export const AREA_DEFINITIONS = [
  { canonical: 'Kyiv', uk: 'Київ', level: 'city', aliases: ['Kyiv City'] },
  { canonical: 'Kyiv Oblast', uk: 'Київська область', level: 'oblast' },

  { canonical: 'Darnytskyi district', uk: 'Дарницький район', level: 'district', aliases: ['Darntyskyi district'] },
  { canonical: 'Desnianskyi district', uk: 'Деснянський район', level: 'district' },
  { canonical: 'Dniprovskyi district', uk: 'Дніпровський район', level: 'district' },
  { canonical: 'Holosiivskyi district', uk: 'Голосіївський район', level: 'district' },
  { canonical: 'Obolonskyi district', uk: 'Оболонський район', level: 'district' },
  { canonical: 'Pecherskyi district', uk: 'Печерський район', level: 'district' },
  { canonical: 'Podilskyi district', uk: 'Подільський район', level: 'district' },
  { canonical: 'Shevchenkivskyi district', uk: 'Шевченківський район', level: 'district' },
  { canonical: 'Solomianskyi district', uk: 'Солом’янський район', level: 'district' },
  { canonical: 'Sviatoshynskyi district', uk: 'Святошинський район', level: 'district' },

  { canonical: 'Bilotserkivskyi raion', uk: 'Білоцерківський район', level: 'raion', aliases: ['Bila Tserkva raion'] },
  { canonical: 'Boryspilskyi raion', uk: 'Бориспільський район', level: 'raion', aliases: ['Boryspil raion'] },
  { canonical: 'Brovarskyi raion', uk: 'Броварський район', level: 'raion', aliases: ['Brovary raion', 'Brovaryskyi raion'] },
  { canonical: 'Buchanskyi raion', uk: 'Бучанський район', level: 'raion', aliases: ['Bucha raion'] },
  { canonical: 'Fastivskyi raion', uk: 'Фастівський район', level: 'raion', aliases: ['Fastiv raion'] },
  { canonical: 'Obukhivskyi raion', uk: 'Обухівський район', level: 'raion', aliases: ['Obukhiv raion'] },
  { canonical: 'Vyshhorodskyi raion', uk: 'Вишгородський район', level: 'raion', aliases: ['Vyshhorod raion'] },

  { canonical: 'Zghurivska hromada', uk: 'Згурівська громада', level: 'hromada' },

  { canonical: 'Bila Tserkva', uk: 'Біла Церква', level: 'settlement' },
  { canonical: 'Boiarka', uk: 'Боярка', level: 'settlement', aliases: ['Boyarka'] },
  { canonical: 'Boryspil', uk: 'Бориспіль', level: 'settlement' },
  { canonical: 'Brovary', uk: 'Бровари', level: 'settlement' },
  { canonical: 'Bucha', uk: 'Буча', level: 'settlement' },
  { canonical: 'Chabany', uk: 'Чабани', level: 'settlement' },
  { canonical: 'Fastiv', uk: 'Фастів', level: 'settlement' },
  { canonical: 'Hlevakha', uk: 'Глеваха', level: 'settlement' },
  { canonical: 'Hostomel', uk: 'Гостомель', level: 'settlement' },
  { canonical: 'Irpin', uk: 'Ірпінь', level: 'settlement' },
  { canonical: 'Kotsiubynske', uk: 'Коцюбинське', level: 'settlement' },
  { canonical: 'Novi Petrivtsi', uk: 'Нові Петрівці', level: 'settlement' },
  { canonical: 'Obukhiv', uk: 'Обухів', level: 'settlement' },
  { canonical: 'Petropavlivska Borshchahivka', uk: 'Петропавлівська Борщагівка', level: 'settlement' },
  { canonical: 'Slavutych', uk: 'Славутич', level: 'settlement' },
  { canonical: 'Sofiivska Borshchahivka', uk: 'Софіївська Борщагівка', level: 'settlement' },
  { canonical: 'Ukrainka', uk: 'Українка', level: 'settlement' },
  { canonical: 'Vasylkiv', uk: 'Васильків', level: 'settlement' },
  { canonical: 'Vyshhorod', uk: 'Вишгород', level: 'settlement' },
  { canonical: 'Vyshneve', uk: 'Вишневе', level: 'settlement' },
];

function normalize(value) {
  return String(value ?? '')
    .replace(/[‘’ʼ]/g, '’')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Every spelling — canonical, Ukrainian and alias — that resolves to a definition. */
const LOOKUP = new Map();
for (const definition of AREA_DEFINITIONS) {
  for (const spelling of [definition.canonical, definition.uk, ...(definition.aliases ?? [])]) {
    LOOKUP.set(normalize(spelling), definition);
  }
}

/** The canonical English name for an area, or the tidied input when it is unknown. */
export function canonicalAreaName(value) {
  const known = LOOKUP.get(normalize(value));
  if (known) return known.canonical;
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

/** English and Ukrainian labels for an area, or null when the area is unknown. */
export function localizedAreaNames(value) {
  const known = LOOKUP.get(normalize(value));
  if (!known) return null;
  return { en: known.canonical, uk: known.uk };
}

/** The administrative level of an area, or null when the area is unknown. */
export function areaLevel(value) {
  return LOOKUP.get(normalize(value))?.level ?? null;
}

/** True when the name is already the canonical spelling of a known area. */
export function isCanonicalAreaName(value) {
  const known = LOOKUP.get(normalize(value));
  return Boolean(known) && known.canonical === String(value ?? '').trim();
}

/** True when the archive recognises this spelling at all. */
export function isKnownAreaName(value) {
  return LOOKUP.has(normalize(value));
}

/**
 * The identity a map dot, an area row and an incident filter all agree on.
 * Scope stays part of the key because Kyiv city and the oblast are separate
 * datasets that can carry the same settlement name.
 */
export function areaKey(scope, area) {
  return `${scope}:${canonicalAreaName(area)}`;
}
