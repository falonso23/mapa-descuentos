// Genera los lotes de los comercios comerciales restantes (los que no están en batch1).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const unified = JSON.parse(readFileSync(new URL('data/unified.json', root), 'utf8'));
const batch1 = JSON.parse(readFileSync(new URL('data/batches/batch1.json', root), 'utf8'));
const doneIds = new Set(batch1.map((m) => m.id));

const CHAINS = /\b(starbucks|farmashop|la pasiva|mcdonald|burger king|tata|devoto|disco|geant|movie|duty free|san roque|farmacia el tunel|el tunel|bela|firestone|mcdonalds|tienda inglesa|divino|abitab|redpagos|multiahorro|frog|kentucky|pizza|subway|walmart)\b/i;
const CHUNK = 30;

const rest = unified.filter((e) => e.commercial && !doneIds.has(e.id)).map((e) => ({
  id: e.id,
  merchant: e.merchant,
  category: e.category,
  city: e.city,
  address_hint: e.address_hint,
  es_cadena: CHAINS.test(e.merchant),
  providers: e.providers,
  benefits: e.benefits,
}));

mkdirSync(new URL('data/batches/rest/', root), { recursive: true });
let n = 0;
for (let i = 0; i < rest.length; i += CHUNK) {
  const chunk = rest.slice(i, i + CHUNK);
  const k = String(n).padStart(2, '0');
  writeFileSync(new URL(`data/batches/rest/chunk_${k}.json`, root), JSON.stringify(chunk, null, 1));
  n++;
}
console.log(`Restantes: ${rest.length} comercios en ${n} lotes de ${CHUNK}.`);
console.log('Cadenas detectadas:', rest.filter((r) => r.es_cadena).length);
