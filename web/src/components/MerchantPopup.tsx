import { Link2, MapPinned } from 'lucide-react';
import { categoryOf } from '../data/categories';
import { PROVIDER_COLOR } from '../data/providers';
import { dedupeBenefits } from '../lib/dedupeBenefits';
import type { Merchant, MerchantLocation } from '../types';

// Atributo del botón "ver sucursales": MapView lo busca dentro del popup (HTML estático) y
// le engancha el click ya que este componente se renderiza a markup, sin handlers de React.
export const VIEW_CHAIN_ATTR = 'data-view-chain';

export function MerchantPopup({ merchant, location }: { merchant: Merchant; location: MerchantLocation }) {
  const cat = categoryOf(merchant.category);
  const CatIcon = cat.icon;
  const benefits = dedupeBenefits(merchant.benefits || []);
  const showChainButton = merchant.es_cadena && merchant.locations.length > 1;

  return (
    <div>
      <div className="pop-name">{merchant.merchant}</div>
      <div className="pop-meta">
        <span className="pop-badge" style={{ background: `${cat.color}22`, color: cat.color }}>
          <CatIcon size={12} strokeWidth={2.5} />
          {cat.label}
        </span>
        {merchant.es_cadena && (
          <span className="pop-badge">
            <Link2 size={12} strokeWidth={2.5} />
            cadena
          </span>
        )}
        {location.sucursal && (
          <span className="pop-badge">
            <MapPinned size={12} strokeWidth={2.5} />
            {location.sucursal}
          </span>
        )}
      </div>
      {location.address && <div className="pb-detail pop-address">{location.address}</div>}
      {benefits.map((b, i) => {
        const color = PROVIDER_COLOR[b.provider] ?? '#888';
        const detail = [b.product && b.product !== 'todas' ? b.product : '', b.days ?? '', b.conditions ?? '']
          .filter(Boolean)
          .join(' · ');
        return (
          <div className="pop-benefit" key={i}>
            <div className="pb-head">
              <span className="pb-dot" style={{ background: color }} />
              <span className="pb-provider">{b.provider}</span>
              <span className="pb-amount">{b.amount || '✓'}</span>
            </div>
            {detail && <div className="pb-detail">{detail}</div>}
          </div>
        );
      })}
      {showChainButton && (
        <button type="button" className="pop-chain-btn" {...{ [VIEW_CHAIN_ATTR]: 'true' }}>
          Ver las {merchant.locations.length} sucursales
        </button>
      )}
    </div>
  );
}
