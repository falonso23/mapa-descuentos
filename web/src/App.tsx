import { useMemo, useState } from 'react';
import { useMapData } from './hooks/useMapData';
import { MapView } from './components/MapView';
import { TopBar } from './components/TopBar';
import { Chips } from './components/Chips';
import { FilterSheet } from './components/FilterSheet';
import { CountPill } from './components/CountPill';

function App() {
  const { merchants, loading, error } = useMapData();
  const [providers, setProviders] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const presentCategories = useMemo(() => new Set(merchants.map((m) => m.category)), [merchants]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merchants.filter((m) => {
      if (providers.size && !m.providers.some((p) => providers.has(p))) return false;
      if (categories.size && !categories.has(m.category)) return false;
      if (q && !m.merchant.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [merchants, providers, categories, query]);

  const pinCount = useMemo(() => filtered.reduce((acc, m) => acc + m.locations.length, 0), [filtered]);

  const toggleSet = (setter: typeof setProviders, value: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const activeFilterCount = providers.size + categories.size;

  return (
    <div id="app">
      <TopBar
        query={query}
        onQueryChange={setQuery}
        onOpenFilters={() => setSheetOpen(true)}
        activeFilterCount={activeFilterCount}
      />
      <Chips
        providers={providers}
        categories={categories}
        onRemoveProvider={(p) => toggleSet(setProviders, p)}
        onRemoveCategory={(c) => toggleSet(setCategories, c)}
      />

      <div id="map-wrap">
        {loading && <div className="map-status">Cargando mapa…</div>}
        {error && <div className="map-status map-status-error">No se pudo cargar el mapa: {error}</div>}
        {!loading && !error && <MapView merchants={filtered} />}
        {!loading && !error && <CountPill merchants={filtered.length} pins={pinCount} />}
      </div>

      <FilterSheet
        open={sheetOpen}
        providers={providers}
        categories={categories}
        presentCategories={presentCategories}
        resultCount={filtered.length}
        onToggleProvider={(p) => toggleSet(setProviders, p)}
        onToggleCategory={(c) => toggleSet(setCategories, c)}
        onClear={() => {
          setProviders(new Set());
          setCategories(new Set());
        }}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

export default App;
