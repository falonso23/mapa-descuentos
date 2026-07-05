# UPDATING — Cómo actualizar los locales y beneficios

Los beneficios de las tarjetas **rotan** (altas/bajas mensuales). Esta guía explica cómo
refrescar los datos, sumar una tarjeta nueva y el plan para automatizar el scraping.

> Regla de oro: **las direcciones (paso 1) son lo caro; las coordenadas (paso 2) son baratas
> y repetibles.** La caché `data/geocache.json` hace que re-geocodificar sea casi instantáneo.

---

## Cómo se recolectó la data (una vez, manual con agentes)

Las 4 fuentes NO publican direcciones ni coordenadas, solo el **nombre** del comercio y su
descuento. Además cada sitio sirve la data distinto:

| Fuente | Cómo se obtuvo | Nota |
|---|---|---|
| **Santander** | `WebFetch` sobre `santander.com.uy/beneficios?vista=grid` | HTML mayormente renderizado. ~54 comercios. |
| **Club El País** | `WebFetch` sobre `clubelpais.com.uy` y sus sub-rubros | 183 comercios entre todos los rubros. |
| **Itaú** | La landing `beneficios.html` es curada; la lista real de restaurantes está en `itau.com.uy/inst/restaurantes.html` (~150 nombres). `moda.html` no publica comercios. | SPA; los destacados salen del DOM. |
| **OCA** | **Base de datos completa** en `oca.uy/src/js/bd-beneficios.js` (`const data = [...]`, ~300 registros con `active`/`deleted`/`category`). | La mejor fuente: estructurada. |

Luego: `consolidate.mjs` unificó todo, se buscaron **direcciones** con agentes IA (Sonnet,
lotes de 30) y se geocodificó con `geocode-addr.mjs`.

---

## Escenario 1: refrescar beneficios (misma tarjeta, cambió la lista)

1. **Re-extraer** la fuente que cambió y sobrescribir su `data/raw/<fuente>.json`.
   - OCA: volver a bajar `oca.uy/src/js/bd-beneficios.js` y parsear `const data` (filtrar
     `active===1 && deleted===0`, excluir `category===2` que son espectáculos).
   - Santander / Club El País: `WebFetch` de las páginas de beneficios.
   - Itaú: DOM de `beneficios.html` + `restaurantes.html`.
2. `node scripts/consolidate.mjs` → regenera `data/unified.json`.
3. `node scripts/select-rest.mjs` → regenera los lotes. **Ojo:** los `id` pueden cambiar si
   cambió el orden. Mejor: comparar contra `data/batches/addr/` y **buscar direcciones solo
   de los comercios nuevos** (los ya conocidos ya tienen dirección guardada).
4. Buscar direcciones de los comercios nuevos (agentes IA) → nuevos `addr_*.json`.
5. `node scripts/geocode-addr.mjs` → regenera `app/map-data.js` (usa caché para los viejos).

> Como las direcciones y la caché de geocoding persisten, un refresh típico solo investiga
> los **comercios nuevos**, no los 500 de nuevo.

## Escenario 2: sumar una tarjeta/banco nuevo

1. Crear `data/raw/<nuevoBanco>.json` con la extracción (mismo esquema que los otros:
   `{ source, bank, merchants: [{ merchant, category, discounts:[{card,amount,days,conditions}], location_type, address_hint }] }`).
2. Agregar un **adaptador** en `scripts/consolidate.mjs` (array `ADAPTERS`). Si el esquema es
   igual a Santander/Club El País, es una línea: `() => adaptStandard('nuevoBanco.json', 'NuevoBanco')`.
3. Agregar su color en `app/app.js` (objeto `PROVIDER_COLOR`).
4. Correr consolidate → select-rest → agentes de direcciones (solo los nuevos) → geocode-addr.

El dedup por nombre hace que si el comercio ya existía (otra tarjeta), se **fusione**: queda
un pin con los beneficios de ambas tarjetas.

## Escenario 3: corregir un comercio puntual (categoría, dirección, sucursal)

- **Categoría / beneficio:** editar `data/unified.json` y re-correr `geocode-addr.mjs`.
- **Dirección / coordenada / sucursales:** editar/añadir la entrada en
  `data/batches/addr/zz_supplemental.json` (se lee último y pisa lo demás) y re-correr
  `geocode-addr.mjs`. Para forzar una coordenada exacta a mano, se puede extender el script
  para respetar `lat`/`lng` si vienen en la dirección (hoy siempre geocodifica el texto).

---

## Plan de automatización (scraping futuro — TODO, no implementado)

Hoy la extracción es manual. Para automatizarla más adelante:

1. **Un scraper por fuente** (carpeta `scrapers/`), cada uno escribe `data/raw/<fuente>.json`:
   - **OCA**: trivial — `fetch` de `oca.uy/src/js/bd-beneficios.js` + parseo del `const data`.
   - **Santander / Club El País**: `fetch` + parser HTML (o Playwright si hace falta JS).
   - **Itaú**: Playwright (SPA) sobre `restaurantes.html` + destacados de `beneficios.html`.
2. **Correr periódicamente** (mensual): un script orquestador que haga
   `scrapers/* → consolidate → detectar comercios nuevos → (direcciones solo nuevos) → geocode-addr`.
3. **Direcciones de comercios nuevos**: seguir usando agentes IA (o una Places API con key)
   solo para los que no tienen dirección en `data/batches/addr/`.
4. **Detección de bajas**: comparar el `unified.json` nuevo vs el anterior y marcar/quitar
   los comercios que ya no están.

### Alternativa más precisa para geocodificar (si se quiere)
En vez de Nominatim, usar **Google Places API (Text Search)**: nombre → dirección + lat/lng
en una llamada, ~95% de acierto. Requiere API key (gratis dentro del cupo). Cambiaría solo
`geocode-addr.mjs`. Se descartó por ahora para no depender de una key.
