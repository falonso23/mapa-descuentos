// PASO 2: convierte las DIRECCIONES (texto) encontradas por los agentes en coordenadas.
// Lee data/batches/addr/addr_*.json + batch1.json -> app/map-data.js
// Nominatim, 1 req/s, con caché reanudable en data/geocache.json.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const UA = 'MapaDescuentosUY/1.0 (proyecto personal)';
const SLEEP = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = new URL('../', import.meta.url);

const unified = JSON.parse(readFileSync(new URL('data/unified.json', root), 'utf8'));
const byId = new Map(unified.filter((e) => e.commercial).map((m) => [m.id, m]));

const addrDir = new URL('data/batches/addr/', root);
const addrById = new Map();
if (existsSync(addrDir)) {
  for (const f of readdirSync(addrDir).filter((f) => f.endsWith('.json'))) {
    let arr; try { arr = JSON.parse(readFileSync(new URL(f, addrDir), 'utf8')); } catch (e) { console.warn('skip', f, e.message); continue; }
    for (const a of arr) addrById.set(a.id, a);
  }
}

const cachePath = new URL('data/geocache.json', root);
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const inUY = (lat, lon) => lat < -30 && lat > -35.5 && lon < -53 && lon > -58.5;

// Limpia y genera variantes de consulta, de más precisa a más aproximada.
function variants(addr) {
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
  // detectar ciudad y país al final
  const country = 'Uruguay';
  const city = parts.find((p) => /montevideo|maldonado|canelones|punta del este|colonia|salto|paysand|rocha|piriapolis|las piedras|ciudad de la costa/i.test(p)) || parts[parts.length - 2] || 'Montevideo';
  let street = parts[0]
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
  const zone = parts[1] && parts[1] !== city ? parts[1] : null; // barrio
  const V = [];
  V.push([`${street}, ${city}, ${country}`, 'exacta']);
  if (streetNoNum && streetNoNum !== street) V.push([`${streetNoNum}, ${city}, ${country}`, 'calle']);
  if (zone) V.push([`${zone}, ${city}, ${country}`, 'zona']);
  return V;
}

async function nominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=uy&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  return j[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), display: j[0].display_name } : null;
}

async function geocode(addr) {
  if (cache[addr] && cache[addr].lat) return cache[addr];
  let out = null;
  for (const [q, precision] of variants(addr)) {
    if (cache[q] === null) continue;              // ya sabemos que falla
    let r = cache[q];
    if (r === undefined) {
      try { r = await nominatim(q); } catch (e) { r = null; console.warn('  ! error', q.slice(0, 40), e.message); }
      cache[q] = r; writeFileSync(cachePath, JSON.stringify(cache)); await sleep(SLEEP);
    }
    if (r && inUY(r.lat, r.lng)) { out = { ...r, precision }; break; }
  }
  cache[addr] = out;
  writeFileSync(cachePath, JSON.stringify(cache));
  return out;
}

const mapData = [];
let ok = 0, noAddr = 0, geoFail = 0, pins = 0;

// Procesa solo los comercios que ya tienen archivo de direcciones (los lotes completados).
for (const [id, a] of addrById) {
  const m = byId.get(id);
  if (!m) continue;
  const addresses = a?.addresses || [];
  const locations = [];
  for (const ad of addresses) {
    if (!ad.address) continue;
    const g = await geocode(ad.address);
    if (g && inUY(g.lat, g.lng)) {
      locations.push({ lat: g.lat, lng: g.lng, address: ad.address, sucursal: ad.sucursal || null, confidence: ad.confidence ?? null, precision: g.precision, source: 'nominatim' });
      pins++;
    }
  }
  if (!addresses.length) noAddr++;
  else if (!locations.length) geoFail++;
  else ok++;
  mapData.push({
    id: m.id, merchant: a?.resolved_name || m.merchant, category: m.category,
    providers: m.providers, benefits: m.benefits, es_cadena: a?.es_cadena || false, locations,
  });
}

writeFileSync(new URL('app/map-data.js', root), 'window.MAP_DATA = ' + JSON.stringify(mapData) + ';\n');
console.log('=== PASO 2: DIRECCIONES -> COORDENADAS ===');
console.log(`Con ubicación: ${ok} · sin dirección: ${noAddr} · dirección no geocodificó: ${geoFail} · pines: ${pins}`);
const fails = mapData.filter((m) => !m.locations.length).map((m) => m.merchant);
if (fails.length) console.log('Sin ubicación:', fails.join(', '));
console.log('-> app/map-data.js escrito.');
