# Mapa de Descuentos 🗺️

App web **mobile-first** que muestra en un mapa los comercios de Uruguay con
descuentos según la tarjeta (Santander, Itaú, OCA, Club El País). Uso personal.

- **Frontend**: React + TypeScript + Vite, mapa con **MapLibre GL** (tiles vectoriales
  de OpenFreeMap, sin API key), pines individuales sin agrupar, iconos de [lucide-react](https://lucide.dev/)
  por rubro. Vive en [`web/`](web/).
- **No hay backend.** El front es una SPA estática (`web/dist` tras el build) que lee
  `map-data.json` con `fetch`.
- **No hay scraping en vivo**: la data queda guardada en `data/`. Santander e Itaú se
  refrescan con un comando (`scripts/scrape-*.mjs`); OCA y Club El País todavía a mano.
  Ver [`docs/UPDATING.md`](docs/UPDATING.md).

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

Corte: **12 de octubre de 2026**. Santander e Itaú se re-scrapearon ese día; OCA y Club El País
siguen con la extracción de julio de 2026.

| | |
|---|---|
| Comercios comerciales en el dataset | **816** |
| Comercios con ubicación en el mapa | **729** |
| Pines (sucursales) en el mapa | **1.501** (877 con la coordenada oficial del banco, 296 tomados de Google Maps) |
| Comercios reales sin dirección (solo en la lista) | **9** |
| Fuentes | Santander, Itaú, OCA, Club El País |
| Cobertura | Todo Uruguay |

Los 9 comercios sin dirección (plataformas online como PedidosYa y OrderEat, y algunos de Itaú
que no se pudieron identificar) aparecen en la pestaña Lista con su ciudad y sin pin.
Otros 78 beneficios (casi todos de OCA) no se muestran porque son promociones sin local físico
(cuotas, sorteos, tiendas 100% online). Detalle en [`docs/HANDOFF.md`](docs/HANDOFF.md).

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
  id-registry.json   # id estable de cada comercio (no se reasigna entre refrescos)
  batches/
    rest/            # lotes de entrada de la investigación inicial (chunk_XX.json)
    addr/            # direcciones halladas por comercio (addr_*, osm_auto, web_*, zz_supplemental)
  geocache.json      # caché de geocoding (dirección <-> lat/lng)
scripts/             # pipeline de datos (Node, sin dependencias) — genera web/public/map-data.json
docs/                # documentación (este handoff + guía de actualización)
```

## Documentación

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — **estado detallado, qué falta y cómo cerrarlo** (para retomar).
- [`docs/UPDATING.md`](docs/UPDATING.md) — **cómo actualizar los locales** (scrapers de Santander e Itaú), sumar una tarjeta nueva y qué falta automatizar.
