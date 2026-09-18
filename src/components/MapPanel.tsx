import { useEffect, useRef } from 'react';
import maplibregl, { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import type { Incident, Scope } from '../types/domain';

interface Props {
  incidents: Incident[];
  scope: Scope;
}

const camera = (scope: Scope) =>
  scope === 'kyiv-city'
    ? { center: [30.5234, 50.4501] as [number, number], zoom: 10.2 }
    : { center: [30.3, 50.25] as [number, number], zoom: 7.8 };

function popupFor(incident: Incident) {
  const root = document.createElement('div');
  root.className = 'map-popup';

  const title = document.createElement('strong');
  title.textContent = incident.district;

  const summary = document.createElement('span');
  summary.textContent = incident.summary;

  const casualties = document.createElement('small');
  casualties.textContent = `${incident.killed} killed · ${incident.injured} injured`;

  root.append(title, summary, casualties);
  return root;
}

export function MapPanel({ incidents, scope }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

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
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
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
    map.easeTo({ center: next.center, zoom: next.zoom, duration: 450 });
  }, [scope]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());

    markersRef.current = incidents
      .filter(
        (incident): incident is Incident & { lat: number; lng: number } =>
          typeof incident.lat === 'number' && typeof incident.lng === 'number',
      )
      .map((incident) => {
        const markerButton = document.createElement('button');
        markerButton.type = 'button';
        markerButton.className = `impact-marker impact-marker--${incident.kind}`;
        markerButton.setAttribute('aria-label', `${incident.district}: ${incident.summary}`);

        return new Marker({ element: markerButton })
          .setLngLat([incident.lng, incident.lat])
          .setPopup(new Popup({ offset: 18, closeButton: false }).setDOMContent(popupFor(incident)))
          .addTo(map);
      });
  }, [incidents]);

  return <div className="map" ref={containerRef} />;
}
