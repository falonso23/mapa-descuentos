import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Merchant, MerchantLocation } from '../types';
import { coordGroupKey, spiralOffset } from '../lib/spiderfy';
import { MarkerIcon } from './MarkerIcon';
import { MerchantPopup, VIEW_CHAIN_ATTR } from './MerchantPopup';

const INITIAL_CENTER: [number, number] = [-56.164, -34.905];
const INITIAL_ZOOM = 12;
const MIN_ZOOM = 6.5;
const TILE_SUBDOMAINS = ['a', 'b', 'c', 'd'];
// Uruguay + un margen chico para no cortar la costa/frontera de golpe al hacer pan.
const URUGUAY_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-58.7, -35.3],
  [-52.7, -29.8],
];

export interface FocusRequest {
  key: string;
  lat: number;
  lng: number;
}

interface MarkerEntry {
  marker: maplibregl.Marker;
}

export function locationKey(merchantId: number, locationIndex: number) {
  return `${merchantId}:${locationIndex}`;
}

export function MapView({
  merchants,
  active = true,
  focusRequest,
  onViewChain,
}: {
  merchants: Merchant[];
  active?: boolean;
  focusRequest?: FocusRequest | null;
  onViewChain?: (merchant: Merchant) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: 'raster',
            tiles: TILE_SUBDOMAINS.map((s) => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`),
            tileSize: 256,
            attribution: '© OpenStreetMap © CARTO',
          },
        },
        layers: [{ id: 'carto-light', type: 'raster', source: 'carto' }],
      },
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: MIN_ZOOM,
      maxBounds: URUGUAY_BOUNDS,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // El pane de mapa se oculta con display:none al pasar a la vista de lista; maplibre no
  // recalcula el tamaño del canvas mientras está oculto, así que hay que pedírselo al volver.
  useEffect(() => {
    if (active) mapRef.current?.resize();
  }, [active]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    const clearMarkers = () => {
      for (const { marker } of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
    };

    const sync = () => {
      if (cancelled) return;
      clearMarkers();

      // Varios locales suelen geocodificar exactamente al mismo punto (ej. un shopping: cada
      // comercio resuelve a la dirección del edificio). Se agrupan por coordenada para poder
      // repartirlos en espiral y que ninguno quede tapado/inclickeable.
      interface Entry {
        merchant: Merchant;
        loc: MerchantLocation;
        locationIndex: number;
      }
      const groups = new Map<string, Entry[]>();
      for (const merchant of merchants) {
        merchant.locations.forEach((loc, locationIndex) => {
          if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
          const key = coordGroupKey(loc.lat, loc.lng);
          const group = groups.get(key);
          if (group) group.push({ merchant, loc, locationIndex });
          else groups.set(key, [{ merchant, loc, locationIndex }]);
        });
      }

      for (const group of groups.values()) {
        group.forEach(({ merchant, loc, locationIndex }, i) => {
          // Markers son puramente presentacionales (sin interactividad propia), así que se
          // renderizan a HTML estático en vez de montar un React root por pin: evita una
          // condición de carrera de React al desmontar/remontar cientos de roots en filtros rápidos.
          const el = document.createElement('div');
          el.className = 'marker-anchor';
          el.innerHTML = renderToStaticMarkup(
            <MarkerIcon category={merchant.category} providers={merchant.providers} />,
          );

          const popupHtml = renderToStaticMarkup(<MerchantPopup merchant={merchant} location={loc} />);
          const popup = new maplibregl.Popup({ offset: 18, maxWidth: '300px' }).setHTML(popupHtml);

          if (onViewChain) {
            popup.on('open', () => {
              const btn = popup.getElement()?.querySelector<HTMLButtonElement>(`[${VIEW_CHAIN_ATTR}]`);
              if (btn && !btn.dataset.bound) {
                btn.dataset.bound = '1';
                btn.addEventListener('click', () => onViewChain(merchant));
              }
            });
          }

          const marker = new maplibregl.Marker({ element: el, anchor: 'center', offset: spiralOffset(i) })
            .setLngLat([loc.lng, loc.lat])
            .setPopup(popup)
            .addTo(map);

          markersRef.current.set(locationKey(merchant.id, locationIndex), { marker });
        });
      }
    };

    if (map.isStyleLoaded()) sync();
    else map.once('load', sync);

    return () => {
      cancelled = true;
      map.off('load', sync);
      clearMarkers();
    };
  }, [merchants, onViewChain]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusRequest) return;
    map.flyTo({ center: [focusRequest.lng, focusRequest.lat], zoom: 16, duration: 600 });
    const entry = markersRef.current.get(focusRequest.key);
    if (entry && !entry.marker.getPopup()?.isOpen()) entry.marker.togglePopup();
  }, [focusRequest]);

  return <div ref={containerRef} className="map-container" />;
}
