import { List, MapIcon } from 'lucide-react';

export type ViewTab = 'map' | 'list';

export function Tabs({ tab, onChange }: { tab: ViewTab; onChange: (tab: ViewTab) => void }) {
  return (
    <nav className="tabbar">
      <button type="button" className={`tabbar-btn ${tab === 'map' ? 'active' : ''}`} onClick={() => onChange('map')}>
        <MapIcon size={20} strokeWidth={2.25} aria-hidden />
        Mapa
      </button>
      <button type="button" className={`tabbar-btn ${tab === 'list' ? 'active' : ''}`} onClick={() => onChange('list')}>
        <List size={20} strokeWidth={2.25} aria-hidden />
        Lista
      </button>
    </nav>
  );
}
