// Selecciona un lote de validación (~40 comercios) representativo para geocodificar primero.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const d = JSON.parse(readFileSync(new URL('../data/unified.json', import.meta.url), 'utf8'));

const CHAINS = /\b(starbucks|farmashop|la pasiva|mcdonald|burger king|tata|devoto|disco|geant|movie|duty free|san roque|farmacia el tunel|el tunel)\b/i;
const isChain = (n) => CHAINS.test(n);

const commercial = d.filter((e) => e.commercial);
const pick = new Map();
const add = (e) => { if (e && !pick.has(e.id)) pick.set(e.id, e); };

// 1) cadenas conocidas (para probar multi-sucursal)
commercial.filter((e) => isChain(e.merchant)).slice(0, 6).forEach(add);
// 2) restaurantes Itaú Montevideo (sucursal única, fáciles)
commercial.filter((e) => e.city === 'Montevideo' && e.category === 'gastronomia').slice(0, 18).forEach(add);
// 3) Santander variado
commercial.filter((e) => e.providers.includes('Santander') && !isChain(e.merchant)).slice(0, 8).forEach(add);
// 4) Club El País gastronomía/moda
commercial.filter((e) => e.providers.includes('Club El País') && ['gastronomia', 'moda'].includes(e.category) && !isChain(e.merchant)).slice(0, 6).forEach(add);
// 5) OCA con marca clara en el título
commercial.filter((e) => e.providers.includes('OCA') && /burger king|tata|divino|firestone|bela/i.test(JSON.stringify(e.benefits))).slice(0, 4).forEach(add);

const batch = [...pick.values()].slice(0, 42).map((e) => ({
  id: e.id,
  merchant: e.merchant,
  category: e.category,
  city: e.city,
  address_hint: e.address_hint,
  es_cadena: isChain(e.merchant),
  providers: e.providers,
  benefits: e.benefits,
  locations: [],           // <- lo llena la geocodificación
  geocode_status: 'pending',
}));

mkdirSync(new URL('../data/batches/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/batches/batch1.json', import.meta.url), JSON.stringify(batch, null, 2));
console.log('Lote 1:', batch.length, 'comercios');
console.log('Cadenas:', batch.filter((b) => b.es_cadena).map((b) => b.merchant).join(', '));
console.log('Únicos:', batch.filter((b) => !b.es_cadena).map((b) => b.merchant).join(', '));
