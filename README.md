# Mapa de Descuentos 🗺️

App web **mobile-first** que muestra en un mapa los comercios de Uruguay con
descuentos según la tarjeta (Santander, Itaú, OCA, Club El País). Uso personal.

- **Frontend**: React + TypeScript + Vite, mapa con **MapLibre GL** (tiles raster oscuros
  de CARTO), pines individuales sin agrupar, iconos de [lucide-react](https://lucide.dev/)
  por rubro. Vive en [`web/`](web/).
- **No hay backend.** El front es una SPA estática (`web/dist` tras el build) que lee
  `map-data.json` con `fetch`.
- **No hay scraping en vivo** (todavía): la data se recolectó una vez con agentes y
  quedó guardada en `data/`. Ver [`docs/UPDATING.md`](docs/UPDATING.md) para refrescarla.

## Cómo correrlo

Requiere **Node.js** (probado con v24).

```bash
cd web
npm install
npm run dev              # dev server con hot-reload, imprime la URL (típ. http://localhost:5173)
```

Para una build de producción local:

```bash
cd web
npm run build
npm run preview          # sirve web/dist, típ. http://localhost:4173
```

Abrilo en el navegador (idealmente en modo responsive/celular).

> El mapa lee `web/public/map-data.json` vía `fetch`. Si regenerás los datos con
> `scripts/geocode-addr.mjs`, alcanza con recargar la página (el dev server no necesita reiniciarse).

## Estado actual (snapshot)

| | |
|---|---|
| Comercios comerciales en el dataset | **532** |
| Comercios con ubicación en el mapa | **440** |
| Pines (sucursales) en el mapa | **696** |
| Fuentes | Santander, Itaú, OCA, Club El País |
| Cobertura | Todo Uruguay |

La pasada de calidad pendiente (comercios sin geocodificar, categorías mal clasificadas,
cadenas con una sola sucursal cargada) ya se cerró — detalle en [`docs/HANDOFF.md`](docs/HANDOFF.md).
De los 92 comercios que quedan sin ubicación, ~75 son promociones sin local físico (cuotas,
sorteos, tiendas 100% online) y ~17 son comercios reales cuya dirección no se pudo confirmar
con confianza suficiente (ver punto D del handoff).

## Estructura

```
web/                 # SPA React + TS + Vite
  public/
    map-data.json    # datos que consume el mapa (generado por el pipeline, no editar a mano)
  src/
    components/      # MapView (MapLibre), TopBar, FilterSheet, Chips, CountPill, MerchantPopup
    data/            # categorías (icono + color), colores por tarjeta
    hooks/           # useMapData (fetch de map-data.json)
    types.ts
data/
  raw/               # extracción cruda por fuente (santander/itau/oca/clubelpais.json)
  unified.json       # dataset unificado + deduplicado (fuente de verdad de beneficios)
  batches/
    rest/            # lotes de entrada para investigar direcciones (chunk_XX.json)
    addr/            # SALIDA: direcciones halladas por comercio (addr_*.json)
  geocache.json      # caché de geocoding (dirección -> lat/lng)
scripts/             # pipeline de datos (Node, sin dependencias) — genera web/public/map-data.json
docs/                # documentación (este handoff + guía de actualización)
```

## Documentación

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — **estado detallado, qué falta y cómo cerrarlo** (para retomar).
- [`docs/UPDATING.md`](docs/UPDATING.md) — **cómo actualizar los locales**, sumar una tarjeta nueva y el plan de scraping futuro.
