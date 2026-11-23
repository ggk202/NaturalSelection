import { N_IN, OUTPUTS, INPUT_NAMES } from '../sim/neat.js';

const POS = '#3987e5', NEG = '#d95926', SURFACE = '#1a1a19', MUTED = '#c3c2b7';

// Columns by depth: inputs (only those wired in), hidden by longest feed-forward path, outputs last.
// Edges that point backwards or sideways are recurrent and drawn as curves.
export function layoutBrain(brain) {
  const on = brain.conns.filter((c) => c.on);
  const used = new Set(on.map((c) => c.from).filter((id) => id < N_IN));
  const hid = brain.nodes.filter((n) => n.type === 'hid');
  const depth = new Map([...used].map((id) => [id, 0]));
  for (const n of hid) depth.set(n.id, 1);
  for (let pass = 0; pass < hid.length; pass++) {
    for (const c of on) {
      if (!depth.has(c.to) || c.to < N_IN + OUTPUTS.length) continue; // only relax hidden targets
      const d = (depth.get(c.from) ?? 0) + 1;
      if (d > depth.get(c.to) && d <= hid.length) depth.set(c.to, d);
    }
  }
  const maxHid = hid.reduce((m, n) => Math.max(m, depth.get(n.id)), 0);
  OUTPUTS.forEach((_, o) => depth.set(N_IN + o, maxHid + 1));
  const cols = [];
  for (const [id, d] of depth) (cols[d] ||= []).push(id);
  for (const col of cols) col?.sort((a, b) => a - b);
  return { on, depth, cols: cols.filter(Boolean) };
}

const label = (id) => (id < N_IN ? INPUT_NAMES[id] : id < N_IN + OUTPUTS.length ? OUTPUTS[id - N_IN] : '');

export function drawBrainGraph(canvas, brain, state) {
  const { on, cols } = layoutBrain(brain);
  const tallest = Math.max(...cols.map((c) => c.length));
  const H = Math.max(220, 16 * tallest + 20);
  if (canvas.style.height !== `${H}px`) canvas.style.height = `${H}px`;
  const dpr = Math.min(devicePixelRatio || 1, 2), W = canvas.clientWidth;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = SURFACE; ctx.fillRect(0, 0, W, H);

  const left = 96, right = W - 72, pos = new Map();
  cols.forEach((col, ci) => col.forEach((id, i) => pos.set(id, [left + (cols.length === 1 ? 0 : (ci * (right - left)) / (cols.length - 1)), 10 + ((H - 20) * (i + 0.5)) / col.length])));
  const index = new Map(brain.nodes.map((n, i) => [n.id, i]));

  for (const c of on) {
    const a = pos.get(c.from), b = pos.get(c.to);
    if (!a || !b) continue;
    ctx.strokeStyle = c.w > 0 ? POS : NEG;
    ctx.globalAlpha = Math.min(0.9, 0.25 + Math.abs(c.w) / 3);
    ctx.lineWidth = Math.min(3, 0.5 + Math.abs(c.w));
    ctx.beginPath(); ctx.moveTo(...a);
    if (b[0] > a[0]) ctx.lineTo(...b);
    else { // recurrent: arc above (self-loops become small circles)
      if (c.from === c.to) { ctx.arc(a[0], a[1] - 8, 7, Math.PI / 2, Math.PI * 2.5); }
      else ctx.quadraticCurveTo((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 40, ...b);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.font = '10px sans-serif';
  for (const [id, [x, y]] of pos) {
    const v = state ? state[index.get(id)] || 0 : 0;
    ctx.fillStyle = `hsl(0 0% ${Math.round(25 + 60 * Math.min(1, Math.abs(v)))}%)`;
    ctx.strokeStyle = SURFACE; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const t = label(id);
    if (t) { ctx.fillStyle = MUTED; ctx.fillText(t, id < N_IN ? x - 9 - ctx.measureText(t).width : x + 9, y + 3); }
  }
  return [...pos.keys()].map(label).filter(Boolean);
}
