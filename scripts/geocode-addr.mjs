// PASO 2: arma el dataset del mapa (web/public/map-data.json) con la ubicación de cada comercio.
// Las ubicaciones salen de dos lados:
//  - coordenadas oficiales que publica el banco (official_locations en data/unified.json): se
//    usan tal cual y solo se les busca la dirección (texto) con geocoding inverso;
//  - direcciones (texto) de data/batches/addr/*.json: se convierten en coordenadas.
// Nominatim, 1 req/s, con caché reanudable en data/geocache.json.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { nominatim, formatAddress, inUY } from './lib/nominatim.mjs';

const root = new URL('../', import.meta.url);

const unified = JSON.parse(readFileSync(new URL('data/unified.json', root), 'utf8'));
const byId = new Map(unified.filter((e) => e.commercial).map((m) => [m.id, m]));

const addrDir = new URL('data/batches/addr/', root);
const addrById = new Map();
if (existsSync(addrDir)) {
  // En orden alfabético: los lotes, después osm_auto.json y al final zz_supplemental.json, que
  // pisa a todos (correcciones manuales).
  for (const f of readdirSync(addrDir).filter((f) => f.endsWith('.json')).sort()) {
    let arr; try { arr = JSON.parse(readFileSync(new URL(f, addrDir), 'utf8')); } catch (e) { console.warn('skip', f, e.message); continue; }
    for (const a of arr) addrById.set(a.id, a);
  }
}

const cachePath = new URL('data/geocache.json', root);
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};

// Limpia y genera variantes de consulta, de más precisa a más aproximada.
// Capitales departamentales + zonas frecuentes, para cubrir "todo Uruguay".
const CITY_RE = /montevideo|maldonado|canelones|punta del este|colonia|salto|paysand|rocha|piriapolis|las piedras|ciudad de la costa|mercedes|fray bentos|melo|rivera|artigas|san jos[eé]|trinidad|florida|durazno|tacuaremb[oó]|minas|treinta y tres/i;
function variants(addr) {
  // "km 163,5": la coma decimal no separa tramos.
  const parts = addr.replace(/(km\.?\s*\d+),(\d)/gi, '$1.$2').split(',').map((s) => s.trim()).filter(Boolean);
  const country = 'Uruguay';
  // La ciudad se busca SOLO entre las partes que no son la calle (parts[0]), para no
  // confundir nombres de calle que contienen "Salto", ni nombres de shopping ("Montevideo
  // Shopping") con la ciudad real.
  const fallbackCity = (parts[parts.length - 2] || 'Montevideo').replace(/^departamento de\s+/i, '');
  const city = parts.slice(1).find((p) => CITY_RE.test(p) && !/shopping/i.test(p)) || fallbackCity;
  // Si la dirección viene "Nombre del Shopping, Calle NNN, ..." usamos la calle (parts[1]),
  // no el nombre del shopping, como texto a limpiar/geocodificar.
  const streetRaw = /shopping/i.test(parts[0]) && parts[1] ? parts[1] : parts[0];
  let street = streetRaw
    .replace(/\s+esq\.?\s+.*/i, '')          // saca "esq. ..."
    .replace(/\s+esquina\s+.*/i, '')
    .replace(/,?\s*(local|loc\.?|piso|of\.?|oficina)\s*\S+.*/i, '') // unidad
    .replace(/\bav\.\s*/i, 'Avenida ')
    .replace(/\bcnel\.\s*/i, 'Coronel ')
    .replace(/\bgral\.\s*/i, 'General ')
    .replace(/\bdr\.\s*/i, 'Doctor ')
    .replace(/\bbr\.\s*|\bbvar\.\s*/i, 'Bulevar ')
    .replace(/\bfco\.\s*/i, 'Francisco ')
    .replace(/\bmcal\.\s*/i, 'Mariscal ')
    .replace(/\s+/g, ' ').trim();
  const streetNoNum = street.replace(/\s+\d+.*$/, '').trim(); // sin número
  // último fallback dentro de la calle: solo el último término (apellido de la calle),
  // Nominatim a veces no indexa "Pedro F. Berro" pero sí "Berro".
  const lastWord = streetNoNum.split(' ').filter((w) => w.length > 2).pop();
  const zone = parts[1] && parts[1] !== city && !/shopping/i.test(parts[1]) ? parts[1] : null; // barrio
  const V = [];
  // "Ruta 10 km 164.5, Manantiales, Maldonado": el número es un kilómetro, no una puerta, y
  // Nominatim no los entiende: "Ruta 10, Maldonado" cae en cualquier punto de la ruta. Se busca
  // la ruta en cada localidad que nombra la dirección y, si no nombra ninguna, la calle del cruce
  // o el centro de la ciudad (para afinar esos casos: `lat`/`lng` a mano en zz_supplemental.json).
  const route = street.match(/^ruta\s+\d+/i)?.[0];
  if (route) {
    for (const place of parts.slice(1, -1).filter((p) => p !== city && !/shopping/i.test(p))) {
      V.push([`${route}, ${place}, ${country}`, 'calle'], [`${place}, ${city}, ${country}`, 'zona']);
    }
    const cross = streetRaw.match(/\s+(?:y|esq\.?|esquina)\s+(.+)$/i)?.[1];
    if (cross && !/^ruta\s/i.test(cross)) V.push([`${cross}, ${city}, ${country}`, 'calle-aprox']);
    V.push([`${city}, ${country}`, 'ciudad']);
    return V;
  }
  V.push([`${street}, ${city}, ${country}`, 'exacta']);
  if (streetNoNum && streetNoNum !== street) V.push([`${streetNoNum}, ${city}, ${country}`, 'calle']);
  if (zone) V.push([`${zone}, ${city}, ${country}`, 'zona']);
  if (lastWord && lastWord.toLowerCase() !== streetNoNum.toLowerCase()) V.push([`${lastWord}, ${city}, ${country}`, 'calle-aprox']);
  V.push([`${city}, ${country}`, 'ciudad']); // último recurso: centro de la ciudad/zona
  return V;
}

async function search(q) {
  const j = await nominatim('search', { countrycodes: 'uy', limit: 1, q });
  return j[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), display: j[0].display_name } : null;
}

async function geocode(addr) {
  if (cache[addr] && cache[addr].lat) return cache[addr];
  let out = null;
  for (const [q, precision] of variants(addr)) {
    if (cache[q] === null) continue;              // ya sabemos que falla
    let r = cache[q];
    if (r === undefined) {
      try { r = await search(q); } catch (e) { r = null; console.warn('  ! error', q.slice(0, 40), e.message); }
      cache[q] = r; writeFileSync(cachePath, JSON.stringify(cache));
    }
    if (r && inUY(r.lat, r.lng)) { out = { ...r, precision }; break; }
  }
  cache[addr] = out;
  writeFileSync(cachePath, JSON.stringify(cache));
  return out;
}

// Dirección (texto) de una coordenada oficial: la web la muestra y deriva de ella el departamento.
async function reverse(lat, lng) {
  const k = `rev:${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (cache[k] === undefined) {
    try {
      const j = await nominatim('reverse', { lat, lon: lng, zoom: 18, addressdetails: 1 });
      cache[k] = j.address ? formatAddress(j.address) : null;
      writeFileSync(cachePath, JSON.stringify(cache));
    } catch (e) { console.warn('  ! error reverse', k, e.message); }   // no se cachea: se reintenta
  }
  return cache[k] ?? null;
}

const SOURCE_PROVIDER = { santander: 'Santander', itau: 'Itaú' };
const SCRAPED = new Set(Object.values(SOURCE_PROVIDER));
const APPROX = new Set(['zona', 'calle-aprox', 'ciudad']);
const km = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 92);

const mapData = [];
let ok = 0, noAddr = 0, geoFail = 0, pins = 0, official = 0;

for (const m of byId.values()) {
  const a = addrById.get(m.id);
  const fromBank = m.official_locations || [];
  if (!a && !fromBank.length) continue;             // todavía sin investigar

  const saved = [];
  for (const ad of a?.addresses || []) {
    if (!ad.address) continue;
    // Si la dirección ya trae lat/lng (cargados a mano o tomados de OSM), se respetan y no se
    // geocodifica.
    if (typeof ad.lat === 'number' && typeof ad.lng === 'number') {
      saved.push({ lat: ad.lat, lng: ad.lng, address: ad.address, sucursal: ad.sucursal || null, confidence: ad.confidence ?? null, precision: ad.source ? 'exacta' : 'manual', source: ad.source || 'manual' });
      continue;
    }
    const g = await geocode(ad.address);
    if (g && inUY(g.lat, g.lng)) {
      saved.push({ lat: g.lat, lng: g.lng, address: ad.address, sucursal: ad.sucursal || null, confidence: ad.confidence ?? null, precision: g.precision, source: 'nominatim' });
    }
  }

  // Los locales que publica el banco mandan. Si hay una dirección guardada a menos de 200 m es
  // el mismo local: queda la coordenada del banco con el texto investigado a mano.
  const locations = [];
  for (const o of fromBank) {
    if (!inUY(o.lat, o.lng) || locations.some((l) => km(l, o) < 0.02)) continue;
    const i = saved.findIndex((s) => km(s, o) < 0.2);
    const twin = i >= 0 ? saved.splice(i, 1)[0] : null;
    locations.push({
      lat: o.lat, lng: o.lng, address: twin?.address ?? await reverse(o.lat, o.lng), sucursal: o.sucursal || twin?.sucursal || null,
      confidence: 1, precision: 'exacta', source: o.source,
    });
  }
  official += locations.length;
  // Las direcciones guardadas que sobran se suman solo si el beneficio también viene de una
  // fuente sin locales oficiales, y nunca las aproximadas cuando ya hay un pin exacto.
  const covered = new Set(fromBank.map((o) => SOURCE_PROVIDER[o.source]));
  if (!m.providers.every((p) => covered.has(p))) locations.push(...saved.filter((s) => !locations.length || !APPROX.has(s.precision)));

  pins += locations.length;
  if (locations.length) ok++;
  else if (a?.addresses?.length) geoFail++;
  else noAddr++;
  mapData.push({
    id: m.id, merchant: a?.resolved_name || m.merchant, category: m.category,
    providers: m.providers, benefits: m.benefits, es_cadena: a?.es_cadena || locations.length > 1, locations,
    // Sin pin todavía. Los de Santander/Itaú son comercios reales (OCA mezcla promos sin local),
    // así que van igual a la lista, con la ciudad que publica el banco si la dice.
    ...(!locations.length && m.providers.some((p) => SCRAPED.has(p)) ? { zone: m.city || '' } : {}),
  });
}

writeFileSync(new URL('web/public/map-data.json', root), JSON.stringify(mapData));
console.log('=== PASO 2: UBICACIONES ===');
console.log(`Con ubicación: ${ok} · sin dirección: ${noAddr} · dirección no geocodificó: ${geoFail} · pines: ${pins} (${official} con coordenada oficial)`);
const fails = mapData.filter((m) => !m.locations.length).map((m) => m.merchant);
if (fails.length) console.log('Sin ubicación:', fails.join(', '));
console.log('-> web/public/map-data.json escrito.');
