# HANDOFF — Mapa de Descuentos

Documento para que otro agente (o persona) retome el proyecto. Explica **qué se hizo**,
**cómo**, **qué falta** y **cómo cerrarlo**.

---

## 1. Objetivo

Web mobile-first con un mapa de comercios de Uruguay que muestra qué descuento tiene cada
uno y con qué tarjeta. Uso **personal** (sin auth, sin multiusuario, sin backend). El
dataset cubre las 4 tarjetas; hoy (oct 2026) el usuario usa **Santander Platinum** e **Itaú
Personal Bank**, así que esas dos fuentes son la prioridad al refrescar. Debe ser **extensible** a nuevas tarjetas y manejar que un
mismo comercio dé % distinto según **producto/tier** (Platinum, Visa/Master, crédito/débito…).

## 2. Decisiones tomadas (no re-litigar sin motivo)

| Tema | Decisión |
|---|---|
| Alcance geográfico | **Todo Uruguay** |
| Tarjetas | **Todas** (Santander, Itaú, OCA, Club El País) |
| Qué comercios | **Solo locales comerciales**. Fuera: educación, turismo/viajes, eventos/espectáculos, promos financieras (cuotas, telepeaje, patente, sorteos, seguros) |
| Cadenas | **Todas las sucursales** (un comercio → varias `locations`) |
| Método de ubicación | 2 pasos: (1) IA busca **dirección en texto**, (2) script geocodifica dirección→**coordenadas**. Se separó a propósito: la IA es confiable encontrando direcciones, NO inventando lat/lng |
| Geocoder | **Nominatim (OpenStreetMap)** — gratis, sin API key, 1 req/s, con caché |
| Coordenadas oficiales | Santander publica un GeoJSON con cada local adherido y el feed de Itaú trae lat/lng: **se usan tal cual** (sin IA ni geocoding) y mandan sobre las direcciones guardadas. Nominatim inverso solo les pone el texto de la dirección |
| Ids | **Estables**: `data/id-registry.json` (nombre normalizado → id). Las direcciones guardadas se indexan por id, así que un refresh de las fuentes no las rompe |
| Modelo de los agentes | **Sonnet** (equilibrio costo/calidad) para buscar direcciones |
| Hosting | Ninguno. `map-data.json` se lee con `fetch()` (necesita un server estático — `file://` no permite fetch de JSON local por CORS) |
| Frontend | **React + TypeScript + Vite** (`web/`), mapa con **MapLibre GL** (estilo vectorial positron de OpenFreeMap — sin API key), pines **sin clustering**, iconos **lucide-react** (no emojis). Reemplazó la versión anterior de HTML/JS plano (`app/`, removida). |

## 3. Pipeline (de fuente a mapa)

```
sitio Santander ──scrape-santander.mjs──▶ data/raw/santander.json   (beneficios + coordenadas oficiales)
sitio Itaú ──scrape-itau.mjs──▶ data/raw/itau.json                  (restaurantes, moda, feed de campañas)
data/raw/*.json ──consolidate.mjs──▶ data/unified.json (+ data/id-registry.json: ids estables)
unified.json ──find-addr-osm.mjs──▶ data/batches/addr/osm_auto.json   (DIRECCIONES de OSM para los nuevos)
los que OSM no tiene ──[agentes IA / a mano]──▶ data/batches/addr/web_*.json
unified.json + addr/*.json ──geocode-addr.mjs──▶ web/public/map-data.json   (COORDENADAS + merge con beneficios)
web/public/map-data.json ──fetch() en useMapData.ts──▶ mapa en el navegador (React + MapLibre)
```

### Scripts (en `scripts/`, Node, sin dependencias)

| Script | Rol | ¿Vigente? |
|---|---|---|
| `consolidate.mjs` | Junta `data/raw/*` → `unified.json`. **Un adaptador por fuente** (extensible). Normaliza categorías, deduplica por nombre, marca `commercial`. | ✅ |
| `scrape-santander.mjs` | Extrae los beneficios y las coordenadas oficiales de `santander.com.uy/beneficios` → `data/raw/santander.json`. | ✅ |
| `scrape-itau.mjs` | Extrae restaurantes (por segmento: Personal Bank / Platinum / crédito), moda Personal Bank y el feed de campañas → `data/raw/itau.json`. | ✅ |
| `find-addr-osm.mjs` | Busca en OpenStreetMap, por nombre, los comercios nuevos sin ubicación → `data/batches/addr/osm_auto.json`. | ✅ |
| `lib/` | `scrape-utils.mjs` (fetch + parseo de montos/días) y `nominatim.mjs` (cliente con límite de 1 req/s). | ✅ |
| `select-rest.mjs` | Generó los lotes `data/batches/rest/chunk_XX.json` de la investigación inicial. | histórico |
| `select-batch.mjs` | Generó el lote de validación inicial de 40 (`data/batches/batch1.json`). | histórico |
| `geocode-addr.mjs` | **PASO 2 actual**: lee TODAS las direcciones de `data/batches/addr/`, geocodifica con Nominatim (cascada exacta→calle→zona→ciudad, con fallback y soporte para `lat`/`lng` manuales), escribe `web/public/map-data.json`. Reanudable (caché). | ✅ |
| `geocode.mjs` | Intento viejo: geocodificar por **nombre** (no por dirección). **Reemplazado** por geocode-addr. | legacy, no usar |
| `build-mapdata.mjs` | Merge viejo (solo batch1). **Reemplazado** por geocode-addr. | legacy, no usar |

## 4. Modelo de datos

### `data/unified.json` — fuente de verdad de los beneficios
Array de comercios. Campos clave:
```json
{
  "id": 128,
  "merchant": "Pecarí",
  "category": "moda",                      // gastronomia|moda|calzado|hogar|salud|bienestar|supermercado|entretenimiento|tecnologia|ninos|otros
  "providers": ["Club El País", "Itaú"],
  "benefits": [                             // <-- maneja tiers/productos: varios por comercio
    { "provider": "Club El País", "product": "Club El País", "amount": "20%", "days": "Todos los días", "conditions": null },
    { "provider": "Itaú", "product": "crédito Itaú + débito Volar", "amount": "15%", "days": "todos los días", "conditions": "..." }
  ],
  "commercial": true,                       // false = educación/turismo/promo financiera (no va al mapa)
  "city": "Punta del Este",
  "address_hint": "Punta del Este"
}
```

### `data/batches/addr/addr_*.json` — direcciones halladas (salida del paso 1)
```json
{
  "id": 128, "merchant": "Pecarí", "resolved_name": "Pecarí",
  "es_cadena": true, "status": "found",     // "found" | "not_found"
  "addresses": [
    { "sucursal": "Punta Carretas", "address": "José Ellauri 591 bis, Punta Carretas, Montevideo, Uruguay", "confidence": 0.9, "source_url": "https://..." }
  ]
}
```
- `zz_supplemental.json` se lee **último** (orden alfabético) → **pisa** los `not_found` de
  otros lotes. Es el patrón para corregir/completar sin editar 17 archivos.

### `web/public/map-data.json` — lo que consume el mapa
`[ { id, merchant, category, providers, benefits, es_cadena, locations:[{lat,lng,address,sucursal,confidence,precision,source}], zone? } ]`.
`source` dice de dónde salió el pin (`santander`/`itau` = coordenada oficial, `osm`, `nominatim`, `manual`).
El hook `web/src/hooks/useMapData.ts` hace `fetch('map-data.json')` y descarta los que tienen
`locations: []`, salvo que traigan `zone`: son comercios reales de Santander/Itaú todavía sin
dirección, que no tienen pin pero aparecen en la lista con su ciudad. Tipos en `web/src/types.ts`.

## 5. Estado actual (con números)

Corte: **12 oct 2026**. Santander e Itaú se re-scrapearon ese día. OCA y Club El País siguen
con la extracción de julio 2026 (el archivo público de OCA, `bd-beneficios.js`, respondió vacío).

- `unified.json`: **881** comercios (dedup), **816** `commercial` (Santander 274, Itaú 277,
  OCA 165, Club El País 146). **277** traen coordenadas oficiales del banco.
- Direcciones guardadas: **486** comercios con dirección (en `data/batches/addr/`, 27 archivos).
- `map-data.json`: **664** comercios con ubicación, **1.426** pines. Origen de los pines:
  877 coordenada oficial (856 Santander, 21 Itaú), 500 dirección geocodificada con Nominatim,
  46 OpenStreetMap por nombre, 3 fijados a mano.
- **74** comercios reales de Santander/Itaú sin dirección: llevan `zone`, no tienen pin y se
  ven en la pestaña Lista ("sin dirección cargada todavía"). 71 son de Itaú y 3 de Santander
  (PedidosYa, OrderEat y Vang - The Kul Store). Ver punto D.
- Otros **78** `commercial` sin ubicación (77 de OCA, 1 de Club El País) no se muestran: casi
  todos son promociones sin local físico (cuotas, sorteos, telepeaje, tiendas 100% online).

### D. Comercios reales sin dirección confiable
En octubre 2026 se buscaron los 118 comercios sin coordenada oficial ni dirección previa: primero
en OpenStreetMap por nombre (`find-addr-osm.mjs` → `osm_auto.json`) y después en la web
(`web_2026-10_*.json`). 45 quedaron con dirección. Para ver los 74 pendientes: comercios con
`zone` en `web/public/map-data.json` (la mayoría son restaurantes de Punta del Este / José
Ignacio y marcas de moda del programa Personal Bank de Itaú).

Se descartaron a propósito resultados dudosos (no inventar direcciones): Amén (homónimo en
Lavalleja), Bodega Oceánica (solo "Ruta 9 km 157"), Puropunto, Bacán (domicilio fiscal de una
tienda mayormente online), Gourmet Marti y Arenas.

→ Para cerrarlos: Google Maps, Instagram o llamar al comercio, y cargarlos en
`zz_supplemental.json` (con `lat`/`lng` si se conoce el punto exacto). La búsqueda web genérica
rinde muy poco con comercios chicos; lo que mejor funcionó fue la bio de Instagram y el sitio
propio del comercio.

## 6. Qué faltaba (cerrado)

### A. ~21 comercios reales sin geocodificar — ✅ resuelto
Dos causas, ambas corregidas:
1. **Bugs en `variants()` de `geocode-addr.mjs`**: la detección de ciudad hacía match por
   substring y confundía nombres de calle ("Salto 946" → ciudad "Salto") o nombres de
   shopping ("Montevideo Shopping" → ciudad mal detectada) con la ciudad real. Se corrigió
   buscando la ciudad solo entre las partes que no son la calle, excluyendo las que
   contienen "shopping", y se agregaron variantes de fallback (calle sin abreviatura del
   nombre propio, y como último recurso el centro de la ciudad/zona). Con esto, 20 de los
   21 comercios con dirección conocida pasaron a geocodificar.
2. **`geocode-addr.mjs` ahora respeta `lat`/`lng` manuales** si vienen en la dirección
   (útil para paradores/zonas rurales que Nominatim no ubica).
3. Los 6 que estaban `not_found` sin ninguna dirección guardada (ids 17-22: Kave Home,
   Renart Libros, Extreme Force, Rotunda, Balcony Shop, La Rural) se investigaron y se
   cargaron en `zz_supplemental.json`.

### B. Categorías mal clasificadas — ✅ resuelto
Corregidas en `data/unified.json`:
- **Bela** (OCA, id 503): gastronomia → **otros** (pañalería/perfumería).
- **Bruta** (Santander, id 3): moda → **gastronomia** (restaurante).
- **Kentucky** (OCA, id 528): entretenimiento → **gastronomia** (pizzería).
- **Mundo Color** (OCA, id 533): otros → **hogar** (pinturería).
- **Iber** (Santander/Club El País, id 2): bienestar → **tecnologia** (se descubrió al
  investigar sus sucursales — es una cadena de electrónica/Apple reseller, no bienestar).

### C. Cadenas marcadas como no-cadena — ✅ resuelto (las 3 que faltaban)
- **Farmashop** ya tenía 15 sucursales cargadas y `es_cadena=true` — no requería cambios.
- **Iber**: 1 → 16 sucursales (tiendas propias + locales en shoppings de todo el país).
- **Chester House / Chesterhouse**: 1 → 4 sucursales (Ciudad Vieja, WTC Torres 2 y 4,
  Zonamerica) — es una cadena de catering corporativo, no un único restaurante.
- **Sushi Club**: 1 → 2 sucursales (Punta Carretas, Punta del Este).

### Para aplicar cualquier corrección futura
```bash
# tras editar unified.json o zz_supplemental.json:
node scripts/geocode-addr.mjs     # regenera web/public/map-data.json (rápido: usa caché)
cd web && npm run dev             # verificar (recarga sola al cambiar el JSON)
```

## 7. Ideas de mejora de la app (no bloqueantes)

- Filtro por **producto/tier** o "mis tarjetas" (hoy filtra por proveedor y rubro, no por Platinum/Personal Bank/etc.).
- Botón "cerca mío" (geolocalización del navegador).
- Mostrar `confidence` / marcar pines aproximados (el dato ya está en `locations[].precision`).
- Buscador que también matchee por rubro o beneficio.

## 8. Gotchas / lecciones (importante para el próximo agente)

- **No uses agentes IA para producir coordenadas**: alucinan lat/lng. Que devuelvan
  **dirección** y geocodificá con script. (Fue un cambio de rumbo clave en la sesión).
- **Nominatim es quisquilloso**: rechaza `esq.`, `Local NN`, nombres de edificio y muchas
  abreviaturas. `geocode-addr.mjs` ya limpia eso y hace fallback a calle/zona — mantené esa lógica.
- **Rate limit de Nominatim**: 1 req/s. `scripts/lib/nominatim.mjs` espacia los pedidos. No lo paralelices.
- **Agentes que se sub-dividen**: al dar 30 comercios por lote, algunos agentes Sonnet
  spawnearon sub-agentes y terminaron su turno **sin escribir el archivo**. Hubo que
  reactivarlos (SendMessage) para que ensamblaran. Si repetís el flujo, o das lotes más
  chicos, o instruís explícitamente "no spawnees sub-agentes, escribí vos el archivo".
- **La detección de ciudad en `variants()` hace match por substring**: si buscás la ciudad
  entre TODAS las partes de la dirección (incluida la calle), un nombre de calle como
  "Salto 946" o un nombre de shopping como "Montevideo Shopping" se confunde con la ciudad.
  Por eso la búsqueda de ciudad excluye la parte de la calle (`parts[0]`) y cualquier parte
  que contenga "shopping".
- **Direcciones "Ruta N km X"**: Nominatim no entiende kilómetros y "Ruta 10, Maldonado" cae
  en cualquier punto de la ruta (hubo pines a 30–60 km). `variants()` busca la ruta dentro de
  la localidad que nombra la dirección ("Ruta 10, Manantiales"); si no nombra ninguna cae al
  centro de la ciudad, así que conviene fijar `lat`/`lng` a mano en `zz_supplemental.json`
  (ej. Zonamerica, Vía Disegno).
- **Los pines son elementos DOM (~1.400)**: el ícono se cachea por rubro+proveedores y el HTML
  del popup se arma recién al abrirlo. Si se vuelve a renderizar todo por pin en cada cambio
  de filtro, la interfaz se traba; y no hay que esperar a `isStyleLoaded()` para dibujarlos
  (es `false` mientras bajan tiles y los pines se perdían).
- **`maplibre-gl.css` pisa reglas propias de la misma especificidad**: como se importa desde
  un componente (`MapView.tsx`), termina más abajo que `index.css` en el bundle final, y sus
  reglas base (`.maplibregl-map { position: relative }`, `.maplibregl-popup-content { background: #fff }`)
  ganan el empate de especificidad. Solución: selectores más específicos (`#map-wrap .map-container`,
  `.maplibregl-popup.maplibregl-popup .maplibregl-popup-content`), no `!important`. Si tocás
  `web/src/index.css` y algo de MapLibre no se ve como esperás, sospechá de esto primero.
