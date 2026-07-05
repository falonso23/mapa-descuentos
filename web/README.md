# Mapa de Descuentos — web

SPA React + TypeScript + Vite. Mapa con [MapLibre GL](https://maplibre.org/) (tiles raster
oscuros de CARTO, sin API key), pines individuales sin clustering, iconos de
[lucide-react](https://lucide.dev/) por rubro.

Ver el [README del proyecto](../README.md) y [`docs/HANDOFF.md`](../docs/HANDOFF.md) para
contexto completo (de dónde sale la data, cómo actualizarla, decisiones tomadas).

## Desarrollo

```bash
npm install
npm run dev       # http://localhost:5173, hot-reload
```

## Build de producción

```bash
npm run build
npm run preview   # sirve dist/, http://localhost:4173
```

## Estructura

```
public/map-data.json     # datos del mapa (generado por ../scripts/geocode-addr.mjs, no editar a mano)
src/
  types.ts                # Merchant, Benefit, MerchantLocation
  data/categories.tsx      # rubro -> { label, icono lucide, color }
  data/providers.ts        # tarjeta -> color
  hooks/useMapData.ts      # fetch de map-data.json
  components/
    MapView.tsx            # mapa MapLibre + marcadores + popups (imperativo, sin clustering)
    MarkerIcon.tsx          # pin de categoría montado en cada marcador
    MerchantPopup.tsx       # contenido del popup (se renderiza a HTML estático para MapLibre)
    TopBar.tsx              # título, buscador, botón de filtros
    FilterSheet.tsx         # bottom sheet: filtro por tarjeta y por rubro
    Chips.tsx               # chips de filtros activos
    CountPill.tsx           # contador de comercios/puntos visibles
```

## Notas

- `map-data.json` se sirve desde `public/` — Vite lo copia tal cual al build. Si regenerás
  los datos con el pipeline, alcanza con recargar la página (dev) o rebuildear (prod).
- El mapa usa tiles **raster** de CARTO (no vectoriales) a propósito: mismo look que la
  versión anterior, sin depender de una API key de un proveedor de vector tiles.
- Los estilos de MapLibre (`maplibre-gl.css`) se importan desde `MapView.tsx`, lo que hace
  que terminen después de `index.css` en el bundle. Si necesitás sobrescribir una clase de
  MapLibre (`.maplibregl-*`), usá un selector más específico (ver ejemplos en `index.css`),
  no asumas que tu regla gana por especificidad igual.
