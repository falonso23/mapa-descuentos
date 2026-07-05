// Consolida los data/raw/*.json de cada proveedor en un dataset unificado y deduplicado.
// Diseño: un "adaptador" por fuente -> registros normalizados -> merge por comercio.
// Agregar un proveedor nuevo = escribir un adaptador y sumarlo a ADAPTERS.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

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
  // Santander y Club El País comparten el esquema {merchants:[{merchant,category,discounts,location_type,address_hint}]}
  const d = read(file);
  for (const m of d.merchants || []) {
    push({
      merchant: m.merchant,
      category: normCat(m.category),
      city: null,
      address_hint: m.address_hint || null,
      location_type: m.location_type || 'fisico',
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

function adaptItau() {
  const d = read('itau.json');
  for (const m of d.featured_named_merchants || []) {
    push({
      merchant: m.merchant, category: normCat(m.category), city: m.address_hint || null,
      address_hint: m.address_hint || null, location_type: m.location_type || 'fisico',
      benefits: (m.discounts || []).map((x) => ({ provider: 'Itaú', product: x.card || 'crédito', amount: x.amount, days: x.days, conditions: x.conditions })),
    });
  }
  const prog = d.restaurants_program;
  if (prog) {
    for (const [city, list] of Object.entries(prog.by_city || {})) {
      const cityName = city.split('_')[0];
      const cat = /gourmet/.test(city) ? 'gastronomia' : /libreri/.test(city) ? 'otros' : 'gastronomia';
      for (const name of list) {
        push({
          merchant: name, category: cat, city: cityName, address_hint: cityName,
          location_type: 'fisico',
          benefits: [{ provider: 'Itaú', product: prog.card, amount: prog.discount, days: prog.days, conditions: `Programa restaurantes ${cityName}` }],
        });
      }
    }
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
  adaptItau,
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
      benefits: [], providers: new Set(),
      mappable: isMappable(r.merchant, r._rawText || '', r.location_type),
      lat: null, lng: null, geocode_status: 'pending',
    });
  }
  const e = byKey.get(key);
  e.benefits.push(...r.benefits);
  r.benefits.forEach((b) => e.providers.add(b.provider));
  if (!e.city && r.city) e.city = r.city;
  if (!e.address_hint && r.address_hint) e.address_hint = r.address_hint;
  if (r.category && r.category !== 'otros' && e.category === 'otros') e.category = r.category;
}

const unified = [...byKey.values()].map((e, i) => ({
  id: i + 1, ...e, providers: [...e.providers],
  commercial: e.mappable && !EXCLUDE_CATS.has(e.category),
}));

// ---------- Stats ----------
const commercial = unified.filter((e) => e.commercial);
const byProvider = {};
for (const e of commercial) for (const p of e.providers) byProvider[p] = (byProvider[p] || 0) + 1;
const byCat = {};
for (const e of commercial) byCat[e.category] = (byCat[e.category] || 0) + 1;
const excluded = unified.filter((e) => !e.commercial);
const multiSource = commercial.filter((e) => e.providers.length > 1);

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/unified.json', import.meta.url), JSON.stringify(unified, null, 2));

console.log('=== CONSOLIDACIÓN ===');
console.log('Registros crudos (pre-dedup):', records.length);
console.log('Comercios únicos (post-dedup):', unified.length);
console.log('  -> COMERCIALES mapeables (a geocodificar):', commercial.length);
console.log('  -> excluidos (genéricos/financieros/educación/turismo/online):', excluded.length);
console.log('Comercios en +1 proveedor:', multiSource.length, '=>',
  multiSource.slice(0, 12).map((e) => `${e.merchant}(${e.providers.join('+')})`).join(', '));
console.log('Comerciales por proveedor:', byProvider);
console.log('Comerciales por categoría:', byCat);
console.log('\n-> data/unified.json escrito (', unified.length, 'entradas, campo commercial=true/false).');
