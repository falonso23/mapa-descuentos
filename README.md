# Mapa de Descuentos 🗺️

App web **mobile-first** que muestra en un mapa los comercios de Uruguay con
descuentos según la tarjeta (Santander, Itaú, OCA, Club El País). Uso personal.

- **No hay backend ni build step.** Es HTML/CSS/JS plano + datos en un `.js`.
- **No hay scraping en vivo** (todavía): la data se recolectó una vez con agentes y
  quedó guardada en `data/`. Ver [`docs/UPDATING.md`](docs/UPDATING.md) para refrescarla.

## Cómo correrlo

Requiere **Node.js** (probado con v24). Sin dependencias externas.

```bash
node scripts/serve.mjs           # servidor local en http://localhost:8099
```

Abrí http://localhost:8099 en el navegador (idealmente en modo responsive/celular).

> El mapa lee `app/map-data.js` (`window.MAP_DATA`). Si regenerás los datos, recargá.

## Estado actual (snapshot)

| | |
|---|---|
| Comercios comerciales en el dataset | **532** |
| Comercios con ubicación en el mapa | **400** |
| Pines (sucursales) en el mapa | **611** |
| Fuentes | Santander, Itaú, OCA, Club El País |
| Cobertura | Todo Uruguay |

**Pendiente:** una pasada de calidad (recuperar ~21 comercios reales sin geocodificar y
corregir categorías mal clasificadas). Detalle en [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Estructura

```
app/                 # la web (index.html, styles.css, app.js) + map-data.js (datos)
data/
  raw/               # extracción cruda por fuente (santander/itau/oca/clubelpais.json)
  unified.json       # dataset unificado + deduplicado (fuente de verdad de beneficios)
  batches/
    rest/            # lotes de entrada para investigar direcciones (chunk_XX.json)
    addr/            # SALIDA: direcciones halladas por comercio (addr_*.json)
  geocache.json      # caché de geocoding (dirección -> lat/lng)
scripts/             # pipeline (Node, sin dependencias)
docs/                # documentación (este handoff + guía de actualización)
```

## Documentación

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — **estado detallado, qué falta y cómo cerrarlo** (para retomar).
- [`docs/UPDATING.md`](docs/UPDATING.md) — **cómo actualizar los locales**, sumar una tarjeta nueva y el plan de scraping futuro.
