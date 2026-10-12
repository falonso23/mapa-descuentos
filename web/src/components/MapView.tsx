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
// OpenFreeMap: tiles vectoriales de OSM sin API key ni registro. "positron" es el estilo claro
// y neutro, para que lo que resalte sean los pines.
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
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

// El ícono solo depende del rubro y los proveedores: se arma una vez por combinación.
const iconHtmlCache = new Map<string, string>();
function markerIconHtml(merchant: Merchant) {
  const key = `${merchant.category}|${merchant.providers.join(',')}`;
  let html = iconHtmlCache.get(key);
  if (html === undefined) {
    html = renderToStaticMarkup(<MarkerIcon category={merchant.category} providers={merchant.providers} />);
    iconHtmlCache.set(key, html);
  }
  return html;
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
      style: MAP_STYLE_URL,
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
          el.innerHTML = markerIconHtml(merchant);

          // El contenido del popup se arma recién al abrirlo: generar el HTML de los ~1.400 en
          // cada cambio de filtro trababa la interfaz.
          const popup = new maplibregl.Popup({ offset: 18, maxWidth: '300px' });
          let rendered = false;
          popup.on('open', () => {
            if (!rendered) {
              rendered = true;
              popup.setHTML(renderToStaticMarkup(<MerchantPopup merchant={merchant} location={loc} />));
            }
            if (!onViewChain) return;
            const btn = popup.getElement()?.querySelector<HTMLButtonElement>(`[${VIEW_CHAIN_ATTR}]`);
            if (btn && !btn.dataset.bound) {
              btn.dataset.bound = '1';
              btn.addEventListener('click', () => onViewChain(merchant));
            }
          });

          const marker = new maplibregl.Marker({ element: el, anchor: 'center', offset: spiralOffset(i) })
            .setLngLat([loc.lng, loc.lat])
            .setPopup(popup)
            .addTo(map);

          markersRef.current.set(locationKey(merchant.id, locationIndex), { marker });
        });
      }
    };

    // Los pines son elementos DOM: no dependen del estilo. Esperar a `isStyleLoaded()` los perdía
    // si el filtro cambiaba mientras bajaban tiles (es false durante la carga y `load` no se repite).
    sync();

    return () => {
      cancelled = true;
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
