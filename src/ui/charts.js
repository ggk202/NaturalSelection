import { h } from './dom.js';

// Dark-surface categorical steps, fixed order (validated reference palette).
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c'];
const SURFACE = '#1a1a19', GRID = '#383835', MUTED = '#c3c2b7', TEXT = '#f0efec';

// keys: [{ get(point) -> number, label, color, fmt?(point) -> string }]
export function drawLineChart(canvas, series, keys, hoverX = null) {
  const dpr = Math.min(devicePixelRatio || 1, 2), W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = SURFACE; ctx.fillRect(0, 0, W, H);
  const pad = { l: 36, r: 8, t: 8, b: 18 };
  if (series.length < 2) {
    ctx.fillStyle = MUTED; ctx.font = '12px sans-serif'; ctx.fillText('Collecting data…', pad.l, H / 2);
    return null;
  }
  let lo = Infinity, hi = -Infinity;
  for (const p of series) for (const k of keys) { const v = k.get(p); if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo > 0 && lo < hi * 0.5) lo = 0;
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const t0 = series[0].t, t1 = series.at(-1).t;
  const X = (t) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r);
  const Y = (v) => H - pad.b - ((v - lo) / (hi - lo)) * (H - pad.t - pad.b);

  ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = MUTED; ctx.font = '10px sans-serif';
  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) * i) / 3, y = Math.round(Y(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillText(fmtNum(v), 2, y + 3);
  }
  ctx.fillText(fmtTime(t0), pad.l, H - 4);
  const end = fmtTime(t1); ctx.fillText(end, W - pad.r - ctx.measureText(end).width, H - 4);

  ctx.lineWidth = 2; ctx.lineJoin = 'round';
  for (const k of keys) {
    ctx.strokeStyle = k.color; ctx.beginPath();
    series.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(k.get(p))) : ctx.moveTo(X(p.t), Y(k.get(p)))));
    ctx.stroke();
  }

  if (hoverX == null || hoverX < pad.l) return null;
  // Crosshair + tooltip at the nearest sample.
  let best = series[0];
  for (const p of series) if (Math.abs(X(p.t) - hoverX) < Math.abs(X(best.t) - hoverX)) best = p;
  const x = X(best.t);
  ctx.strokeStyle = MUTED; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke();
  for (const k of keys) {
    ctx.fillStyle = k.color; ctx.strokeStyle = SURFACE; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, Y(k.get(best)), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  const lines = [fmtTime(best.t), ...keys.map((k) => `${k.label}: ${k.fmt ? k.fmt(best) : fmtNum(k.get(best))}`)];
  ctx.font = '11px sans-serif';
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12, th = lines.length * 14 + 8;
  const tx = x + tw + 10 > W ? x - tw - 8 : x + 8;
  ctx.fillStyle = 'rgba(40,40,38,0.95)'; ctx.fillRect(tx, pad.t, tw, th);
  ctx.fillStyle = TEXT; lines.forEach((l, i) => ctx.fillText(l, tx + 6, pad.t + 15 + i * 14));
  return best;
}

const fmtNum = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
export const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const TRAIT = (key, label, max, color) => ({ get: (p) => p.avg[key] / max, label, color, fmt: (p) => p.avg[key].toFixed(2) });
export const TABS = {
  pop: { label: 'Population', keys: [
    { get: (p) => p.pop, label: 'Total', color: SERIES[0] },
    { get: (p) => p.herb, label: 'Herbivores', color: SERIES[2] },
    { get: (p) => p.carn, label: 'Carnivores', color: SERIES[1] },
  ] },
  traits: { label: 'Traits', note: 'scaled to each gene’s range', keys: [
    TRAIT('legs', 'Legs', 8, SERIES[0]), TRAIT('eyes', 'Eyes', 6, SERIES[1]), TRAIT('size', 'Size', 2, SERIES[2]),
    TRAIT('diet', 'Diet', 1, SERIES[3]), TRAIT('insulation', 'Insulation', 1, SERIES[4]), TRAIT('intelligence', 'Intelligence', 20, SERIES[5]),
  ] },
  biomes: { label: 'Biomes', keys: ['plains', 'forest', 'wetland', 'lake', 'mountain', 'desert'].map((b, i) => ({
    get: (p) => (p.biomes ? p.biomes[b] : 0), label: b[0].toUpperCase() + b.slice(1), color: SERIES[i],
  })) },
  signals: { label: 'Signals', note: 'calls per minute', keys: ['ka', 'ru', 'mi', 'to'].map((name, i) => ({
    get: (p) => (p.calls ? p.calls[i] : 0), label: name, color: SERIES[i],
  })) },
  behavior: { label: 'Behaviour', keys: ['wanderer', 'forager', 'hunter', 'ambusher', 'homebody', 'patroller'].map((l, i) => ({
    get: (p) => p.labels[l] || 0, label: l[0].toUpperCase() + l.slice(1), color: SERIES[i],
  })) },
};

export function mountCharts(root, app) {
  let tab = 'pop', hoverX = null;
  const canvas = h('canvas');
  const legend = h('div', { class: 'legend' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, Object.entries(TABS).map(([id, t]) =>
    h('button', { 'data-tab': id, role: 'tab', onclick: () => { tab = id; draw(); } }, t.label)));
  const panel = h('div', { id: 'charts', class: 'panel' }, tabs, canvas, legend);
  root.append(panel);
  canvas.addEventListener('pointermove', (e) => { hoverX = e.offsetX; draw(); });
  canvas.addEventListener('pointerleave', () => { hoverX = null; draw(); });

  function draw() {
    const t = TABS[tab], series = app.world.stats.series;
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    drawLineChart(canvas, series, t.keys, hoverX);
    const last = series.at(-1);
    legend.replaceChildren(...t.keys.map((k) => h('span', {}, h('i', { style: `background:${k.color}` }), `${k.label} ${last ? (k.fmt ? k.fmt(last) : Math.round(k.get(last))) : ''}`)),
      ...(t.note ? [h('em', {}, t.note)] : []));
  }
  setInterval(() => { if (!panel.hidden) draw(); }, 1000);
  draw();
  return { panel, draw };
}
