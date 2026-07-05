/* Mapa de Descuentos — app mobile-first. Lee window.MAP_DATA (ver map-data.js). */
const DATA = (window.MAP_DATA || []).filter(m => (m.locations || []).length > 0);

const PROVIDER_COLOR = {
  'Santander': '#ec0000', 'Itaú': '#ff7a00', 'OCA': '#0072ce', 'Club El País': '#16a34a',
};
const CATEGORY = {
  gastronomia:    { label: 'Gastronomía',    icon: '🍽️', color: '#ef4444' },
  moda:           { label: 'Moda',           icon: '👗', color: '#ec4899' },
  calzado:        { label: 'Calzado',        icon: '👟', color: '#a855f7' },
  hogar:          { label: 'Hogar',          icon: '🛋️', color: '#f59e0b' },
  salud:          { label: 'Salud',          icon: '💊', color: '#10b981' },
  bienestar:      { label: 'Bienestar',      icon: '🧘', color: '#14b8a6' },
  supermercado:   { label: 'Supermercado',   icon: '🛒', color: '#3b82f6' },
  entretenimiento:{ label: 'Entretenimiento',icon: '🎬', color: '#8b5cf6' },
  tecnologia:     { label: 'Tecnología',     icon: '💻', color: '#06b6d4' },
  ninos:          { label: 'Niños',          icon: '🧸', color: '#f472b6' },
  otros:          { label: 'Otros',          icon: '🏷️', color: '#94a3b8' },
};
const catOf = (c) => CATEGORY[c] || CATEGORY.otros;

/* ---- Estado de filtros ---- */
const state = {
  providers: new Set(),   // vacío = todos
  categories: new Set(),  // vacío = todos
  query: '',
};

/* ---- Mapa ---- */
const map = L.map('map', { zoomControl: true, tap: true }).setView([-34.905, -56.19], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap © CARTO', maxZoom: 19,
}).addTo(map);

const cluster = L.markerClusterGroup({ maxClusterRadius: 50, spiderfyOnMaxZoom: true });
map.addLayer(cluster);

function markerIcon(cat) {
  const c = catOf(cat);
  return L.divIcon({
    className: 'pin',
    html: `<div style="background:${c.color};width:30px;height:30px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);
      display:flex;align-items:center;justify-content:center">
      <span style="transform:rotate(45deg);font-size:14px">${c.icon}</span></div>`,
    iconSize: [30, 30], iconAnchor: [15, 28], popupAnchor: [0, -26],
  });
}

function popupHtml(m, loc) {
  const c = catOf(m.category);
  const badges = [
    `<span class="pop-badge" style="background:${c.color}22;color:${c.color}">${c.icon} ${c.label}</span>`,
    m.es_cadena ? `<span class="pop-badge">⛓️ cadena${m.branches_partial ? ' (parcial)' : ''}</span>` : '',
    loc.sucursal ? `<span class="pop-badge">📍 ${loc.sucursal}</span>` : '',
  ].filter(Boolean).join(' ');

  const benefits = (m.benefits || []).map(b => {
    const color = PROVIDER_COLOR[b.provider] || '#888';
    const detail = [b.product && b.product !== 'todas' ? b.product : '', b.days || '', b.conditions || '']
      .filter(Boolean).join(' · ');
    return `<div class="pop-benefit">
      <div class="pb-head">
        <span class="pb-dot" style="background:${color}"></span>
        <span class="pb-provider">${b.provider}</span>
        <span class="pb-amount">${b.amount || '✓'}</span>
      </div>${detail ? `<div class="pb-detail">${detail}</div>` : ''}
    </div>`;
  }).join('');

  return `<div class="pop-name">${m.merchant}</div>
    <div class="pop-meta">${badges}</div>
    ${loc.address ? `<div class="pb-detail" style="margin-bottom:6px">${loc.address}</div>` : ''}
    ${benefits}`;
}

/* ---- Render ---- */
function passesFilter(m) {
  if (state.providers.size && !m.providers.some(p => state.providers.has(p))) return false;
  if (state.categories.size && !state.categories.has(m.category)) return false;
  if (state.query && !m.merchant.toLowerCase().includes(state.query)) return false;
  return true;
}

function render() {
  cluster.clearLayers();
  let comercios = 0, pins = 0;
  for (const m of DATA) {
    if (!passesFilter(m)) continue;
    comercios++;
    for (const loc of m.locations) {
      if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;
      const mk = L.marker([loc.lat, loc.lng], { icon: markerIcon(m.category) });
      mk.bindPopup(popupHtml(m, loc), { maxWidth: 300 });
      cluster.addLayer(mk);
      pins++;
    }
  }
  document.getElementById('count').textContent =
    `${comercios} comercio${comercios !== 1 ? 's' : ''} · ${pins} punto${pins !== 1 ? 's' : ''}`;
  renderChips();
}

/* ---- UI: chips activos ---- */
function renderChips() {
  const chips = document.getElementById('chips');
  const active = [...state.providers, ...[...state.categories].map(c => catOf(c).label)];
  chips.innerHTML = active.length
    ? active.map(a => `<span class="chip active" style="background:var(--surface-2)">${a} ✕</span>`).join('')
    : `<span class="chip">Todos los comercios</span>`;
  [...chips.querySelectorAll('.chip.active')].forEach((el, i) => {
    el.onclick = () => {
      const val = active[i];
      state.providers.delete(val);
      const cat = Object.keys(CATEGORY).find(k => CATEGORY[k].label === val);
      if (cat) state.categories.delete(cat);
      syncSheet(); render();
    };
  });
}

/* ---- UI: bottom sheet ---- */
function buildSheet() {
  const fp = document.getElementById('fProviders');
  fp.innerHTML = Object.keys(PROVIDER_COLOR).map(p =>
    `<div class="filter-opt" data-type="provider" data-val="${p}">
      <span style="color:${PROVIDER_COLOR[p]}">●</span> ${p}</div>`).join('');
  const fc = document.getElementById('fCategories');
  const present = [...new Set(DATA.map(m => m.category))];
  fc.innerHTML = Object.keys(CATEGORY).filter(k => present.includes(k)).map(k =>
    `<div class="filter-opt" data-type="category" data-val="${k}">${CATEGORY[k].icon} ${CATEGORY[k].label}</div>`).join('');

  document.querySelectorAll('.filter-opt').forEach(el => {
    el.onclick = () => {
      const { type, val } = el.dataset;
      const set = type === 'provider' ? state.providers : state.categories;
      set.has(val) ? set.delete(val) : set.add(val);
      el.classList.toggle('on');
    };
  });
}
function syncSheet() {
  document.querySelectorAll('.filter-opt').forEach(el => {
    const { type, val } = el.dataset;
    const set = type === 'provider' ? state.providers : state.categories;
    el.classList.toggle('on', set.has(val));
  });
}
function openSheet(open) {
  document.getElementById('sheet').classList.toggle('hidden', !open);
  document.getElementById('sheetOverlay').classList.toggle('hidden', !open);
}

/* ---- Eventos ---- */
document.getElementById('filterBtn').onclick = () => { syncSheet(); openSheet(true); };
document.getElementById('sheetOverlay').onclick = () => openSheet(false);
document.getElementById('applyFilters').onclick = () => { openSheet(false); render(); };
document.getElementById('clearFilters').onclick = () => {
  state.providers.clear(); state.categories.clear(); syncSheet();
};
let t;
document.getElementById('search').oninput = (e) => {
  clearTimeout(t);
  t = setTimeout(() => { state.query = e.target.value.trim().toLowerCase(); render(); }, 200);
};

/* ---- Init ---- */
buildSheet();
render();
if (DATA.length) {
  const pts = DATA.flatMap(m => m.locations).filter(l => typeof l.lat === 'number');
  if (pts.length) map.fitBounds(L.latLngBounds(pts.map(l => [l.lat, l.lng])).pad(0.15));
}
