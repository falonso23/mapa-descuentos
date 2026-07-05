import { categoryOf } from '../data/categories';
import { PROVIDER_COLOR } from '../data/providers';

// El anillo del pin representa la(s) tarjeta(s) que dan beneficio ahí; con 2+ tarjetas se
// reparte en gajos iguales (conic-gradient). El ícono, sobre un disco blanco para que
// mantenga contraste sin importar el color del anillo, representa el rubro.
function providerBackground(providers: string[]): string {
  const colors = providers.map((p) => PROVIDER_COLOR[p] ?? '#888');
  if (colors.length <= 1) return colors[0] ?? '#888';
  const step = 100 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`);
  return `conic-gradient(${stops.join(', ')})`;
}

export function MarkerIcon({ category, providers }: { category: string; providers: string[] }) {
  const cat = categoryOf(category);
  const Icon = cat.icon;
  return (
    <div className="marker-pin" style={{ background: providerBackground(providers) }}>
      <div className="marker-pin-core">
        <Icon size={13} strokeWidth={2.5} color={cat.color} aria-hidden />
      </div>
    </div>
  );
}
