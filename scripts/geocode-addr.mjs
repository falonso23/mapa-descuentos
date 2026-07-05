// PASO 2: convierte las DIRECCIONES (texto) encontradas por los agentes en coordenadas.
// Lee data/batches/addr/addr_*.json + batch1.json -> web/public/map-data.json
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
// Capitales departamentales + zonas frecuentes, para cubrir "todo Uruguay".
const CITY_RE = /montevideo|maldonado|canelones|punta del este|colonia|salto|paysand|rocha|piriapolis|las piedras|ciudad de la costa|mercedes|fray bentos|melo|rivera|artigas|san jos[eé]|trinidad|florida|durazno|tacuaremb[oó]|minas|treinta y tres/i;
function variants(addr) {
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
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
  V.push([`${street}, ${city}, ${country}`, 'exacta']);
  if (streetNoNum && streetNoNum !== street) V.push([`${streetNoNum}, ${city}, ${country}`, 'calle']);
  if (zone) V.push([`${zone}, ${city}, ${country}`, 'zona']);
  if (lastWord && lastWord.toLowerCase() !== streetNoNum.toLowerCase()) V.push([`${lastWord}, ${city}, ${country}`, 'calle-aprox']);
  V.push([`${city}, ${country}`, 'ciudad']); // último recurso: centro de la ciudad/zona
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
    // Si la dirección trae lat/lng cargados a mano (paradores sin numeración que
    // Nominatim no ubica), se respetan y no se geocodifica.
    if (typeof ad.lat === 'number' && typeof ad.lng === 'number') {
      locations.push({ lat: ad.lat, lng: ad.lng, address: ad.address, sucursal: ad.sucursal || null, confidence: ad.confidence ?? null, precision: 'manual', source: 'manual' });
      pins++;
      continue;
    }
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

writeFileSync(new URL('web/public/map-data.json', root), JSON.stringify(mapData));
console.log('=== PASO 2: DIRECCIONES -> COORDENADAS ===');
console.log(`Con ubicación: ${ok} · sin dirección: ${noAddr} · dirección no geocodificó: ${geoFail} · pines: ${pins}`);
const fails = mapData.filter((m) => !m.locations.length).map((m) => m.merchant);
if (fails.length) console.log('Sin ubicación:', fails.join(', '));
console.log('-> web/public/map-data.json escrito.');
