// PASO 1 automático: busca en OpenStreetMap (Nominatim) los comercios que todavía no tienen
// ni coordenadas del banco ni una dirección en data/batches/addr/. Es una búsqueda por nombre,
// así que solo acepta resultados que sean un local (no una calle), del rubro del comercio, con
// el mismo nombre y en el departamento que indica la fuente. Lo que no aparece queda como
// "not_found" para investigarlo a mano. Escribe data/batches/addr/osm_auto.json (acumulativo;
// borrarlo para reintentar): geocode-addr lo lee después de los lotes y antes de zz_supplemental.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { nominatim, formatAddress, inUY } from './lib/nominatim.mjs';

const root = new URL('../', import.meta.url);
const addrDir = new URL('data/batches/addr/', root);
const OUT = 'osm_auto.json';
const outPath = new URL(OUT, addrDir);

const unified = JSON.parse(readFileSync(new URL('data/unified.json', root), 'utf8'));
const hasAddress = new Map();                       // id -> ¿la investigación manual encontró dirección?
for (const f of readdirSync(addrDir).filter((f) => f.endsWith('.json') && f !== OUT).sort()) {
  for (const a of JSON.parse(readFileSync(new URL(f, addrDir), 'utf8'))) hasAddress.set(a.id, (a.addresses?.length ?? 0) > 0);
}
const out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : [];
const done = new Set(out.map((a) => a.id));

const POI = new Set(['amenity', 'shop', 'tourism', 'leisure', 'craft', 'office']);
// Ciudad de la fuente -> departamentos donde vale un resultado (Carrasco y el aeropuerto
// caen en Canelones; "Punta del Este" incluye La Barra, Manantiales y José Ignacio).
const STATES = {
  Montevideo: ['Montevideo', 'Canelones'], 'Punta del Este': ['Maldonado'], Colonia: ['Colonia'], Salto: ['Salto'],
  Rocha: ['Rocha'], 'Paysandú': ['Paysandú'], Mercedes: ['Soriano'],
};
const citiesOf = (m) => (m.address_hint || '').split(' / ').filter((c) => STATES[c]);
// Rubros de OSM que son "comida": un restaurante tiene que caer acá y una tienda no.
const FOOD = new Set(['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'food_court', 'biergarten', 'bakery', 'pastry',
  'deli', 'wine', 'confectionery', 'coffee', 'chocolate', 'butcher', 'cheese', 'alcohol', 'seafood', 'convenience', 'supermarket', 'hotel', 'winery']);
const rightKind = (m, r) => (m.category === 'gastronomia' ? FOOD.has(r.type) : m.category === 'supermercado' || !FOOD.has(r.type));
const key = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sameName = (a, b) => a.length >= 3 && b.length >= 3 && (` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `));
const near = (a, b) => Math.abs(a.lat - b.lat) < 0.001 && Math.abs(a.lng - b.lng) < 0.001;

// Pendientes: sin coordenada oficial y sin investigar, o investigados sin éxito pero con ciudad
// conocida (restaurantes que la búsqueda manual no encontró).
const pending = unified.filter((m) => m.commercial && !m.official_locations?.length && !done.has(m.id)
  && (!hasAddress.has(m.id) || (!hasAddress.get(m.id) && citiesOf(m).length)));

let found = 0;
for (const m of pending) {
  const states = citiesOf(m).flatMap((c) => STATES[c]);
  let results = [];
  try {
    results = await nominatim('search', { q: m.merchant, countrycodes: 'uy', limit: 15, addressdetails: 1 });
  } catch (e) {
    console.warn('  ! error', m.merchant, e.message);
    continue;                                      // sin entrada: se reintenta en la próxima corrida
  }
  const addresses = [];
  for (const r of results) {
    const loc = { lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
    const state = (r.address?.state || '').replace(/^departamento de\s+/i, '');
    if (!POI.has(r.category) || !rightKind(m, r) || !inUY(loc.lat, loc.lng) || !sameName(key(r.name), key(m.merchant))) continue;
    if (states.length && !states.includes(state)) continue;
    if (addresses.some((a) => near(a, loc))) continue;
    addresses.push({
      sucursal: r.address?.suburb || r.address?.city || r.address?.town || null,
      address: formatAddress(r.address || {}), ...loc, confidence: 0.6, source: 'osm',
      source_url: `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`,
    });
  }
  if (addresses.length) found++;
  out.push({ id: m.id, merchant: m.merchant, es_cadena: addresses.length > 1, status: addresses.length ? 'found' : 'not_found', addresses });
  writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
}

console.log(`=== BÚSQUEDA EN OSM === pendientes: ${pending.length} · encontrados: ${found}`);
const missing = out.filter((a) => a.status === 'not_found').map((a) => a.merchant);
if (missing.length) console.log(`Sin ubicar (${missing.length}):`, missing.join(', '));
console.log(`-> data/batches/addr/${OUT} escrito.`);
