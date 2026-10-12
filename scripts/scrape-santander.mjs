// Extrae los beneficios de Santander de su sitio y escribe data/raw/santander.json.
// La página de beneficios viene renderizada del servidor: trae los ~330 beneficios como
// "teasers" y un GeoJSON con la coordenada oficial de cada local adherido, así que estos
// comercios no necesitan búsqueda de direcciones ni geocoding.
import { fetchText, text, decodeEntities, splitByAmount, daysOf, sleep, writeRaw } from './lib/scrape-utils.mjs';

const BASE = 'https://www.santander.com.uy/beneficios?vista=grid';

// Categoría del sitio -> categoría canónica de consolidate.mjs.
const CATEGORY = {
  Autos: 'otros', 'Deco y hogar': 'hogar', Farmacia: 'salud', Fitness: 'bienestar',
  'Heladerías': 'gastronomia', Infantil: 'ninos', 'Librería': 'otros', Moda: 'moda',
  'Ruta Gourmet': 'gastronomia', Supermercados: 'supermercado', 'Tecnología': 'tecnologia',
  'Viajes y turismo': 'turismo', Otros: 'otros',
};

function parseTeasers(html) {
  const out = [];
  for (const [a] of html.matchAll(/<article\b[^>]*node--view-mode-teaser[^>]*>[\s\S]*?<\/article>/g)) {
    const markers = a.match(/data-marker-id="([^"]*)"/)?.[1];
    out.push({
      node_id: a.match(/data-history-node-id="(\d+)"/)[1],
      merchant: text(a.match(/field--name-title[^>]*>([\s\S]*?)<\/span>/)?.[1]),
      body: text(a.match(/field--name-body[^>]*>([\s\S]*?)<\/div>/)?.[1]),
      accepts_points: /<strong[^>]*>\s*Puntos\s*<\/strong>/.test(a),
      url: 'https://www.santander.com.uy' + (a.match(/href="(\/beneficios\/[^"?]+)"/)?.[1] ?? ''),
      marker_ids: markers ? JSON.parse(decodeEntities(markers)) : [],
    });
  }
  return out;
}

function parseMarkers(html) {
  const blobs = [...html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const settings = blobs.find((b) => b.includes('geofield_google_map'));
  const maps = settings ? JSON.parse(settings).geofield_google_map || {} : {};
  const byId = new Map();
  for (const map of Object.values(maps)) {
    for (const f of map.data?.features || []) {
      const [lng, lat] = f.geometry.coordinates;
      byId.set(String(f.properties.entity_id), { lat, lng });
    }
  }
  return byId;
}

function parseCategories(html) {
  const block = html.match(/data-drupal-selector="edit-categoria"[\s\S]*?<\/ul>/)?.[0] ?? '';
  return [...block.matchAll(/<a href="[^"]*categoria=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ id: m[1], name: text(m[2]) }));
}

// "25% con Platinum, Select y Private Banking" -> "Platinum/Select/Private".
const CARD_TOKEN = /\b(d[eé]bito\s+select|select\s+d[eé]bito|infinite|black|platinum|select|private|d[eé]bito|cr[eé]dito)\b/gi;
const CARD_LABEL = { infinite: 'Infinite', black: 'Black', platinum: 'Platinum', select: 'Select', private: 'Private', debito: 'débito', credito: 'crédito' };
function cardOf(chunk) {
  const hits = [...chunk.matchAll(CARD_TOKEN)].map((m) => m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const labels = hits.map((k) => (/select/.test(k) && /debito/.test(k) ? 'Select débito' : CARD_LABEL[k]));
  return [...new Set(labels)].join('/') || 'todas';
}

function parseDiscounts(body) {
  const { parts } = splitByAmount(body);
  return parts.map(({ amount, chunk }) => ({ card: cardOf(chunk), amount, days: daysOf(chunk), conditions: null }));
}

const html = await fetchText(BASE);
const teasers = parseTeasers(html);
const markers = parseMarkers(html);
if (teasers.length < 50 || markers.size < 50) {
  throw new Error(`Extracción sospechosa (${teasers.length} beneficios, ${markers.size} marcadores): ¿cambió el HTML del sitio?`);
}

// La categoría no viene en el teaser: se obtiene pidiendo el listado filtrado por cada una.
const categoryByNode = new Map();
for (const cat of parseCategories(html)) {
  await sleep(700);
  const filtered = parseTeasers(await fetchText(`${BASE}&categoria=${cat.id}`));
  for (const t of filtered) if (!categoryByNode.has(t.node_id)) categoryByNode.set(t.node_id, cat.name);
  console.log(`  categoría ${cat.name}: ${filtered.length}`);
}

const merchants = [];
const pointsOnly = [];
const unparsed = [];
for (const t of teasers) {
  let discounts = parseDiscounts(t.body);
  if (!discounts.length) {
    // Sin porcentaje. Si solo acepta canje de puntos no es un descuento y queda afuera; el
    // resto (Hipermás, "sujeto a promociones") se conserva con el texto del sitio como condición.
    if (/canje de puntos/i.test(t.body)) { pointsOnly.push({ merchant: t.merchant, url: t.url }); continue; }
    unparsed.push(t.merchant);
    discounts = [{ card: /hiperm[aá]s/i.test(t.body) ? 'Hipermás Santander' : 'todas', amount: null, days: null, conditions: t.body.slice(0, 160) }];
  }
  const siteCategory = categoryByNode.get(t.node_id) ?? null;
  merchants.push({
    merchant: t.merchant,
    category: CATEGORY[siteCategory] ?? 'otros',
    site_category: siteCategory,
    discounts,
    location_type: 'fisico',
    address_hint: null,
    text: t.body,
    accepts_points: t.accepts_points,
    url: t.url,
    locations: t.marker_ids.map((id) => markers.get(String(id))).filter(Boolean),
  });
}

writeRaw('santander.json', {
  source: 'santander',
  bank: 'Santander',
  scraped_at: new Date().toISOString(),
  scraped_note: `scripts/scrape-santander.mjs sobre ${BASE}`,
  merchants,
  points_only: pointsOnly,
});

const pins = merchants.reduce((n, m) => n + m.locations.length, 0);
console.log(`Santander: ${merchants.length} comercios con descuento (${pins} locales con coordenada oficial)`);
console.log(`  solo canje de puntos (excluidos): ${pointsOnly.length} · sin porcentaje (texto libre): ${unparsed.join(', ') || '—'}`);
console.log('-> data/raw/santander.json escrito.');
