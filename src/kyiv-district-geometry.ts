import { canonicalAreaName } from './area-key';

type Position = [number, number];
type LinearRing = Position[];
type PolygonCoordinates = LinearRing[];

interface PolygonGeometry {
  type: 'Polygon';
  coordinates: PolygonCoordinates;
}

interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: PolygonCoordinates[];
}

interface DistrictFeature {
  type: 'Feature';
  properties?: { name?: string | null };
  geometry?: PolygonGeometry | MultiPolygonGeometry | null;
}

interface DistrictFeatureCollection {
  type: 'FeatureCollection';
  features?: DistrictFeature[];
}

function ringSignedArea2(ring: LinearRing) {
  let area2 = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area2 += current[0] * next[1] - next[0] * current[1];
  }
  return area2;
}

function ringCentroid(ring: LinearRing): Position | null {
  if (ring.length < 3) return null;

  let area2 = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    area2 += cross;
    x += (current[0] + next[0]) * cross;
    y += (current[1] + next[1]) * cross;
  }

  if (Math.abs(area2) < 1e-12) {
    const points = ring.slice(0, -1).length ? ring.slice(0, -1) : ring;
    if (!points.length) return null;
    const sum = points.reduce(
      (acc, point) => [acc[0] + point[0], acc[1] + point[1]] as Position,
      [0, 0] as Position,
    );
    return [sum[0] / points.length, sum[1] / points.length];
  }

  return [x / (3 * area2), y / (3 * area2)];
}

function pointInRing(point: Position, ring: LinearRing) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: Position, polygon: PolygonCoordinates) {
  if (!polygon.length || !pointInRing(point, polygon[0])) return false;
  return polygon.slice(1).every((hole) => !pointInRing(point, hole));
}

function polygonArea(polygon: PolygonCoordinates) {
  if (!polygon.length) return 0;
  const outer = Math.abs(ringSignedArea2(polygon[0]));
  const holes = polygon
    .slice(1)
    .reduce((sum, ring) => sum + Math.abs(ringSignedArea2(ring)), 0);
  return Math.max(0, outer - holes) / 2;
}

function polygonBounds(polygon: PolygonCoordinates) {
  const ring = polygon[0] ?? [];
  if (!ring.length) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return { minLng, maxLng, minLat, maxLat };
}

function fallbackInteriorPoint(polygon: PolygonCoordinates, preferred: Position | null): Position | null {
  const bounds = polygonBounds(polygon);
  if (!bounds) return null;

  const center: Position = [
    (bounds.minLng + bounds.maxLng) / 2,
    (bounds.minLat + bounds.maxLat) / 2,
  ];
  if (pointInPolygon(center, polygon)) return center;

  const target = preferred ?? center;
  let best: Position | null = null;
  let bestDistance = Infinity;
  const divisions = 24;
  for (let xIndex = 1; xIndex < divisions; xIndex += 1) {
    const lng = bounds.minLng + ((bounds.maxLng - bounds.minLng) * xIndex) / divisions;
    for (let yIndex = 1; yIndex < divisions; yIndex += 1) {
      const lat = bounds.minLat + ((bounds.maxLat - bounds.minLat) * yIndex) / divisions;
      const candidate: Position = [lng, lat];
      if (!pointInPolygon(candidate, polygon)) continue;
      const distance = (lng - target[0]) ** 2 + (lat - target[1]) ** 2;
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }

  return best;
}

function polygonRepresentativePoint(polygon: PolygonCoordinates): Position | null {
  const centroid = ringCentroid(polygon[0] ?? []);
  if (centroid && pointInPolygon(centroid, polygon)) return centroid;
  return fallbackInteriorPoint(polygon, centroid);
}

function geometryRepresentativePoint(geometry: PolygonGeometry | MultiPolygonGeometry): Position | null {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const polygon = [...polygons].sort((a, b) => polygonArea(b) - polygonArea(a))[0];
  return polygon ? polygonRepresentativePoint(polygon) : null;
}

export async function loadKyivDistrictRepresentativePoints(
  url = '/data/kyiv-districts.geojson',
): Promise<Map<string, Position>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load Kyiv district geometry: ${response.status}`);

  const collection = (await response.json()) as DistrictFeatureCollection;
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('Kyiv district geometry is not a valid FeatureCollection');
  }

  const points = new Map<string, Position>();
  for (const feature of collection.features) {
    const name = feature.properties?.name;
    const geometry = feature.geometry;
    if (!name || !geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) continue;

    const point = geometryRepresentativePoint(geometry);
    if (!point) continue;
    points.set(canonicalAreaName(name), point);
  }

  return points;
}
