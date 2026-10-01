import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MapPinned } from 'lucide-react';
import maplibregl, { LngLatBounds, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { EXACT_ADDRESS_PRECISION, isMappableIncident, type AreaAggregate } from '../aggregation';
import { incidentAreaKey } from '../area-key';
import { translate, type Language } from '../i18n';
import { incidentNarrative, localizeAreaName, localizedIncidentArea } from '../localized-content';
import type { Theme } from '../theme';
import type { Incident, ScopeFilter } from '../types/domain';

interface Props {
  incidents: Incident[];
  areas: AreaAggregate[];
  scope: ScopeFilter;
  language: Language;
  theme: Theme;
  showHeatmap?: boolean;
  selectedArea: string | null;
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  onSelectArea: (area: string | null) => void;
  onShowTimeline: () => void;
  onToggleHeatmap?: () => void;
  onClearSelection: () => void;
}

const KYIV_DISTRICTS_SOURCE_ID = 'kyiv-districts';
const KYIV_DISTRICTS_FILL_ID = 'kyiv-districts-fill';
const KYIV_DISTRICTS_LINE_ID = 'kyiv-districts-line';
const KYIV_DISTRICTS_URL =
  'https://gisserver.kyivcity.gov.ua/mayno/rest/services/adge/Dilnyci/FeatureServer/2/query?where=1%3D1&outFields=name_2&returnGeometry=true&f=geojson';

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

  if (map.getLayer(KYIV_DISTRICTS_FILL_ID)) {
    map.setPaintProperty(
      KYIV_DISTRICTS_FILL_ID,
      'fill-color',
      theme === 'dark' ? '#d9e7f2' : '#38566d',
    );
    map.setPaintProperty(
      KYIV_DISTRICTS_FILL_ID,
      'fill-opacity',
      theme === 'dark' ? 0.035 : 0.025,
    );
  }

  if (map.getLayer(KYIV_DISTRICTS_LINE_ID)) {
    map.setPaintProperty(
      KYIV_DISTRICTS_LINE_ID,
      'line-color',
      theme === 'dark' ? '#d9e7f2' : '#38566d',
    );
    map.setPaintProperty(
      KYIV_DISTRICTS_LINE_ID,
      'line-opacity',
      theme === 'dark' ? 0.48 : 0.38,
    );
  }
}

function setDistrictVisibility(map: MapLibreMap, scope: ScopeFilter) {
  const visibility = scope === 'kyiv-oblast' ? 'none' : 'visible';
  if (map.getLayer(KYIV_DISTRICTS_FILL_ID)) {
    map.setLayoutProperty(KYIV_DISTRICTS_FILL_ID, 'visibility', visibility);
  }
  if (map.getLayer(KYIV_DISTRICTS_LINE_ID)) {
    map.setLayoutProperty(KYIV_DISTRICTS_LINE_ID, 'visibility', visibility);
  }
}

const camera = (scope: ScopeFilter) =>
  scope === 'kyiv-city'
    ? { center: [30.5234, 50.4501] as [number, number], zoom: 9.8 }
    : { center: [30.3, 50.25] as [number, number], zoom: 7.7 };

export function MapPanel({
  incidents,
  areas,
  scope,
  language,
  theme,
  selectedArea,
  selectedIncidentId,
  onSelectIncident,
  onSelectArea,
  onShowTimeline,
  onClearSelection,
}: Props) {
  const [unavailable, setUnavailable] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  const handlersRef = useRef({ onSelectArea, onSelectIncident, onClearSelection });
  handlersRef.current = { onSelectArea, onSelectIncident, onClearSelection };

  const visibleAreas = useMemo(
    () =>
      areas.filter(
        (area) =>
          area.lat !== null && area.lng !== null && (!selectedArea || area.key === selectedArea),
      ),
    [areas, selectedArea],
  );

  const visibleIncidents = useMemo(
    () =>
      incidents.filter(
        (incident) =>
          isMappableIncident(incident) &&
          (!selectedArea || incidentAreaKey(incident) === selectedArea),
      ),
    [incidents, selectedArea],
  );

  const exactAddressIncidents = useMemo(
    () => visibleIncidents.filter((incident) => incident.precision === EXACT_ADDRESS_PRECISION),
    [visibleIncidents],
  );

  const selectedAreaWithoutLocation = useMemo(() => {
    if (!selectedArea) return null;
    const area = areas.find((candidate) => candidate.key === selectedArea);
    return area && area.mappedCount === 0 ? area : null;
  }, [areas, selectedArea]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const initial = camera(scope);
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
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
            [KYIV_DISTRICTS_SOURCE_ID]: {
              type: 'geojson',
              data: KYIV_DISTRICTS_URL,
              attribution: 'Kyiv City GIS',
            },
          },
          layers: [
            {
              id: 'osm',
              type: 'raster',
              source: 'osm',
              paint: rasterPaint(theme),
            },
            {
              id: KYIV_DISTRICTS_FILL_ID,
              type: 'fill',
              source: KYIV_DISTRICTS_SOURCE_ID,
              layout: { visibility: scope === 'kyiv-oblast' ? 'none' : 'visible' },
              paint: {
                'fill-color': theme === 'dark' ? '#d9e7f2' : '#38566d',
                'fill-opacity': theme === 'dark' ? 0.035 : 0.025,
              },
            },
            {
              id: KYIV_DISTRICTS_LINE_ID,
              type: 'line',
              source: KYIV_DISTRICTS_SOURCE_ID,
              layout: { visibility: scope === 'kyiv-oblast' ? 'none' : 'visible' },
              paint: {
                'line-color': theme === 'dark' ? '#d9e7f2' : '#38566d',
                'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.7, 11, 1.4],
                'line-opacity': theme === 'dark' ? 0.48 : 0.38,
              },
            },
          ],
        },
      });
    } catch {
      container.replaceChildren();
      setUnavailable(true);
      return;
    }

    try {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      mapRef.current = map;
    } catch {
      map.remove();
      container.replaceChildren();
      setUnavailable(true);
      return;
    }

    const handleContextLost = () => setUnavailable(true);
    const handleContextRestored = () => setUnavailable(false);
    map.on('webglcontextlost', handleContextLost);
    map.on('webglcontextrestored', handleContextRestored);

    const clearOnBackgroundClick = () => handlersRef.current.onClearSelection();
    map.on('click', clearOnBackgroundClick);

    let resizeFrame = 0;
    const scheduleResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => map.resize());
    };
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleResize);

    resizeObserver?.observe(container);
    map.once('load', scheduleResize);
    scheduleResize();

    return () => {
      resizeObserver?.disconnect();
      cancelAnimationFrame(resizeFrame);
      map.off('click', clearOnBackgroundClick);
      map.off('load', scheduleResize);
      map.off('webglcontextlost', handleContextLost);
      map.off('webglcontextrestored', handleContextRestored);
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

    const updateScope = () => {
      const next = camera(scope);
      setDistrictVisibility(map, scope);
      map.easeTo({ center: next.center, zoom: next.zoom, duration: 400 });
    };

    if (map.isStyleLoaded()) {
      updateScope();
      return;
    }

    map.once('load', updateScope);
    return () => {
      map.off('load', updateScope);
    };
  }, [scope]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    for (const area of visibleAreas) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `aggregate-marker${area.killed > 0 ? ' aggregate-marker--fatal' : area.injured > 0 ? ' aggregate-marker--injured' : ''}${selectedArea === area.key ? ' aggregate-marker--selected' : ''}`;
      button.textContent = String(area.incidentCount);
      button.setAttribute(
        'aria-label',
        `${localizeAreaName(area.area, language)}: ${area.incidentCount}`,
      );
      button.setAttribute('aria-pressed', selectedArea === area.key ? 'true' : 'false');
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        handlersRef.current.onSelectArea(selectedArea === area.key ? null : area.key);
      });

      markersRef.current.push(
        new Marker({ element: button })
          .setLngLat([area.lng as number, area.lat as number])
          .addTo(map),
      );
    }

    for (const incident of exactAddressIncidents) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `incident-marker incident-marker--${incident.kind}${selectedIncidentId === incident.id ? ' incident-marker--selected' : ''}`;
      button.setAttribute(
        'aria-label',
        `${localizedIncidentArea(incident, language)}: ${incidentNarrative(incident, language)}`,
      );
      button.setAttribute('aria-pressed', selectedIncidentId === incident.id ? 'true' : 'false');
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        handlersRef.current.onSelectIncident(incident.id);
      });

      markersRef.current.push(
        new Marker({ element: button })
          .setLngLat([incident.lng as number, incident.lat as number])
          .addTo(map),
      );
    }
  }, [exactAddressIncidents, language, selectedArea, selectedIncidentId, visibleAreas]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const focusIncidents = selectedIncidentId
      ? visibleIncidents.filter((incident) => incident.id === selectedIncidentId)
      : visibleIncidents;

    const points = focusIncidents.map(
      (incident) => [incident.lng as number, incident.lat as number] as [number, number],
    );

    if (!points.length) return;

    if (points.length === 1) {
      map.easeTo({
        center: points[0],
        zoom: selectedIncidentId ? 12 : selectedArea ? 11 : 9,
        duration: 450,
      });
      return;
    }

    const bounds = new LngLatBounds(points[0], points[0]);
    points.slice(1).forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, {
      padding: 70,
      maxZoom: selectedArea ? 11.5 : 9.5,
      duration: 450,
    });
  }, [selectedArea, selectedIncidentId, visibleIncidents]);

  return (
    <>
      <div className="map" ref={containerRef} />

      {!unavailable && (
        <>
          {selectedArea && (
            <button type="button" className="map-back" onClick={onClearSelection}>
              <ArrowLeft size={13} /> {translate(language, 'allAreas')}
            </button>
          )}

          {selectedAreaWithoutLocation && (
            <div className="map-notice" role="status">
              <MapPinned size={15} />
              <span>
                {localizeAreaName(selectedAreaWithoutLocation.area, language)}
                {' — '}
                {translate(language, 'areaNotOnMap')}
              </span>
            </div>
          )}

          <div className="map-legend">
            <span>
              <i className="legend-aggregate">#</i>
              {translate(language, 'aggregateMarkerMeaning')}
            </span>
            <span>
              <i className="legend-bubble" />
              {translate(language, 'exactAddressMarkerMeaning')}
            </span>
          </div>
        </>
      )}

      {unavailable && (
        <div className="map-unavailable" role="status">
          <h2>{translate(language, 'mapUnavailable')}</h2>
          <p>{translate(language, 'mapUnavailableHelp')}</p>
          <button type="button" onClick={onShowTimeline}>
            {translate(language, 'timelineView')}
          </button>
        </div>
      )}
    </>
  );
}
