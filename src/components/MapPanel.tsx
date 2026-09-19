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

function isMappableIncident(incident: Incident) {
  return (
    typeof incident.lat === 'number' &&
    typeof incident.lng === 'number' &&
    isMappablePrecision(incident.precision)
  );
}

function isMappableArea(
  area: AreaSummary,
): area is AreaSummary & { lat: number; lng: number } {
  return (
    typeof area.lat === 'number' &&
    typeof area.lng === 'number' &&
    isMappablePrecision(area.precision)
  );
}

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
      ? 'Район вибрано. Натисніть окрему точку інциденту для повних деталей.'
      : 'Area selected. Click an individual incident dot for full details.';

  root.append(title, stats, hint);
  return root;
}

function incidentPopup(incident: Incident, language: Language) {
  const root = document.createElement('div');
  root.className = 'map-popup map-popup--incident';

  const title = document.createElement('strong');
  title.textContent = incident.locationName || incident.district;

  const meta = document.createElement('small');
  meta.className = 'map-popup__meta';
  const date = new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${incident.date}T12:00:00Z`));
  const time = incident.occurredAt
    ? new Intl.DateTimeFormat(language === 'uk' ? 'uk-UA' : 'en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Kyiv',
      }).format(new Date(incident.occurredAt))
    : null;
  meta.textContent = time ? `${date} · ${time}` : date;

  const summary = document.createElement('span');
  summary.className = 'map-popup__summary';
  summary.textContent = incident.summary;

  const stats = document.createElement('small');
  stats.className = 'map-popup__stats';
  stats.textContent =
    `${incident.killed} ${translate(language, 'killed').toLowerCase()} · ` +
    `${incident.injured} ${translate(language, 'injured').toLowerCase()} · ` +
    `${incident.verification}`;

  root.append(title, meta, summary, stats);

  if (incident.damage.length > 0) {
    const damage = document.createElement('div');
    damage.className = 'map-popup__section';

    const heading = document.createElement('small');
    heading.className = 'map-popup__section-title';
    heading.textContent = translate(language, 'damage');

    damage.append(heading);
    incident.damage.slice(0, 2).forEach((item) => {
      const row = document.createElement('span');
      row.textContent = item.description
        ? `${item.type}: ${item.description}`
        : item.type;
      damage.append(row);
    });
    root.append(damage);
  }

  if (incident.sources.length > 0) {
    const sources = document.createElement('div');
    sources.className = 'map-popup__section map-popup__sources';

    const heading = document.createElement('small');
    heading.className = 'map-popup__section-title';
    heading.textContent = translate(language, 'sources');
    sources.append(heading);

    incident.sources.slice(0, 3).forEach((source) => {
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = source.label;
      sources.append(link);
    });
    root.append(sources);
  }

  const precision = document.createElement('small');
  precision.className = 'map-popup__precision';
  const radius = incident.displayRadiusMeters > 0
    ? ` · ~${incident.displayRadiusMeters} m`
    : '';
  precision.textContent = `${translate(language, 'mapPrecision')}: ${incident.precision}${radius}`;

  const fullDetails = document.createElement('small');
  fullDetails.className = 'map-popup__detail-hint';
  fullDetails.textContent =
    language === 'uk'
      ? 'Повні деталі та докази відкрито в панелі.'
      : 'Full details and evidence are open in the panel.';

  root.append(precision, fullDetails);
  return root;
}

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
  const popupRef = useRef<Popup | null>(null);

  const visibleIncidents = useMemo(
    () =>
      selectedArea
        ? incidents.filter((incident) => incident.district === selectedArea)
        : [],
    [incidents, selectedArea],
  );

  const mappableAreas = useMemo(
    () => areas.filter(isMappableArea),
    [areas],
  );

  const heatIncidents = selectedArea ? visibleIncidents : incidents;

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
    map.on('click', () => {
      popupRef.current?.remove();
      popupRef.current = null;
      onSelectArea(null);
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
      popupRef.current?.remove();
      popupRef.current = null;
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
    popupRef.current?.remove();
    popupRef.current = null;
  }, [scope, language, mapMode]);

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
          if (!isMappableIncident(incident)) {
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
            popupRef.current?.remove();
            popupRef.current = new Popup({
              offset: 18,
              closeButton: true,
              closeOnClick: false,
              maxWidth: '320px',
            })
              .setLngLat([incident.lng as number, incident.lat as number])
              .setDOMContent(incidentPopup(incident, language))
              .addTo(map);
            onSelectIncident(incident.id);
          });

          markersRef.current.push(
            new Marker({ element: button })
              .setLngLat([incident.lng as number, incident.lat as number])
              .addTo(map),
          );
        }
      } else {
        for (const area of mappableAreas) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className =
            `area-marker ${area.killed > 0 ? 'area-marker--fatal' : area.injured > 0 ? 'area-marker--injured' : ''}`;
          button.textContent = String(area.incidentCount);
          button.setAttribute('aria-label', `${area.area}: ${area.incidentCount}`);
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            popupRef.current?.remove();
            popupRef.current = new Popup({
              offset: 20,
              closeButton: true,
              closeOnClick: false,
              maxWidth: '320px',
            })
              .setLngLat([area.lng, area.lat])
              .setDOMContent(areaPopup(area, language))
              .addTo(map);
            onSelectArea(area.area);
          });

          markersRef.current.push(
            new Marker({ element: button })
              .setLngLat([area.lng, area.lat])
              .addTo(map),
          );
        }
      }
    }

    const points = selectedArea
      ? visibleIncidents
          .filter(isMappableIncident)
          .map(
            (incident) =>
              [incident.lng as number, incident.lat as number] as [number, number],
          )
      : mappableAreas.map((area) => [area.lng, area.lat] as [number, number]);

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
    mappableAreas,
    visibleIncidents,
    selectedArea,
    language,
    mapMode,
    onSelectArea,
    onSelectIncident,
  ]);

  return <div className="map" ref={containerRef} />;
}
