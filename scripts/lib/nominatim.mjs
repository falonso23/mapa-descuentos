// Acceso a Nominatim (OpenStreetMap) compartido por los pasos de ubicación. Sin API key; su
// política de uso pide como máximo 1 req/s: `nominatim()` espacia los pedidos y quien llama cachea.
const UA = 'MapaDescuentosUY/1.0 (proyecto personal)';
const MIN_INTERVAL = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const inUY = (lat, lon) => lat < -30 && lat > -35.5 && lon < -53 && lon > -58.5;

let lastStart = 0;
export async function nominatim(path, params) {
  const wait = lastStart + MIN_INTERVAL - Date.now();
  if (wait > 0) await sleep(wait);
  lastStart = Date.now();
  const query = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'es', ...params });
  const res = await fetch(`https://nominatim.openstreetmap.org/${path}?${query}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// Arma "Calle 1234, Barrio, Ciudad, Departamento, Uruguay" con el `address` de Nominatim.
// El anteúltimo tramo tiene que ser el departamento: la web lo deriva de ahí.
export function formatAddress(a) {
  const street = [a.road || a.pedestrian, a.house_number].filter(Boolean).join(' ');
  const state = (a.state || '').replace(/^departamento de\s+/i, '');
  const parts = [street, a.suburb || a.neighbourhood || a.quarter, a.city || a.town || a.village || a.hamlet, state].filter(Boolean);
  return [...new Set(parts), 'Uruguay'].join(', ');
}
