import type { Benefit } from '../types';

// Algunas fuentes (ej. Itaú) registran el mismo beneficio dos veces con distinto texto de
// "conditions" (p.ej. "Programa restaurantes Montevideo" vs "...Punta del Este"). Se agrupan
// por (provider, product, amount, days) y se combinan las condiciones distintas en una sola línea.
export function dedupeBenefits(benefits: Benefit[]): Benefit[] {
  const order: string[] = [];
  const groups = new Map<string, { benefit: Benefit; conditions: Set<string> }>();

  for (const b of benefits) {
    const key = `${b.provider}|${b.product ?? ''}|${b.amount ?? ''}|${b.days ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = { benefit: b, conditions: new Set() };
      groups.set(key, group);
      order.push(key);
    }
    if (b.conditions) group.conditions.add(b.conditions);
  }

  return order.map((key) => {
    const { benefit, conditions } = groups.get(key)!;
    return { ...benefit, conditions: conditions.size ? [...conditions].join(' · ') : null };
  });
}
