import { readFile } from 'node:fs/promises';

const path = new URL('../public/data/kyiv-districts.geojson', import.meta.url);
const raw = await readFile(path, 'utf8');
const data = JSON.parse(raw);

const expectedDistricts = new Set([
  'Голосіївський район',
  'Дарницький район',
  'Деснянський район',
  'Дніпровський район',
  'Оболонський район',
  'Печерський район',
  'Подільський район',
  'Святошинський район',
  "Солом'янський район",
  'Шевченківський район',
]);

if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
  throw new Error('Kyiv district map data must be a GeoJSON FeatureCollection.');
}

if (data.features.length !== expectedDistricts.size) {
  throw new Error(`Expected ${expectedDistricts.size} Kyiv districts, found ${data.features.length}.`);
}

const seenNames = new Set();
const seenIds = new Set();

function validateRing(ring, districtName) {
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new Error(`${districtName}: polygon ring must contain at least four positions.`);
  }

  for (const position of ring) {
    if (
      !Array.isArray(position) ||
      position.length < 2 ||
      !Number.isFinite(position[0]) ||
      !Number.isFinite(position[1])
    ) {
      throw new Error(`${districtName}: invalid coordinate.`);
    }

    const [lng, lat] = position;
    if (lng < 30.1 || lng > 31 || lat < 50.1 || lat > 50.8) {
      throw new Error(`${districtName}: coordinate ${lng},${lat} is outside the Kyiv sanity bounds.`);
    }
  }

  const first = ring[0];
  const last = ring.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new Error(`${districtName}: polygon ring is not closed.`);
  }
}

function validateGeometry(geometry, districtName) {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
    throw new Error(`${districtName}: geometry must be Polygon or MultiPolygon.`);
  }

  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0) {
    throw new Error(`${districtName}: geometry has no polygons.`);
  }

  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new Error(`${districtName}: polygon has no rings.`);
    }
    for (const ring of polygon) validateRing(ring, districtName);
  }
}

for (const feature of data.features) {
  if (feature?.type !== 'Feature') throw new Error('Map data contains a non-Feature entry.');

  const { id, name, oblast } = feature.properties ?? {};
  if (!expectedDistricts.has(name)) throw new Error(`Unexpected Kyiv district name: ${String(name)}`);
  if (seenNames.has(name)) throw new Error(`Duplicate Kyiv district name: ${name}`);
  if (typeof id !== 'string' || !id.startsWith('UA80')) throw new Error(`${name}: invalid KATOTTG id.`);
  if (seenIds.has(id)) throw new Error(`${name}: duplicate KATOTTG id ${id}.`);
  if (oblast !== 'UA80') throw new Error(`${name}: expected oblast UA80.`);

  validateGeometry(feature.geometry, name);
  seenNames.add(name);
  seenIds.add(id);
}

for (const name of expectedDistricts) {
  if (!seenNames.has(name)) throw new Error(`Missing Kyiv district: ${name}`);
}

console.log(`Validated ${data.features.length} Kyiv district polygons.`);
