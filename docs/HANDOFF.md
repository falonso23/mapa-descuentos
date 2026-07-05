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
| Hosting | Ninguno. `map-data.js` es `window.MAP_DATA` (evita CORS de `file://` y no necesita servidor para los datos; sí un server estático para el navegador de prueba) |

## 3. Pipeline (de fuente a mapa)

```
data/raw/*.json ──consolidate.mjs──▶ data/unified.json
unified.json ──select-rest.mjs──▶ data/batches/rest/chunk_XX.json   (lotes de 30)
chunk_XX.json ──[agentes IA Sonnet]──▶ data/batches/addr/addr_rest_XX.json   (DIRECCIONES)
addr/*.json ──geocode-addr.mjs──▶ app/map-data.js   (COORDENADAS + merge con beneficios)
app/map-data.js ──app/──▶ mapa en el navegador
```

### Scripts (en `scripts/`, Node, sin dependencias)

| Script | Rol | ¿Vigente? |
|---|---|---|
| `consolidate.mjs` | Junta `data/raw/*` → `unified.json`. **Un adaptador por fuente** (extensible). Normaliza categorías, deduplica por nombre, marca `commercial`. | ✅ |
| `select-rest.mjs` | Genera los lotes `data/batches/rest/chunk_XX.json` de comercios comerciales a investigar. | ✅ |
| `select-batch.mjs` | Generó el lote de validación inicial de 40 (`data/batches/batch1.json`). | histórico |
| `geocode-addr.mjs` | **PASO 2 actual**: lee TODAS las direcciones de `data/batches/addr/`, geocodifica con Nominatim (cascada exacta→calle→zona), escribe `app/map-data.js`. Reanudable (caché). | ✅ |
| `serve.mjs` | Servidor estático local (`http://localhost:8099`). | ✅ |
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

### `app/map-data.js` — lo que consume el mapa
`window.MAP_DATA = [ { id, merchant, category, providers, benefits, es_cadena, locations:[{lat,lng,address,sucursal,confidence,precision}] } ]`.
El front ignora los que tienen `locations: []`.

## 5. Estado actual (con números)

- `unified.json`: **597** comercios (dedup), **532** `commercial`.
- Direcciones guardadas: **421** comercios con dirección, **648** direcciones/sucursales
  (en `data/batches/addr/`, 21 archivos).
- `map-data.js`: **400** comercios con ubicación, **611** pines.
- Distribución por tarjeta (con ubicación): Itaú 158 · Club El País 134 · OCA 86 · Santander 40.

## 6. Qué falta (cómo cerrarlo)

### A. Recuperar ~21 comercios reales sin geocodificar
Dos causas (ver lista completa al final del output de `geocode-addr.mjs`):
1. **Direcciones sin número** (paradores de playa de Punta del Este: Ovo Beach, Parador
   Bikini, Mansa Beach Club, etc.). Nominatim no las ubica. → Bajar a coordenada de zona,
   o cargar lat/lng a mano en `zz_supplemental.json` (agregar campos `lat`/`lng` y ajustar
   geocode-addr para respetarlos).
2. **Quedaron como `not_found` pero SÍ tienen dirección** en el historial de la sesión
   (ids 17-22: Kave Home, Renart Libros, Extreme Force, Rotunda, Balcony Shop, La Rural).
   Su lote padre (chunk_00) los marcó not_found porque su sub-agente no había vuelto.
   → Volver a investigarlos (1 agente) o cargarlos en `zz_supplemental.json` y re-correr geocode.

### B. Corregir categorías mal clasificadas en origen
La categoría viene de la fuente y a veces está mal. Conocidos:
- **Bela** (OCA): es pañalería/perfumería, no gastronomía.
- **Bruta** (Santander): es restaurante, no moda.
- **Kentucky** (OCA): pizzería, no chivitos.
- **Mundo Color** (OCA): pinturería.
→ Corregir en `data/unified.json` (campo `category`) o con un archivo de override + re-correr.

### C. Expandir sucursales de cadenas marcadas como no-cadena
Varias marcas multisucursal quedaron con 1 pin porque la fuente las tenía `es_cadena=false`
(Iber, Chesterhouse, Sushi Club, Farmashop en algunos casos, etc.). Mejora incremental.

### Para aplicar cualquier corrección
```bash
# tras editar unified.json o zz_supplemental.json:
node scripts/geocode-addr.mjs     # regenera app/map-data.js (rápido: usa caché)
node scripts/serve.mjs            # verificar en http://localhost:8099
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
- **`map-data.js` no es JSON**: es `window.MAP_DATA = [...];`. Para parsearlo en Node, sacar
  el prefijo/`;`.
