import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Merchant } from '../types';
import { MarkerIcon } from './MarkerIcon';
import { MerchantPopup } from './MerchantPopup';

const INITIAL_CENTER: [number, number] = [-56.19, -34.905];
const INITIAL_ZOOM = 7;
const TILE_SUBDOMAINS = ['a', 'b', 'c', 'd'];

interface MarkerEntry {
  marker: maplibregl.Marker;
  root: Root;
}

export function MapView({ merchants }: { merchants: Merchant[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<MarkerEntry[]>([]);
  const hasFitRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: 'raster',
            tiles: TILE_SUBDOMAINS.map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`),
            tileSize: 256,
            attribution: '© OpenStreetMap © CARTO',
          },
        },
        layers: [{ id: 'carto-dark', type: 'raster', source: 'carto' }],
      },
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    const clearMarkers = () => {
      for (const { marker, root } of markersRef.current) {
        marker.remove();
        root.unmount();
      }
      markersRef.current = [];
    };

    const sync = () => {
      if (cancelled) return;
      clearMarkers();

      const bounds = new maplibregl.LngLatBounds();
      let any = false;

      for (const merchant of merchants) {
        for (const loc of merchant.locations) {
          if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;

          const el = document.createElement('div');
          el.className = 'marker-anchor';
          const root = createRoot(el);
          root.render(<MarkerIcon category={merchant.category} />);

          const popupHtml = renderToStaticMarkup(<MerchantPopup merchant={merchant} location={loc} />);
          const popup = new maplibregl.Popup({ offset: 18, maxWidth: '300px' }).setHTML(popupHtml);

          const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([loc.lng, loc.lat])
            .setPopup(popup)
            .addTo(map);

          markersRef.current.push({ marker, root });
          bounds.extend([loc.lng, loc.lat]);
          any = true;
        }
      }

      if (any && !hasFitRef.current) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
        hasFitRef.current = true;
      }
    };

    if (map.isStyleLoaded()) sync();
    else map.once('load', sync);

    return () => {
      cancelled = true;
      map.off('load', sync);
      clearMarkers();
    };
  }, [merchants]);

  return <div ref={containerRef} className="map-container" />;
}
