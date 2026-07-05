# HANDOFF — Mapa de Descuentos

Documento para que otro agente (o persona) retome el proyecto. Explica **qué se hizo**,
**cómo**, **qué falta** y **cómo cerrarlo**.

---

## 1. Objetivo

Web mobile-first con un mapa de comercios de Uruguay que muestra qué descuento tiene cada
uno y con qué tarjeta. Uso **personal** (sin auth, sin multiusuario, sin backend). El
usuario tiene las 4 tarjetas. Debe ser **extensible** a nuevas tarjetas y manejar que un
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
| Modelo de los agentes | **Sonnet** (equilibrio costo/calidad) para buscar direcciones |
| Hosting | Ninguno. `map-data.json` se lee con `fetch()` (necesita un server estático — `file://` no permite fetch de JSON local por CORS) |
| Frontend | **React + TypeScript + Vite** (`web/`), mapa con **MapLibre GL** (raster CARTO dark, no vector — sin API key), pines **sin clustering**, iconos **lucide-react** (no emojis). Reemplazó la versión anterior de HTML/JS plano (`app/`, removida). |

## 3. Pipeline (de fuente a mapa)

```
data/raw/*.json ──consolidate.mjs──▶ data/unified.json
unified.json ──select-rest.mjs──▶ data/batches/rest/chunk_XX.json   (lotes de 30)
chunk_XX.json ──[agentes IA Sonnet]──▶ data/batches/addr/addr_rest_XX.json   (DIRECCIONES)
addr/*.json ──geocode-addr.mjs──▶ web/public/map-data.json   (COORDENADAS + merge con beneficios)
web/public/map-data.json ──fetch() en useMapData.ts──▶ mapa en el navegador (React + MapLibre)
```

### Scripts (en `scripts/`, Node, sin dependencias)

| Script | Rol | ¿Vigente? |
|---|---|---|
| `consolidate.mjs` | Junta `data/raw/*` → `unified.json`. **Un adaptador por fuente** (extensible). Normaliza categorías, deduplica por nombre, marca `commercial`. | ✅ |
| `select-rest.mjs` | Genera los lotes `data/batches/rest/chunk_XX.json` de comercios comerciales a investigar. | ✅ |
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
`[ { id, merchant, category, providers, benefits, es_cadena, locations:[{lat,lng,address,sucursal,confidence,precision,source}] } ]`.
El hook `web/src/hooks/useMapData.ts` hace `fetch('map-data.json')` y filtra los que tienen
`locations: []`. Tipos en `web/src/types.ts`.

## 5. Estado actual (con números)

- `unified.json`: **597** comercios (dedup), **532** `commercial`.
- Direcciones guardadas: **440** comercios con dirección (en `data/batches/addr/`, 22 archivos).
- `map-data.json`: **440** comercios con ubicación, **696** pines.
- De los **92** `commercial` sin ubicación: ~75 son promociones sin local físico (cuotas,
  sorteos, telepeaje, tiendas 100% online, genéricos "sin comercio específico") y no
  corresponden al mapa. El resto (~17) son comercios reales investigados sin éxito o con
  confianza demasiado baja para cargar (ver punto D).

### D. Comercios reales investigados sin resultado confiable
Se investigó una segunda tanda de ~29 comercios reales que nunca habían tenido búsqueda de
dirección (mayormente restaurantes/cafés del programa Itaú). 13 se resolvieron y cargaron
(Del Carmen, Nona, Smart, De Arcos, Café del Sol, Las Nazarenas, Late, Los Lagos, Black,
Kratki, Coffe Point, La Pantalla, París Londres). De paso se corrigieron 3 categorías más
mal clasificadas (Nona: hogar→gastronomia, es cafetería; Smart: otros→ninos, es juguetería;
De Arcos: gastronomia→hogar, es mueblería).

Quedaron sin cargar por baja confianza (no inventar direcciones dudosas):
- **Bacán.uy** (id 316): solo domicilio fiscal de una tienda mayormente online, confianza 0.35.
- **Majuga** (id 365): identidad del comercio no verificada con el beneficio Itaú, confianza 0.4.
- **Parada Barra** (id 373): solo "Ruta 10, La Barra" sin número, confianza 0.35.
- **Jefri's Gelato & Café** (id 405): solo ciudad (Salto), sin calle, confianza 0.3.

Y sin ninguna dirección encontrada: Casa Dispensa (251), deVino (59), La Social Restaurante
(282), Cofre Café (344), El Amor es Tiempo (346), Hola que Tal (353), Hoy Café (354), Mar de
Fondo (367), Anima (389), Delicatessen (394), Cardumen (401), Mi Belleza (515).

→ Si se quiere cerrar del todo, re-investigar estos ~17 a mano (Google Maps, Instagram,
llamando al comercio) y cargarlos en `zz_supplemental.json`.

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

- Filtro por **producto/tier** (hoy filtra por proveedor y rubro, no por Platinum/Visa/etc.).
- Botón "cerca mío" (geolocalización del navegador).
- Mostrar `confidence` / marcar pines aproximados (el dato ya está en `locations[].precision`).
- Buscador que también matchee por rubro o beneficio.

## 8. Gotchas / lecciones (importante para el próximo agente)

- **No uses agentes IA para producir coordenadas**: alucinan lat/lng. Que devuelvan
  **dirección** y geocodificá con script. (Fue un cambio de rumbo clave en la sesión).
- **Nominatim es quisquilloso**: rechaza `esq.`, `Local NN`, nombres de edificio y muchas
  abreviaturas. `geocode-addr.mjs` ya limpia eso y hace fallback a calle/zona — mantené esa lógica.
- **Rate limit de Nominatim**: 1 req/s. El script duerme 1100ms. No lo paralelices.
- **Agentes que se sub-dividen**: al dar 30 comercios por lote, algunos agentes Sonnet
  spawnearon sub-agentes y terminaron su turno **sin escribir el archivo**. Hubo que
  reactivarlos (SendMessage) para que ensamblaran. Si repetís el flujo, o das lotes más
  chicos, o instruís explícitamente "no spawnees sub-agentes, escribí vos el archivo".
- **La detección de ciudad en `variants()` hace match por substring**: si buscás la ciudad
  entre TODAS las partes de la dirección (incluida la calle), un nombre de calle como
  "Salto 946" o un nombre de shopping como "Montevideo Shopping" se confunde con la ciudad.
  Por eso la búsqueda de ciudad excluye la parte de la calle (`parts[0]`) y cualquier parte
  que contenga "shopping".
- **`maplibre-gl.css` pisa reglas propias de la misma especificidad**: como se importa desde
  un componente (`MapView.tsx`), termina más abajo que `index.css` en el bundle final, y sus
  reglas base (`.maplibregl-map { position: relative }`, `.maplibregl-popup-content { background: #fff }`)
  ganan el empate de especificidad. Solución: selectores más específicos (`#map-wrap .map-container`,
  `.maplibregl-popup.maplibregl-popup .maplibregl-popup-content`), no `!important`. Si tocás
  `web/src/index.css` y algo de MapLibre no se ve como esperás, sospechá de esto primero.
