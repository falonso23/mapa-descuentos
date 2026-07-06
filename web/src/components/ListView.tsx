import { useState } from 'react';
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { categoryOf } from '../data/categories';
import { PROVIDER_COLOR } from '../data/providers';
import { dedupeBenefits } from '../lib/dedupeBenefits';
import type { Merchant } from '../types';

export function ListView({
  merchants,
  onFocusLocation,
}: {
  merchants: Merchant[];
  onFocusLocation: (merchant: Merchant, locationIndex: number) => void;
}) {
  if (!merchants.length) {
    return <div className="list-empty">Ningún comercio coincide con el filtro.</div>;
  }

  return (
    <div className="list-pane">
      {merchants.map((m) => (
        <MerchantCard key={m.id} merchant={m} onFocusLocation={onFocusLocation} />
      ))}
    </div>
  );
}

function MerchantCard({
  merchant: m,
  onFocusLocation,
}: {
  merchant: Merchant;
  onFocusLocation: (merchant: Merchant, locationIndex: number) => void;
}) {
  // Las cadenas arrancan colapsadas: en la lista lo que importa de un vistazo es el nombre
  // y el beneficio, no las N direcciones — se expanden a pedido.
  const [expanded, setExpanded] = useState(m.locations.length <= 1);
  const cat = categoryOf(m.category);
  const Icon = cat.icon;
  const benefits = dedupeBenefits(m.benefits || []);
  const collapsible = m.locations.length > 1;

  return (
    <div className="list-card">
      <div className="list-card-head">
        <span className="list-card-icon" style={{ background: `${cat.color}22`, color: cat.color }}>
          <Icon size={16} strokeWidth={2.25} aria-hidden />
        </span>
        <div className="list-card-title">
          <div className="list-card-name">{m.merchant}</div>
          <div className="list-card-meta">
            {cat.label}
            {m.es_cadena && collapsible ? ` · cadena (${m.locations.length})` : ''}
          </div>
        </div>
        <div className="list-card-providers">
          {m.providers.map((p) => (
            <span key={p} className="list-provider-dot" style={{ background: PROVIDER_COLOR[p] ?? '#888' }} title={p} />
          ))}
        </div>
      </div>
      <div className="list-benefits">
        {benefits.map((b, i) => (
          <span key={i} className="list-benefit-pill" style={{ borderColor: PROVIDER_COLOR[b.provider] ?? '#888' }}>
            <span className="pb-dot" style={{ background: PROVIDER_COLOR[b.provider] ?? '#888' }} />
            {b.provider} {b.amount || '✓'}
          </span>
        ))}
      </div>

      {collapsible && (
        <button type="button" className="list-toggle-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronUp size={14} strokeWidth={2.25} /> : <ChevronDown size={14} strokeWidth={2.25} />}
          {expanded ? 'Ocultar sucursales' : `Ver ${m.locations.length} sucursales`}
        </button>
      )}

      {expanded && (
        <div className="list-locations">
          {m.locations.map((loc, i) => (
            <button key={i} type="button" className="list-location-row" onClick={() => onFocusLocation(m, i)}>
              <MapPin size={13} strokeWidth={2.25} aria-hidden />
              <span>
                {loc.sucursal ? `${loc.sucursal} — ` : ''}
                {loc.address ?? 'Ver en el mapa'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
