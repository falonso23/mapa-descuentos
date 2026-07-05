export const DEPARTMENTS = [
  'Montevideo',
  'Canelones',
  'Maldonado',
  'Rocha',
  'Treinta y Tres',
  'Cerro Largo',
  'Rivera',
  'Artigas',
  'Salto',
  'Paysandú',
  'Río Negro',
  'Soriano',
  'Colonia',
  'San José',
  'Flores',
  'Florida',
  'Durazno',
  'Tacuarembó',
  'Lavalleja',
] as const;

// Localidades frecuentes en las direcciones que no son, literalmente, el departamento.
const LOCALITY_OVERRIDES: Record<string, string> = {
  'ciudad de la costa': 'Canelones',
  'punta del este': 'Maldonado',
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^departamento de\s+/, '')
    .trim();
}

const BY_NORMALIZED = new Map(DEPARTMENTS.map((d) => [normalize(d), d]));

// Las direcciones terminan "..., <Departamento>, Uruguay" (a veces con una localidad tipo
// "Ciudad de la Costa" o "Punta del Este" en ese lugar en vez del departamento en sí).
export function deriveDepartment(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  const candidate = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  const resolved = resolvePart(candidate);
  if (resolved) return resolved;

  for (const part of parts) {
    const found = resolvePart(part);
    if (found) return found;
  }
  return null;
}

function resolvePart(part: string): string | null {
  const n = normalize(part);
  return BY_NORMALIZED.get(n) ?? LOCALITY_OVERRIDES[n] ?? null;
}
