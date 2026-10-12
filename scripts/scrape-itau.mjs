// Extrae los beneficios de Itaú y escribe data/raw/itau.json. Dos fuentes oficiales:
//  - /inst/aci/inst_camp.xml: el feed que alimenta la SPA de beneficios. Trae una lista por
//    paquete (list_alimentacion es "Paquete Personal Bank") y coordenadas de algunos comercios.
//  - Las landings de restaurantes por segmento y la de moda Personal Bank: solo nombres
//    (logos), los restaurantes agrupados por ciudad.
import { fetchText, text, decodeEntities, splitByAmount, daysOf, dateRangeOf, sleep, writeRaw } from './lib/scrape-utils.mjs';

const SITE = 'https://www.itau.com.uy';
const FEED = `${SITE}/inst/aci/inst_camp.xml`;
// De la tarjeta más exclusiva a la menos: así se descartan los tramos que no suman nada.
const RESTAURANT_PAGES = [
  { url: `${SITE}/inst/restaurantespersonalbank.html`, card: 'Personal Bank/Infinite/Black' },
  { url: `${SITE}/inst/restaurantesplatinum.html`, card: 'Platinum' },
  { url: `${SITE}/inst/restaurantes.html`, card: 'crédito' },
];

const key = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const pct = (amount) => Number(amount?.match(/\d+/)?.[0] ?? 0);

// ---------- Landings de restaurantes ----------
const TAB_CITY = { 'tab-mvd': 'Montevideo', 'tab-pde': 'Punta del Este' };
const TOKEN = /id="(tab-[\w-]+)"|<(h[234])\b[^>]*>([\s\S]*?)<\/\2>|<p\b[^>]*>([\s\S]*?)<\/p>|<(div|a)\b([^>]*\bid="(?:restaurant|gourmet)-[^"]+"[^>]*)>([\s\S]*?)<\/\5>/g;
// El nombre va en el title de la tarjeta (un <div>, o un <a> si el local linkea a su Instagram).
const cardName = (attrs, inner) => decodeEntities(attrs.match(/\btitle="([^"]*)"/)?.[1] ?? inner.match(/\balt="([^"]*)"/)?.[1] ?? '').trim();

function parseLanding(html) {
  const start = html.indexOf('Seleccioná una ubicación');
  const end = html.indexOf('Bases y condiciones', start);
  const rows = [];
  let tab = null; let city = null; let amount = null; let days = null;
  for (const [, tabId, h, hText, pText, , attrs, inner] of html.slice(start, end > 0 ? end : undefined).matchAll(TOKEN)) {
    if (tabId) {
      tab = tabId; city = TAB_CITY[tabId] ?? null;
    } else if (h) {
      const head = text(hText);
      if (/^(restaurantes|tiendas gourmet)$/i.test(head)) city = TAB_CITY[tab] ?? null;
      else if (tab === 'tab-interior' && h === 'h2') city = head;   // en "Interior" cada h2 es una ciudad
    } else if (pText !== undefined) {
      const t = text(pText);
      if (/^\d{1,2}\s?%/.test(t)) amount = t.match(/^\d{1,2}\s?%/)[0].replace(' ', '');
      else if (/^todos los d[ií]as/i.test(t)) days = 'Todos los días';
    } else if (attrs !== undefined && city) {
      // La estrella marca los locales exclusivos del segmento de la landing.
      rows.push({ merchant: cardName(attrs, inner), city, amount, days, exclusive: /star/.test(inner) });
    }
  }
  return rows;
}

async function scrapeRestaurants() {
  const byName = new Map();
  for (const page of RESTAURANT_PAGES) {
    const rows = parseLanding(await fetchText(page.url));
    if (rows.length < 20) throw new Error(`Extracción sospechosa (${rows.length} locales) en ${page.url}: ¿cambió el HTML?`);
    console.log(`  ${page.card}: ${rows.length} locales`);
    for (const r of rows) {
      const k = key(r.merchant);
      if (!byName.has(k)) byName.set(k, { merchant: r.merchant, cities: new Set(), tiers: new Map(), exclusive: false });
      const e = byName.get(k);
      e.cities.add(r.city);
      e.exclusive ||= r.exclusive;
      const best = e.tiers.get(page.card);
      if (!best || pct(r.amount) > pct(best.amount)) e.tiers.set(page.card, { amount: r.amount, days: r.days });
    }
    await sleep(700);
  }
  return [...byName.values()].map((e) => {
    const discounts = [];
    RESTAURANT_PAGES.forEach(({ card }, i) => {
      const tier = e.tiers.get(card);
      if (!tier) return;
      // Un tramo sobra si una tarjeta menos exclusiva ya da lo mismo o más.
      const beaten = RESTAURANT_PAGES.slice(i + 1).some((p) => pct(e.tiers.get(p.card)?.amount) >= pct(tier.amount));
      if (!beaten) discounts.push({ card, amount: tier.amount, days: tier.days, conditions: e.exclusive && i === 0 ? 'Exclusivo Personal Bank' : null });
    });
    const cities = [...e.cities];
    return { merchant: e.merchant, category: 'gastronomia', city: cities[0], address_hint: cities.join(' / '), location_type: 'fisico', discounts, program: 'restaurantes' };
  });
}

// ---------- Landing de moda Personal Bank ----------
// Mismo formato de tarjetas con logo, pero sin ciudades: dos bloques ("25% menos" los martes
// y "15% menos" todos los días). La landing de moda común no nombra comercios.
const MODA_PB = { url: `${SITE}/inst/modapersonalbank.html`, card: 'Personal Bank/Infinite/Black' };
const MODA_TOKEN = /<p\b[^>]*>([\s\S]*?)<\/p>|<(?:div|a)\b([^>]*\bid="\d+-[^"]+"[^>]*)>(\s*<img\b[^>]*>)/g;

async function scrapeModa() {
  const html = await fetchText(MODA_PB.url);
  const end = html.indexOf('Bases y condiciones');
  const byName = new Map();
  let amount = null; let days = null;
  for (const [, pText, attrs, inner] of html.slice(0, end > 0 ? end : undefined).matchAll(MODA_TOKEN)) {
    if (pText !== undefined) {
      const t = text(pText);
      if (/^\d{1,2}\s?%/.test(t)) amount = t.match(/^\d{1,2}\s?%/)[0].replace(' ', '');
      else if (amount && daysOf(t)) days = daysOf(t);
    } else if (amount) {
      const name = cardName(attrs, inner);
      if (!byName.has(key(name))) {
        byName.set(key(name), {
          merchant: name, category: /[oó]ptica/i.test(name) ? 'salud' : 'moda', city: null, address_hint: null,
          location_type: 'fisico', discounts: [], program: 'moda',
        });
      }
      byName.get(key(name)).discounts.push({ card: MODA_PB.card, amount, days, conditions: null });
    }
  }
  if (byName.size < 10) throw new Error(`Extracción sospechosa (${byName.size} tiendas) en ${MODA_PB.url}: ¿cambió el HTML?`);
  return [...byName.values()];
}

// ---------- Feed XML ----------
const cdata = (s) => (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const field = (xml, tag) => text(cdata(xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]));

// El título del feed no siempre es el nombre del comercio ("25% y 15% menos en Mosca tecnología").
const NAME_FIXES = [
  [/t[uú]nel/i, 'Farmacia El Túnel'], [/san roque/i, 'San Roque'], [/mosca/i, 'Mosca'],
  [/mas ?infinito/i, 'Más Infinito'], [/punto ?color/i, 'Punto Color'], [/trios/i, 'Trios Lighting'],
  [/prat/i, 'Prat Pádel'],
];
const merchantName = (title) => NAME_FIXES.find(([re]) => re.test(title))?.[1]
  ?? (/\ben\s/i.test(title) ? title.replace(/^.*?\ben\s+/i, '').trim() : null);

const CATEGORY_HINTS = [
  [/farmacia|san roque/i, 'salud'], [/freddo|delicias/i, 'gastronomia'], [/movie/i, 'entretenimiento'],
  [/design|lighting|punto color|bosch/i, 'hogar'], [/p[aá]del|musculos/i, 'bienestar'],
];

function cardOf(chunk) {
  const pb = /personal bank/i.test(chunk); const plat = /platinum/i.test(chunk); const volar = /volar/i.test(chunk);
  const cred = /cr[eé]dito/i.test(chunk);
  if (volar && pb) return 'débito Volar/Junior + Personal Bank';
  if (volar) return cred ? 'crédito + débito Volar' : 'débito Volar';
  if (/todas las tarjetas de cr[eé]dito/i.test(chunk)) return 'crédito';
  if (pb) return plat ? 'Platinum/Infinite/Black/Personal Bank' : 'Personal Bank/Infinite/Black';
  if (plat) return 'Platinum';
  if (cred) return 'crédito';
  return /d[eé]bito/i.test(chunk) ? 'débito' : null;
}

function parseBenefit(description, lists) {
  const frags = splitByAmount(description).parts.map(({ amount, chunk }) => ({ amount, card: cardOf(chunk), days: daysOf(chunk) }));
  // Un tramo que no nombra tarjeta o días los toma del vecino: "20% los lunes y 15% todos
  // los días con Platinum", "25% con Personal Bank y 15% con Platinum los jueves y sábados".
  const fallbackCard = lists.length === 1 && lists[0] === 'alimentacion' ? 'Personal Bank' : 'crédito';
  frags.forEach((f, i) => {
    f.card ??= frags.slice(i + 1).find((x) => x.card)?.card ?? frags.slice(0, i).findLast((x) => x.card)?.card ?? fallbackCard;
  });
  const weekdays = [...new Set(frags.map((f) => f.days).filter((d) => d && d !== 'Todos los días'))];
  if (weekdays.length === 1) frags.forEach((f) => { f.days ??= weekdays[0]; });
  const range = dateRangeOf(description);
  const conditions = range ? range[0].toUpperCase() + range.slice(1) : null;
  return frags.map((f) => ({ ...f, conditions }));
}

async function scrapeFeed() {
  const xml = await fetchText(FEED);
  const items = new Map();
  for (const [, list, body] of xml.matchAll(/<list_(\w+)\b[^>]*>([\s\S]*?)<\/list_\1>/g)) {
    for (const [, attrs, inner] of body.matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)) {
      const id = attrs.match(/\bid="([^"]+)"/)?.[1];
      if (!items.has(id)) items.set(id, { inner, lists: [] });
      items.get(id).lists.push(list);
    }
  }
  if (items.size < 10) throw new Error(`Extracción sospechosa (${items.size} beneficios) en ${FEED}: ¿cambió el feed?`);

  const byName = new Map();
  const notMappable = [];
  for (const { inner, lists } of items.values()) {
    const title = field(inner, 'titulo');
    const description = field(inner, 'descripcion');
    const name = inner.includes('<final_item') ? merchantName(title) : null;
    const discounts = name ? parseBenefit(description, lists) : [];
    if (!discounts.length) {
      notMappable.push({ title, description: description || null, url: field(inner, 'url') || null, lists });
      continue;
    }
    const k = key(name);
    if (!byName.has(k)) {
      byName.set(k, {
        merchant: name, category: CATEGORY_HINTS.find(([re]) => re.test(name))?.[1] ?? 'otros', city: null,
        address_hint: null, location_type: 'fisico', discounts: [], text: [], locations: [],
      });
    }
    const e = byName.get(k);
    for (const d of discounts) {
      if (!e.discounts.some((x) => x.card === d.card && x.amount === d.amount && x.days === d.days)) e.discounts.push(d);
    }
    if (!e.text.includes(description)) e.text.push(description);
    for (const [, pin] of inner.matchAll(/<mapa_comercio\b[^>]*>([\s\S]*?)<\/mapa_comercio>/g)) {
      const lat = parseFloat(field(pin, 'latitud')); const lng = parseFloat(field(pin, 'longitud'));
      if (Number.isFinite(lat) && Number.isFinite(lng) && !e.locations.some((l) => l.lat === lat && l.lng === lng)) {
        e.locations.push({ lat, lng, sucursal: field(pin, 'nombre') || null });
      }
    }
  }
  const feedDate = field(xml, 'fecha');
  return { merchants: [...byName.values()], notMappable, feedDate };
}

console.log('Itaú: restaurantes por segmento');
const restaurants = await scrapeRestaurants();
const moda = await scrapeModa();
const feed = await scrapeFeed();

writeRaw('itau.json', {
  source: 'itau',
  bank: 'Itaú',
  scraped_at: new Date().toISOString(),
  feed_date: feed.feedDate,
  scraped_note: `scripts/scrape-itau.mjs sobre ${FEED} y ${[...RESTAURANT_PAGES, MODA_PB].map((p) => p.url.split('/').pop()).join(', ')}`,
  merchants: [...feed.merchants, ...restaurants, ...moda],
  not_mappable: feed.notMappable,
});

console.log(`Itaú: ${restaurants.length} restaurantes/tiendas gourmet + ${moda.length} tiendas de moda Personal Bank + ${feed.merchants.length} comercios del feed (${feed.notMappable.length} beneficios genéricos u online sin mapear)`);
console.log('-> data/raw/itau.json escrito.');
