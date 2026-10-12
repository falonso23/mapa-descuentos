// Utilidades compartidas por los scrapers (scrape-*.mjs). Sin dependencias: Node 22 + regex.
import { writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-UY,es;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.text();
}

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
export const decodeEntities = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(\w+);/g, (m, n) => ENTITIES[n] ?? m);

// HTML -> texto plano en una línea.
export const text = (html) => decodeEntities((html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Parte un texto libre en un tramo por cada monto ("25% ... 15% ..." -> 2 tramos). `prefix`
// es lo que viene antes del primer monto (suele ser la vigencia: "Del 10 al 30 de octubre").
const AMOUNT = /(?:hasta\s+)?\d{1,2}\s?%|\b\dx\d\b/i;
export function splitByAmount(s) {
  const marks = [...s.matchAll(new RegExp(AMOUNT.source, 'gi'))];
  if (!marks.length) return { prefix: s.trim(), parts: [] };
  const parts = marks.map((m, i) => {
    const chunk = s.slice(m.index, marks[i + 1]?.index ?? s.length).trim();
    const amount = m[0].replace(/\s+/g, ' ').replace(/\s%/, '%').replace(/^hasta/i, 'Hasta');
    return { amount, chunk };
  });
  return { prefix: s.slice(0, marks[0].index).trim(), parts };
}

const WEEKDAYS = /\b(lunes|martes|mi[eé]rcoles|jueves|juves|viernes|s[aá]bados?|domingos?)\b/gi;
// Días en que aplica un tramo: "Todos los días", "lunes y miércoles" o null si no lo dice.
export function daysOf(chunk) {
  const days = [...new Set((chunk.match(WEEKDAYS) || []).map((d) => d.toLowerCase().replace('juves', 'jueves')))];
  if (days.length) return days.length > 1 ? `${days.slice(0, -1).join(', ')} y ${days.at(-1)}` : days[0];
  return /todos los d[ií]as/i.test(chunk) ? 'Todos los días' : null;
}

// Vigencia acotada ("del 9 al 18 de octubre") si el texto la menciona.
export const dateRangeOf = (s) => s.match(/del\s+\d{1,2}\s+al\s+\d{1,2}\s+(?:de\s+)?[a-záéíóú]+/i)?.[0] ?? null;

export function writeRaw(file, data) {
  writeFileSync(new URL(`../../data/raw/${file}`, import.meta.url), JSON.stringify(data, null, 2) + '\n');
}
