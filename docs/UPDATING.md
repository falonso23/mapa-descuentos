# UPDATING — Cómo actualizar los locales y beneficios

Los beneficios de las tarjetas **rotan** (altas/bajas mensuales). Esta guía explica cómo
refrescar los datos, sumar una tarjeta nueva y el plan para automatizar el scraping.

> Regla de oro: **las direcciones (paso 1) son lo caro; las coordenadas (paso 2) son baratas
> y repetibles.** La caché `data/geocache.json` hace que re-geocodificar sea casi instantáneo.

---

## De dónde sale la data

| Fuente | Cómo se obtiene | Ubicaciones |
|---|---|---|
| **Santander** | `node scripts/scrape-santander.mjs` — la página `santander.com.uy/beneficios?vista=grid` viene renderizada del servidor: ~330 beneficios y un GeoJSON con cada local adherido. | **Coordenadas oficiales** (no publica direcciones). |
| **Itaú** | `node scripts/scrape-itau.mjs` — tres landings de restaurantes (Personal Bank / Platinum / crédito), la de moda Personal Bank y el feed `itau.com.uy/inst/aci/inst_camp.xml` (farmacias, campañas del mes). | Coordenadas oficiales solo en el feed; restaurantes y moda traen nombre y ciudad. |
| **OCA** | Manual: base completa en `oca.uy/src/js/bd-beneficios.js` (`const data = [...]`, con `active`/`deleted`/`category`). | Solo nombres. |
| **Club El País** | Manual: `WebFetch` sobre `clubelpais.com.uy` y sus sub-rubros. | Solo nombres. |

Los scrapers no tienen dependencias (Node 22 + regex) y fallan con un error explícito si el
HTML del sitio cambió. Santander excluye los beneficios que son solo "canje de puntos".

Para los comercios sin coordenada oficial hay que conseguir una **dirección**: primero
`find-addr-osm.mjs` (búsqueda por nombre en OpenStreetMap, encuentra ~1 de cada 5) y el
resto con agentes IA que buscan en la web (lotes de ~30) o a mano.

---

## Escenario 1: refrescar beneficios (misma tarjeta, cambió la lista)

1. **Re-extraer** la fuente y sobrescribir su `data/raw/<fuente>.json`:
   - Santander: `node scripts/scrape-santander.mjs`
   - Itaú: `node scripts/scrape-itau.mjs`
   - OCA: volver a bajar `oca.uy/src/js/bd-beneficios.js` y parsear `const data` (filtrar
     `active===1 && deleted===0`, excluir `category===2` que son espectáculos).
   - Club El País: `WebFetch` de las páginas de beneficios.
2. `node scripts/consolidate.mjs` → regenera `data/unified.json`. Los `id` son **estables**:
   `data/id-registry.json` guarda el id de cada comercio (por nombre normalizado) y nunca lo
   reasigna, así las direcciones guardadas siguen valiendo. El script informa altas y
   comercios que ya no figuran en ninguna fuente.
3. `node scripts/find-addr-osm.mjs` → busca en OSM los comercios nuevos sin ubicación y
   escribe `data/batches/addr/osm_auto.json` (revisar los "found": es una búsqueda por nombre).
4. Los que quedan `not_found`: buscar la dirección (agentes IA o a mano) y guardarla en un
   archivo nuevo de `data/batches/addr/` cuyo nombre ordene **después** de `osm_auto.json`
   (ej. `web_2026-10_0.json`), con el formato de siempre:
   `{ id, merchant, resolved_name, es_cadena, status, addresses: [{ sucursal, address, confidence, source_url }] }`.
   La dirección debe terminar en `..., <Departamento>, Uruguay` (la web deriva de ahí el filtro
   por departamento).
5. `node scripts/geocode-addr.mjs` → regenera `web/public/map-data.json`. Usa las coordenadas
   oficiales tal cual (y les pone dirección con geocoding inverso), geocodifica las
   direcciones guardadas y cachea todo en `data/geocache.json`. La primera corrida después
   de un refresh de Santander tarda ~20 min (1 req/s); las siguientes, segundos.

> Los archivos de `data/batches/addr/` se leen en orden alfabético y el último gana:
> lotes (`addr_*`) → `osm_auto.json` → `web_*` → `zz_supplemental.json` (correcciones a mano).
> Si un comercio tiene coordenadas oficiales, mandan esas; las direcciones guardadas solo
> aportan el texto (si están a menos de 200 m) o locales extra cuando otra tarjeta sin
> coordenadas oficiales también da el beneficio.

## Escenario 2: sumar una tarjeta/banco nuevo

1. Crear `data/raw/<nuevoBanco>.json` con la extracción (mismo esquema que los otros:
   `{ source, bank, merchants: [{ merchant, category, discounts:[{card,amount,days,conditions}], location_type, address_hint, locations?:[{lat,lng,sucursal?}] }] }`;
   `locations` solo si la fuente publica coordenadas).
2. Agregar un **adaptador** en `scripts/consolidate.mjs` (array `ADAPTERS`). Si el esquema es
   igual a Santander/Club El País, es una línea: `() => adaptStandard('nuevoBanco.json', 'NuevoBanco')`.
3. Agregar su color en `web/src/data/providers.ts` (objeto `PROVIDER_COLOR`).
4. Correr consolidate → find-addr-osm → direcciones de los que falten → geocode-addr.

El dedup por nombre hace que si el comercio ya existía (otra tarjeta), se **fusione**: queda
un pin con los beneficios de ambas tarjetas.

## Escenario 3: corregir un comercio puntual (categoría, dirección, sucursal)

- **Categoría / beneficio:** editar `data/unified.json` y re-correr `geocode-addr.mjs`.
- **Dirección / coordenada / sucursales:** editar/añadir la entrada en
  `data/batches/addr/zz_supplemental.json` (se lee último y pisa lo demás) y re-correr
  `geocode-addr.mjs`. Para forzar una coordenada exacta a mano (paradores sin numeración que
  Nominatim no ubica), agregá `lat`/`lng` directamente en esa dirección — el script los
  respeta y no geocodifica ese punto.

---

## Automatización: qué falta

Santander e Itaú ya tienen scraper. Pendiente:

1. **Scraper de OCA** (trivial: `fetch` de `bd-beneficios.js` + parseo del `const data`) y de
   **Club El País** (`fetch` + parser HTML).
2. **Orquestador mensual**: `scrape-* → consolidate → find-addr-osm → geocode-addr`, avisando
   qué comercios nuevos quedaron sin dirección.
3. **Bajas**: `consolidate.mjs` ya informa cuántos comercios dejaron de figurar; sus
   direcciones quedan guardadas por si vuelven.

### Alternativa más precisa para geocodificar (si se quiere)
En vez de Nominatim, usar **Google Places API (Text Search)**: nombre → dirección + lat/lng
en una llamada, ~95% de acierto. Requiere API key (gratis dentro del cupo). Cambiaría solo
`geocode-addr.mjs`. Se descartó por ahora para no depender de una key.
