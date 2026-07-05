import { X } from 'lucide-react';
import { categoryOf } from '../data/categories';

interface ActiveChip {
  kind: 'provider' | 'category';
  key: string;
  label: string;
}

export function Chips({
  providers,
  categories,
  onRemoveProvider,
  onRemoveCategory,
}: {
  providers: Set<string>;
  categories: Set<string>;
  onRemoveProvider: (p: string) => void;
  onRemoveCategory: (c: string) => void;
}) {
  const chips: ActiveChip[] = [
    ...[...providers].map((p) => ({ kind: 'provider' as const, key: p, label: p })),
    ...[...categories].map((c) => ({ kind: 'category' as const, key: c, label: categoryOf(c).label })),
  ];

  if (!chips.length) {
    return (
      <div className="chips">
        <span className="chip">Todos los comercios</span>
      </div>
    );
  }

  return (
    <div className="chips">
      {chips.map((chip) => (
        <button
          key={`${chip.kind}-${chip.key}`}
          className="chip active"
          onClick={() => (chip.kind === 'provider' ? onRemoveProvider(chip.key) : onRemoveCategory(chip.key))}
        >
          {chip.label}
          <X size={12} strokeWidth={2.5} />
        </button>
      ))}
    </div>
  );
}
