import { Search, SlidersHorizontal } from 'lucide-react';

export function TopBar({
  query,
  onQueryChange,
  onOpenFilters,
  activeFilterCount,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
}) {
  return (
    <header id="topbar">
      <div className="title-row">
        <h1>Mapa de Descuentos</h1>
        <button className="filter-btn" onClick={onOpenFilters} aria-label="Filtros">
          <SlidersHorizontal size={16} strokeWidth={2.25} />
          Filtros
          {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
        </button>
      </div>
      <div className="search-row">
        <Search size={16} strokeWidth={2.25} className="search-icon" />
        <input
          type="search"
          placeholder="Buscar comercio…"
          autoComplete="off"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
    </header>
  );
}
