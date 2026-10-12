// Consolida los data/raw/*.json de cada proveedor en un dataset unificado y deduplicado.
// Diseño: un "adaptador" por fuente -> registros normalizados -> merge por comercio.
// Agregar un proveedor nuevo = escribir un adaptador y sumarlo a ADAPTERS.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const RAW = new URL('../data/raw/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, RAW), 'utf8'));

// --- normalización de nombre para deduplicar entre fuentes ---
const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')   // saca acentos
  .replace(/["'`]/g, '')
  .replace(/\b(oca|santander|itau|club el pais)\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// --- normalización de categorías a un set canónico ---
const CANON = {
  gastronomia: 'gastronomia', 'gastronomía': 'gastronomia', restaurante: 'gastronomia', restaurantes: 'gastronomia',
  moda: 'moda', vestimenta: 'moda', 'moda/vestimenta': 'moda', ropa: 'moda', indumentaria: 'moda',
  calzado: 'calzado',
  hogar: 'hogar', deco: 'hogar', 'hogar/deco': 'hogar', muebles: 'hogar', electro: 'hogar',
  salud: 'salud', optica: 'salud', 'óptica': 'salud', 'salud/optica': 'salud', farmacia: 'salud',
  bienestar: 'bienestar', belleza: 'bienestar', fitness: 'bienestar',
  supermercado: 'supermercado',
  entretenimiento: 'entretenimiento', cine: 'entretenimiento',
  tecnologia: 'tecnologia', 'tecnología': 'tecnologia',
  ninos: 'ninos', 'niños': 'ninos', infantil: 'ninos',
  // NO comerciales -> excluidos
  educacion: 'educacion', 'educación': 'educacion',
  turismo: 'turismo', viajes: 'turismo', 'viajes/turismo': 'turismo',
  otros: 'otros',
};
const EXCLUDE_CATS = new Set(['educacion', 'turismo']);
const normCat = (c) => CANON[(c || '').toLowerCase().trim()] || 'otros';

// inferencia de categoría por palabras clave (para OCA y fallbacks)
const CAT_KEYWORDS = [
  ['turismo', /\b(viaj|hiperviajes|avis|hotel|pasaje|turismo|vuelo|aerol|resort|cabaña)\b/i],
  ['educacion', /\b(coderhouse|curso|educaci|instituto|academia|idiomas|universidad)\b/i],
  ['gastronomia', /\b(resto|restaurant|burger|cafe|café|helader|pizza|bar\b|comida|parrilla|sushi|bela|chaj[aá]|mcdonald|bk\b|starbucks)\b/i],
  ['supermercado', /\b(tata|macromercado|macro\b|tienda inglesa|devoto|disco|geant|super)\b/i],
  ['tecnologia', /\b(iplace|apple|iphone|electroventas|samsung|notebook|celular|tecno)\b/i],
  ['salud', /\b(farmacia|optica|óptica|san roque|el tunel|salud|dental|farmashop)\b/i],
  ['moda', /\b(moda|indumentaria|ropa|calzado|divino|loi\b|zapat|tienda de ropa)\b/i],
  ['hogar', /\b(hogar|electro|mueble|ferreter|emporio del hogar|firestone|neumatic|deco)\b/i],
  ['bienestar', /\b(gimnasio|fitness|spa|belleza|peluquer|wellness|musculo)\b/i],
  ['entretenimiento', /\b(movie|cine|teatro|espectac|show)\b/i],
];
const inferCat = (text) => {
  for (const [cat, re] of CAT_KEYWORDS) if (re.test(text)) return cat;
  return 'otros';
};

// --- heurística: ¿es un beneficio geolocalizable (comercio físico con nombre)? ---
const FINANCIAL = /\b(cuotas?|telepeaje|patente|exterior|arg|bra|chi|ee\.?uu|mexico|metros|debito automatico|transferenc|prestamo|seguro|adelanto|token|mi cuenta|blue\b|cashback|reintegro sin comercio)\b/i;
const GENERIC = /\b(en restaurantes|en moda|en tus tiendas|comercios adheridos|locales adheridos|productos seleccionados|categorias seleccionadas)\b/i;
const isMappable = (name, text, location_type) => {
  const t = `${name} ${text}`;
  if (location_type === 'online') return false;
  if (GENERIC.test(t)) return false;
  // financiero puro sin comercio nombrado
  if (FINANCIAL.test(t) && !/[A-Z][a-z]{3,}/.test(name)) return false;
  return true;
};

const records = [];
const push = (r) => records.push(r);

// ---------- Adaptadores ----------
function adaptStandard(file, provider) {
  // Santander, Club El País e Itaú comparten el esquema {merchants:[{merchant,category,discounts,location_type,address_hint}]}.
  // Los scrapers pueden sumar `city` y `locations` (coordenadas que publica el propio banco).
  const d = read(file);
  for (const m of d.merchants || []) {
    push({
      merchant: m.merchant,
      category: normCat(m.category),
      city: m.city || null,
      address_hint: m.address_hint || null,
      location_type: m.location_type || 'fisico',
      official_locations: (m.locations || []).map((l) => ({ ...l, source: d.source })),
      benefits: (m.discounts || []).map((x) => ({
        provider,
        product: x.card || 'todas',
        amount: x.amount || null,
        days: x.days || null,
        conditions: x.conditions || null,
      })),
    });
  }
}

function adaptOca() {
  const d = read('oca.json');
  for (const m of d.merchants || []) {
    if (m.category === 2) continue;               // 2 = Espectáculos -> excluir eventos
    const text = `${m.title} ${m.description}`;
    // excluir campañas momentáneas puras (título es solo un rango de fechas)
    if (/^\s*(del|hasta)\s+\d/i.test(m.title || '')) continue;
    push({
      merchant: m.name, category: inferCat(text), city: null, address_hint: null,
      location_type: 'fisico',
      _rawText: text,
      benefits: [{ provider: 'OCA', product: 'crédito/débito', amount: null, days: null, conditions: (m.title || '').slice(0, 140) }],
    });
  }
}

const ADAPTERS = [
  () => adaptStandard('santander.json', 'Santander'),
  () => adaptStandard('clubelpais.json', 'Club El País'),
  () => adaptStandard('itau.json', 'Itaú'),
  adaptOca,
];
ADAPTERS.forEach((fn) => fn());

// ---------- Merge / dedup por nombre normalizado ----------
const byKey = new Map();
for (const r of records) {
  const key = norm(r.merchant);
  if (!key) continue;
  if (!byKey.has(key)) {
    byKey.set(key, {
      merchant: r.merchant, norm: key, category: r.category,
      city: r.city, address_hint: r.address_hint, location_type: r.location_type,
      benefits: [], providers: new Set(), official_locations: [],
      mappable: isMappable(r.merchant, r._rawText || '', r.location_type),
      lat: null, lng: null, geocode_status: 'pending',
    });
  }
  const e = byKey.get(key);
  e.benefits.push(...r.benefits);
  e.official_locations.push(...(r.official_locations || []));
  r.benefits.forEach((b) => e.providers.add(b.provider));
  if (!e.city && r.city) e.city = r.city;
  if (!e.address_hint && r.address_hint) e.address_hint = r.address_hint;
  if (r.category && r.category !== 'otros' && e.category === 'otros') e.category = r.category;
}

// ---------- Ids estables ----------
// El id es la clave de las direcciones guardadas en data/batches/addr/, así que un comercio
// conserva el suyo entre corridas y el de uno dado de baja no se reasigna nunca. El registro
// arranca de los ids del unified.json anterior (que eran posicionales).
const registryPath = new URL('../data/id-registry.json', import.meta.url);
const unifiedPath = new URL('../data/unified.json', import.meta.url);
const registry = existsSync(registryPath)
  ? JSON.parse(readFileSync(registryPath, 'utf8'))
  : Object.fromEntries((existsSync(unifiedPath) ? JSON.parse(readFileSync(unifiedPath, 'utf8')) : []).map((e) => [e.norm, e.id]));
let nextId = Math.max(0, ...Object.values(registry)) + 1;
const added = [];
for (const e of byKey.values()) {
  if (registry[e.norm] === undefined) { registry[e.norm] = nextId++; added.push(e.merchant); }
}
const current = new Set(byKey.keys());
const removed = Object.keys(registry).filter((k) => !current.has(k));

const unified = [...byKey.values()].map((e) => ({
  id: registry[e.norm], ...e, providers: [...e.providers],
  commercial: e.mappable && !EXCLUDE_CATS.has(e.category),
})).sort((a, b) => a.id - b.id);

// ---------- Stats ----------
const commercial = unified.filter((e) => e.commercial);
const byProvider = {};
for (const e of commercial) for (const p of e.providers) byProvider[p] = (byProvider[p] || 0) + 1;
const byCat = {};
for (const e of commercial) byCat[e.category] = (byCat[e.category] || 0) + 1;
const excluded = unified.filter((e) => !e.commercial);
const multiSource = commercial.filter((e) => e.providers.length > 1);

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(unifiedPath, JSON.stringify(unified, null, 2));
writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');

console.log('=== CONSOLIDACIÓN ===');
console.log('Registros crudos (pre-dedup):', records.length);
console.log('Comercios únicos (post-dedup):', unified.length);
console.log('  -> COMERCIALES mapeables (a geocodificar):', commercial.length);
console.log('  -> excluidos (genéricos/financieros/educación/turismo/online):', excluded.length);
console.log('Comercios en +1 proveedor:', multiSource.length, '=>',
  multiSource.slice(0, 12).map((e) => `${e.merchant}(${e.providers.join('+')})`).join(', '));
console.log('Comerciales por proveedor:', byProvider);
console.log('Comerciales por categoría:', byCat);
console.log(`Altas: ${added.length} · ya no figuran en ninguna fuente: ${removed.length}`);
console.log('\n-> data/unified.json escrito (', unified.length, 'entradas, campo commercial=true/false).');
