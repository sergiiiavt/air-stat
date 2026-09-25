import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MapPinned } from 'lucide-react';
import maplibregl, { GeoJSONSource, LngLatBounds, Map as MapLibreMap, Marker } from 'maplibre-gl';
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
  showHeatmap: boolean;
  selectedArea: string | null;
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  onSelectArea: (area: string | null) => void;
  onShowTimeline: () => void;
  onToggleHeatmap: () => void;
  onClearSelection: () => void;
}

const HEAT_SOURCE_ID = 'incident-heat-source';
const HEAT_LAYER_ID = 'incident-heat-layer';

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

const camera = (scope: ScopeFilter) =>
  scope === 'kyiv-city'
    ? { center: [30.5234, 50.4501] as [number, number], zoom: 9.8 }
    : { center: [30.3, 50.25] as [number, number], zoom: 7.7 };

function heatmapData(incidents: Incident[]) {
  return {
    type: 'FeatureCollection' as const,
    features: incidents.map((incident) => ({
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
  areas,
  scope,
  language,
  theme,
  showHeatmap,
  selectedArea,
  selectedIncidentId,
  onSelectIncident,
  onSelectArea,
  onShowTimeline,
  onToggleHeatmap,
  onClearSelection,
}: Props) {
  const [unavailable, setUnavailable] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  // Held in refs so a parent re-render — the status poll ticks every 30s —
  // does not tear down and rebuild every marker on the map.
  const handlersRef = useRef({ onSelectArea, onSelectIncident, onClearSelection });
  handlersRef.current = { onSelectArea, onSelectIncident, onClearSelection };

  /**
   * Selecting an area narrows the map to that area alone, so what the map shows
   * and what the incident list shows are always the same set of incidents.
   */
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

  // An area published only at city or oblast level has no dot to select, so the
  // map says why it looks empty instead of leaving a blank canvas.
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
            [HEAT_SOURCE_ID]: {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: [],
              },
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
              id: HEAT_LAYER_ID,
              type: 'heatmap',
              source: HEAT_SOURCE_ID,
              maxzoom: 15,
              paint: {
                'heatmap-weight': ['get', 'weight'],
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 6, 0.7, 11, 1.5],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 22, 11, 42],
                'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.72, 13, 0.48],
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
    } catch {
      // A disabled WebGL context must not take down the statistics and lists.
      container.replaceChildren();
      setUnavailable(true);
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;

    // A context lost after startup leaves an empty canvas behind, so availability
    // has to follow the live context rather than only the constructor.
    const handleContextLost = () => setUnavailable(true);
    const handleContextRestored = () => setUnavailable(false);
    map.on('webglcontextlost', handleContextLost);
    map.on('webglcontextrestored', handleContextRestored);

    // Clicking the map itself — never a marker, those stop propagation — is the
    // most direct way back out of a selection.
    const clearOnBackgroundClick = () => handlersRef.current.onClearSelection();
    map.on('click', clearOnBackgroundClick);

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

    const next = camera(scope);
    map.easeTo({ center: next.center, zoom: next.zoom, duration: 400 });
  }, [scope]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateHeatmap = () => {
      const source = map.getSource(HEAT_SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(heatmapData(visibleIncidents));

      if (map.getLayer(HEAT_LAYER_ID)) {
        map.setLayoutProperty(HEAT_LAYER_ID, 'visibility', showHeatmap ? 'visible' : 'none');
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
  }, [visibleIncidents, showHeatmap]);

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
        // Clicking the open area again is the shortest way back to all areas.
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

    // An area with no publishable coordinate has nothing to frame; leaving the
    // camera where it is beats flying somewhere unrelated.
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
          <div className="map-overlay-switch">
            <button
              type="button"
              className={showHeatmap ? 'active' : ''}
              aria-pressed={showHeatmap}
              onClick={onToggleHeatmap}
            >
              {translate(language, 'mapHeatmap')}
            </button>
          </div>

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
            {showHeatmap && (
              <span>
                <i className="heat-gradient" />
                {translate(language, 'heatmapDensity')}
              </span>
            )}
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
