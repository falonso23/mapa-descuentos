import { CATEGORIES, type CategoryKey } from '../data/categories';
import { PROVIDER_COLOR, PROVIDERS } from '../data/providers';

export function FilterSheet({
  open,
  providers,
  categories,
  presentCategories,
  resultCount,
  onToggleProvider,
  onToggleCategory,
  onClear,
  onClose,
}: {
  open: boolean;
  providers: Set<string>;
  categories: Set<string>;
  presentCategories: Set<string>;
  resultCount: number;
  onToggleProvider: (p: string) => void;
  onToggleCategory: (c: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className={`sheet-overlay ${open ? '' : 'hidden'}`} onClick={onClose} />
      <aside className={`sheet ${open ? '' : 'hidden'}`}>
        <div className="sheet-handle" />
        <h2>Filtrar</h2>

        <section>
          <h3>Tarjeta / Proveedor</h3>
          <div className="filter-group">
            {PROVIDERS.map((p) => (
              <div
                key={p}
                className={`filter-opt ${providers.has(p) ? 'on' : ''}`}
                onClick={() => onToggleProvider(p)}
              >
                <span className="filter-dot" style={{ background: PROVIDER_COLOR[p] }} />
                {p}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3>Rubro</h3>
          <div className="filter-group">
            {(Object.keys(CATEGORIES) as CategoryKey[])
              .filter((k) => presentCategories.has(k))
              .map((k) => {
                const c = CATEGORIES[k];
                const Icon = c.icon;
                return (
                  <div
                    key={k}
                    className={`filter-opt ${categories.has(k) ? 'on' : ''}`}
                    onClick={() => onToggleCategory(k)}
                  >
                    <Icon size={15} strokeWidth={2.25} />
                    {c.label}
                  </div>
                );
              })}
          </div>
        </section>

        <div className="sheet-actions">
          <button className="btn-secondary" onClick={onClear}>
            Limpiar
          </button>
          <button className="btn-primary" onClick={onClose}>
            Ver {resultCount} resultado{resultCount !== 1 ? 's' : ''}
          </button>
        </div>
      </aside>
    </>
  );
}
