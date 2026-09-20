import { useEffect, useMemo, useRef } from 'react';
import maplibregl, {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
} from 'maplibre-gl';
import { translate, type Language } from '../i18n';
import type { Theme } from '../theme';
import type { Incident, ScopeFilter } from '../types/domain';

export type MapMode = 'dots' | 'heatmap' | 'both';

interface Props {
  incidents: Incident[];
  scope: ScopeFilter;
  language: Language;
  theme: Theme;
  mapMode: MapMode;
  selectedArea: string | null;
  selectedIncidentId: string | null;
  onSelectIncident: (id: string | null) => void;
}

const HEAT_SOURCE_ID = 'incident-heat-source';
const HEAT_LAYER_ID = 'incident-heat-layer';

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

function isMappablePrecision(precision: string) {
  return MAPPABLE_PRECISIONS.has(precision);
}

function rasterPaint(theme: Theme) {
  const dark = theme === 'dark';
  return {
    'raster-saturation': dark ? -0.78 : -0.08,
    'raster-brightness-min': dark ? 0.18 : 0,
    'raster-brightness-max': dark ? 0.68 : 1,
    'raster-contrast': dark ? 0.08 : 0,
    'raster-opacity': dark ? 0.86 : 1,
  };
}

function applyRasterTheme(map: MapLibreMap, theme: Theme) {
  if (!map.getLayer('osm')) return;
  const paint = rasterPaint(theme);
  for (const [property, value] of Object.entries(paint)) {
    map.setPaintProperty('osm', property, value);
  }
}

function isMappableIncident(incident: Incident) {
  return (
    typeof incident.lat === 'number' &&
    typeof incident.lng === 'number' &&
    isMappablePrecision(incident.precision)
  );
}

const camera = (scope: ScopeFilter) =>
  scope === 'kyiv-city'
    ? { center: [30.5234, 50.4501] as [number, number], zoom: 9.8 }
    : { center: [30.3, 50.25] as [number, number], zoom: 7.7 };

function heatmapData(incidents: Incident[]) {
  return {
    type: 'FeatureCollection' as const,
    features: incidents
      .filter(isMappableIncident)
      .map((incident) => ({
        type: 'Feature' as const,
        properties: {
          id: incident.id,
          weight: 1,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [incident.lng as number, incident.lat as number],
        },
      })),
  };
}

export function MapPanel({
  incidents,
  scope,
  language,
  theme,
  mapMode,
  selectedArea,
  selectedIncidentId,
  onSelectIncident,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  const visibleIncidents = useMemo(
    () =>
      selectedArea
        ? incidents.filter((incident) => incident.district === selectedArea)
        : incidents,
    [incidents, selectedArea],
  );

  const heatIncidents = visibleIncidents;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const initial = camera(scope);
    const map = new maplibregl.Map({
      container,
      center: initial.center,
      zoom: initial.zoom,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
          [HEAT_SOURCE_ID]: {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [],
            },
          },
        },
        layers: [
          { id: 'osm', type: 'raster', source: 'osm', paint: rasterPaint(theme) },
          {
            id: HEAT_LAYER_ID,
            type: 'heatmap',
            source: HEAT_SOURCE_ID,
            maxzoom: 15,
            paint: {
              'heatmap-weight': ['get', 'weight'],
              'heatmap-intensity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                6,
                0.7,
                11,
                1.5,
              ],
              'heatmap-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                6,
                22,
                11,
                42,
              ],
              'heatmap-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                6,
                0.72,
                13,
                0.48,
              ],
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(8,16,24,0)',
                0.18,
                'rgba(240,178,76,0.22)',
                0.4,
                'rgba(255,157,92,0.55)',
                0.68,
                'rgba(255,101,88,0.78)',
                1,
                'rgba(255,235,170,0.96)',
              ],
            },
          },
        ],
      },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'bottom-right',
    );
    map.on('click', () => {
      onSelectIncident(null);
    });
    mapRef.current = map;

    let resizeFrame = 0;
    const scheduleResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => map.resize());
    };
    const resizeObserver = new ResizeObserver(scheduleResize);

    resizeObserver.observe(container);
    map.once('load', scheduleResize);
    scheduleResize();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeFrame);
      map.off('load', scheduleResize);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateTheme = () => applyRasterTheme(map, theme);
    if (map.isStyleLoaded()) {
      updateTheme();
      return;
    }

    map.once('load', updateTheme);
    return () => {
      map.off('load', updateTheme);
    };
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const next = camera(scope);
    map.easeTo({ center: next.center, zoom: next.zoom, duration: 400 });
  }, [scope]);


  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateHeatmap = () => {
      const source = map.getSource(HEAT_SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(heatmapData(heatIncidents));

      if (map.getLayer(HEAT_LAYER_ID)) {
        map.setLayoutProperty(
          HEAT_LAYER_ID,
          'visibility',
          mapMode === 'dots' ? 'none' : 'visible',
        );
      }
    };

    if (map.isStyleLoaded()) {
      updateHeatmap();
      return;
    }

    map.once('load', updateHeatmap);
    return () => {
      map.off('load', updateHeatmap);
    };
  }, [heatIncidents, mapMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (mapMode !== 'heatmap') {
      for (const incident of visibleIncidents) {
        if (!isMappableIncident(incident)) {
          continue;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className =
          `incident-marker incident-marker--${incident.kind} precision-marker precision-marker--${incident.precision}${selectedIncidentId === incident.id ? ' incident-marker--selected' : ''}`;
        button.dataset.radiusMeters = String(incident.displayRadiusMeters ?? 0);
        button.setAttribute(
          'aria-label',
          `${incident.district}: ${incident.summary}`,
        );
        button.setAttribute(
          'aria-pressed',
          selectedIncidentId === incident.id ? 'true' : 'false',
        );
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelectIncident(incident.id);
        });

        markersRef.current.push(
          new Marker({ element: button })
            .setLngLat([incident.lng as number, incident.lat as number])
            .addTo(map),
        );
      }
    }

    const points = visibleIncidents
      .filter(isMappableIncident)
      .map(
        (incident) =>
          [incident.lng as number, incident.lat as number] as [number, number],
      );

    if (points.length === 1) {
      map.easeTo({
        center: points[0],
        zoom: selectedArea || selectedIncidentId ? 11 : 9,
        duration: 450,
      });
    } else if (points.length > 1) {
      const bounds = new LngLatBounds(points[0], points[0]);
      points.slice(1).forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, {
        padding: 70,
        maxZoom: selectedArea ? 11.5 : 9.5,
        duration: 450,
      });
    }
  }, [
    visibleIncidents,
    selectedArea,
    selectedIncidentId,
    mapMode,
    onSelectIncident,
  ]);

  return <div className="map" ref={containerRef} />;
}
