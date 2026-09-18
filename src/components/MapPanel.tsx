import { useEffect, useMemo, useRef } from 'react';
import maplibregl, {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  Popup,
} from 'maplibre-gl';
import { translate, type Language } from '../i18n';
import type { AreaSummary, Incident, ScopeFilter } from '../types/domain';

export type MapMode = 'dots' | 'heatmap' | 'both';

interface Props {
  areas: AreaSummary[];
  incidents: Incident[];
  scope: ScopeFilter;
  language: Language;
  mapMode: MapMode;
  selectedArea: string | null;
  onSelectArea: (area: string | null) => void;
  onSelectIncident: (id: string) => void;
}

const HEAT_SOURCE_ID = 'incident-heat-source';
const HEAT_LAYER_ID = 'incident-heat-layer';

const camera = (scope: ScopeFilter) =>
  scope === 'kyiv-city'
    ? { center: [30.5234, 50.4501] as [number, number], zoom: 9.8 }
    : { center: [30.3, 50.25] as [number, number], zoom: 7.7 };

function areaPopup(area: AreaSummary, language: Language) {
  const root = document.createElement('div');
  root.className = 'map-popup';

  const title = document.createElement('strong');
  title.textContent = area.area;

  const stats = document.createElement('span');
  stats.textContent =
    `${area.incidentCount} ${translate(language, 'incidents').toLowerCase()} · ` +
    `${area.killed} ${translate(language, 'killed').toLowerCase()} · ` +
    `${area.injured} ${translate(language, 'injured').toLowerCase()}`;

  const hint = document.createElement('small');
  hint.textContent =
    language === 'uk'
      ? 'Натисніть маркер, щоб переглянути район'
      : 'Click marker to inspect this area';

  root.append(title, stats, hint);
  return root;
}

function incidentPopup(incident: Incident, language: Language) {
  const root = document.createElement('div');
  root.className = 'map-popup';

  const title = document.createElement('strong');
  title.textContent = incident.locationName || incident.district;

  const summary = document.createElement('span');
  summary.textContent = incident.summary;

  const stats = document.createElement('small');
  stats.textContent =
    `${incident.killed} ${translate(language, 'killed').toLowerCase()} · ` +
    `${incident.injured} ${translate(language, 'injured').toLowerCase()} · ` +
    `${incident.verification}`;

  const precision = document.createElement('small');
  const radius = incident.displayRadiusMeters > 0
    ? ` · ~${incident.displayRadiusMeters} m`
    : '';
  precision.textContent = `${translate(language, 'mapPrecision')}: ${incident.precision}${radius}`;

  root.append(title, summary, stats, precision);
  return root;
}

function heatmapData(incidents: Incident[]) {
  return {
    type: 'FeatureCollection' as const,
    features: incidents
      .filter(
        (incident) =>
          typeof incident.lat === 'number' &&
          typeof incident.lng === 'number',
      )
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
  areas,
  incidents,
  scope,
  language,
  mapMode,
  selectedArea,
  onSelectArea,
  onSelectIncident,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  const visibleIncidents = useMemo(
    () =>
      selectedArea
        ? incidents.filter((incident) => incident.district === selectedArea)
        : [],
    [incidents, selectedArea],
  );

  const heatIncidents = selectedArea ? visibleIncidents : incidents;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initial = camera(scope);
    const map = new maplibregl.Map({
      container: containerRef.current,
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
          { id: 'osm', type: 'raster', source: 'osm' },
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
    map.on('click', () => onSelectArea(null));
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
      if (selectedArea) {
        for (const incident of visibleIncidents) {
          if (typeof incident.lat !== 'number' || typeof incident.lng !== 'number') {
            continue;
          }

          const button = document.createElement('button');
          button.type = 'button';
          button.className =
            `incident-marker incident-marker--${incident.kind} precision-marker precision-marker--${incident.precision}`;
          button.dataset.radiusMeters = String(incident.displayRadiusMeters ?? 0);
          button.setAttribute(
            'aria-label',
            `${incident.district}: ${incident.summary}`,
          );
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            onSelectIncident(incident.id);
          });

          markersRef.current.push(
            new Marker({ element: button })
              .setLngLat([incident.lng, incident.lat])
              .setPopup(
                new Popup({ offset: 18, closeButton: false }).setDOMContent(
                  incidentPopup(incident, language),
                ),
              )
              .addTo(map),
          );
        }
      } else {
        for (const area of areas) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className =
            `area-marker ${area.killed > 0 ? 'area-marker--fatal' : area.injured > 0 ? 'area-marker--injured' : ''}`;
          button.textContent = String(area.incidentCount);
          button.setAttribute('aria-label', `${area.area}: ${area.incidentCount}`);
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            onSelectArea(area.area);
          });

          markersRef.current.push(
            new Marker({ element: button })
              .setLngLat([area.lng, area.lat])
              .setPopup(
                new Popup({ offset: 20, closeButton: false }).setDOMContent(
                  areaPopup(area, language),
                ),
              )
              .addTo(map),
          );
        }
      }
    }

    const points = selectedArea
      ? visibleIncidents
          .filter(
            (incident) =>
              typeof incident.lat === 'number' &&
              typeof incident.lng === 'number',
          )
          .map(
            (incident) =>
              [incident.lng as number, incident.lat as number] as [number, number],
          )
      : areas.map((area) => [area.lng, area.lat] as [number, number]);

    if (points.length === 1) {
      map.easeTo({
        center: points[0],
        zoom: selectedArea ? 11 : 9,
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
    areas,
    visibleIncidents,
    selectedArea,
    language,
    mapMode,
    onSelectArea,
    onSelectIncident,
  ]);

  return <div className="map" ref={containerRef} />;
}
