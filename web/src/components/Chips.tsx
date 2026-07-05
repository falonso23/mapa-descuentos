import { X } from 'lucide-react';
import { categoryOf } from '../data/categories';

interface ActiveChip {
  kind: 'provider' | 'category' | 'department';
  key: string;
  label: string;
}

export function Chips({
  providers,
  categories,
  departments,
  onRemoveProvider,
  onRemoveCategory,
  onRemoveDepartment,
}: {
  providers: Set<string>;
  categories: Set<string>;
  departments: Set<string>;
  onRemoveProvider: (p: string) => void;
  onRemoveCategory: (c: string) => void;
  onRemoveDepartment: (d: string) => void;
}) {
  const chips: ActiveChip[] = [
    ...[...providers].map((p) => ({ kind: 'provider' as const, key: p, label: p })),
    ...[...categories].map((c) => ({ kind: 'category' as const, key: c, label: categoryOf(c).label })),
    ...[...departments].map((d) => ({ kind: 'department' as const, key: d, label: d })),
  ];

  if (!chips.length) {
    return (
      <div className="chips">
        <span className="chip">Todos los comercios</span>
      </div>
    );
  }

  const remove = (chip: ActiveChip) => {
    if (chip.kind === 'provider') onRemoveProvider(chip.key);
    else if (chip.kind === 'category') onRemoveCategory(chip.key);
    else onRemoveDepartment(chip.key);
  };

  return (
    <div className="chips">
      {chips.map((chip) => (
        <button key={`${chip.kind}-${chip.key}`} className="chip active" onClick={() => remove(chip)}>
          {chip.label}
          <X size={12} strokeWidth={2.5} />
        </button>
      ))}
    </div>
  );
}
