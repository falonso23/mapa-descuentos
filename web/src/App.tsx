import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMapData } from './hooks/useMapData';
import { MapView, locationKey, type FocusRequest } from './components/MapView';
import { TopBar } from './components/TopBar';
import { Chips } from './components/Chips';
import { FilterSheet } from './components/FilterSheet';
import { Tabs, type ViewTab } from './components/Tabs';
import { ListView } from './components/ListView';
import { deriveDepartment } from './lib/departments';
import type { Merchant } from './types';

function App() {
  const { merchants, loading, error } = useMapData();
  const [providers, setProviders] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [departments, setDepartments] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<ViewTab>('map');
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  // Cada tecla regenera los ~700 marcadores del mapa; debounce para no recrearlos por letra.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const presentCategories = useMemo(() => new Set(merchants.map((m) => m.category)), [merchants]);

  const presentDepartments = useMemo(() => {
    const s = new Set<string>();
    for (const m of merchants) {
      for (const loc of m.locations) {
        const d = deriveDepartment(loc.address);
        if (d) s.add(d);
      }
    }
    return s;
  }, [merchants]);

  // Cuando hay filtro de departamento, además de incluir/excluir el comercio se recorta su
  // lista de sucursales a las que caen en los departamentos elegidos (clave para la lista:
  // una cadena con 16 sucursales en todo el país no debería mostrar las 16 si filtrás "Salto").
  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const result: Merchant[] = [];
    for (const m of merchants) {
      if (providers.size && !m.providers.some((p) => providers.has(p))) continue;
      if (categories.size && !categories.has(m.category)) continue;
      if (q && !m.merchant.toLowerCase().includes(q)) continue;

      let locations = m.locations;
      if (departments.size) {
        locations = locations.filter((loc) => {
          const d = deriveDepartment(loc.address);
          return d ? departments.has(d) : false;
        });
        if (!locations.length) continue;
      }
      result.push(locations === m.locations ? m : { ...m, locations });
    }
    return result;
  }, [merchants, providers, categories, departments, debouncedQuery]);

  const toggleSet = (setter: typeof setProviders, value: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const activeFilterCount = providers.size + categories.size + departments.size;

  // Botón "ver sucursales" del popup: pasa a la lista filtrada a ese comercio (limpiando
  // otros filtros para no ocultar sus sucursales por error).
  const handleViewChain = useCallback((merchant: Merchant) => {
    setProviders(new Set());
    setCategories(new Set());
    setDepartments(new Set());
    setQuery(merchant.merchant);
    setDebouncedQuery(merchant.merchant);
    setTab('list');
  }, []);

  // Fila de sucursal en la lista: vuelve al mapa centrado en ese punto y abre su popup.
  const handleFocusLocation = useCallback((merchant: Merchant, locationIndex: number) => {
    const loc = merchant.locations[locationIndex];
    if (!loc) return;
    setTab('map');
    setFocusRequest({ key: locationKey(merchant.id, locationIndex), lat: loc.lat, lng: loc.lng });
  }, []);

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
        departments={departments}
        onRemoveProvider={(p) => toggleSet(setProviders, p)}
        onRemoveCategory={(c) => toggleSet(setCategories, c)}
        onRemoveDepartment={(d) => toggleSet(setDepartments, d)}
      />

      <div id="content-wrap">
        {loading && <div className="map-status">Cargando mapa…</div>}
        {error && <div className="map-status map-status-error">No se pudo cargar el mapa: {error}</div>}
        {!loading && !error && (
          <>
            <div className={`view-pane ${tab === 'map' ? '' : 'view-pane-hidden'}`}>
              <MapView merchants={filtered} active={tab === 'map'} focusRequest={focusRequest} onViewChain={handleViewChain} />
            </div>
            <div className={`view-pane ${tab === 'list' ? '' : 'view-pane-hidden'}`}>
              <ListView merchants={filtered} onFocusLocation={handleFocusLocation} />
            </div>
          </>
        )}
      </div>

      <Tabs tab={tab} onChange={setTab} />

      <FilterSheet
        open={sheetOpen}
        providers={providers}
        categories={categories}
        departments={departments}
        presentCategories={presentCategories}
        presentDepartments={presentDepartments}
        resultCount={filtered.length}
        onToggleProvider={(p) => toggleSet(setProviders, p)}
        onToggleCategory={(c) => toggleSet(setCategories, c)}
        onToggleDepartment={(d) => toggleSet(setDepartments, d)}
        onClear={() => {
          setProviders(new Set());
          setCategories(new Set());
          setDepartments(new Set());
        }}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

export default App;
