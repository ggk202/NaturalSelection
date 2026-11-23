import { h } from './dom.js';
import { createPreview } from '../render/preview.js';
import { GENES } from '../sim/genome.js';
import { think, lastHidden, INPUTS, OUTPUTS, HIDDEN } from '../sim/brain.js';

const POS = '#3987e5', NEG = '#d95926';
const STAT_KEYS = ['speed', 'senseRange', 'attack', 'defense', 'upkeep', 'maxEnergy'];
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

export function mountInspector(root, app) {
  const preview = h('canvas', { class: 'preview' }), brain = h('canvas', { class: 'brain' });
  const title = h('strong'), status = h('div', { class: 'status' }), genes = h('table', { class: 'kv' }), stats = h('table', { class: 'kv' });
  const energy = h('div', { class: 'bar' }, h('i'));
  const followBtn = h('button', { onclick: () => { app.followId = app.followId === id ? null : id; sync(); } }, 'Follow');
  const parentBtn = h('button', { onclick: () => { const p = app.world.find(parentId); if (p) open(p.id); } }, 'Parent');
  const panel = h('div', { id: 'inspector', class: 'panel sheet', hidden: true },
    h('div', { class: 'sheet-head' }, title, h('button', { onclick: close }, 'Close')),
    preview, status, energy, h('div', { class: 'row buttons' }, parentBtn, followBtn),
    h('h4', {}, 'Brain'), brain, h('div', { class: 'legend' }, h('span', {}, h('i', { style: `background:${POS}` }), 'positive'), h('span', {}, h('i', { style: `background:${NEG}` }), 'negative weight')),
    h('h4', {}, 'Genes'), genes, h('h4', {}, 'Abilities'), stats);
  root.append(panel);
  const pv = createPreview(preview);
  const inp = new Float32Array(INPUTS.length), out = new Float32Array(OUTPUTS.length);
  let id = null, parentId = null, shownGenome = null;

  function open(cid) {
    id = cid; shownGenome = null;
    panel.hidden = false;
    panel.dataset.id = cid;
    document.getElementById('settings')?.setAttribute('hidden', '');
    update();
  }
  function close() { panel.hidden = true; id = null; pv.dispose(); app.followId = null; }
  function sync() { followBtn.classList.toggle('on', app.followId != null && app.followId === id); }

  function update() {
    if (panel.hidden || id == null) return;
    const c = app.world.find(id);
    if (!c) { status.textContent = 'Died'; app.followId = app.followId === id ? null : app.followId; return; }
    parentId = c.parentId;
    parentBtn.disabled = !app.world.find(c.parentId);
    title.textContent = `Creature #${c.id}`;
    const sp = app.world.tracker.species.find((s) => s.id === c.speciesId);
    status.textContent = `${c.label || 'newborn'} · species ${c.speciesId ?? '–'}${sp ? ` (since ${Math.floor(sp.firstSeen)}s)` : ''} · gen ${c.generation} · age ${c.age.toFixed(0)}s · ${c.children} children`;
    energy.firstChild.style.width = `${Math.max(0, Math.min(100, (100 * c.energy) / c.stats.maxEnergy))}%`;
    if (shownGenome !== c.genome) {
      shownGenome = c.genome;
      pv.show(c.genome);
      genes.replaceChildren(...GENES.map((g) => h('tr', {}, h('th', {}, g.key), h('td', {}, fmt(c.genome.body[g.key])))));
    }
    stats.replaceChildren(...STAT_KEYS.map((k) => h('tr', {}, h('th', {}, k), h('td', {}, fmt(c.stats[k])))));
    app.world.sense(c, inp);
    think(c.genome.brain, inp, out);
    drawBrain(brain, c.genome.brain, inp, lastHidden(), out);
    sync();
  }
  setInterval(update, 250);
  return { open, close, get id() { return id; } };
}

function drawBrain(canvas, w, inp, hid, out) {
  const dpr = Math.min(devicePixelRatio || 1, 2), W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const layers = [inp, hid, out], names = [INPUTS, null, OUTPUTS];
  const xs = [70, W / 2, W - 60];
  const pos = layers.map((l, li) => Array.from(l, (_, i) => [xs[li], 10 + ((H - 20) * (i + 0.5)) / l.length]));
  let p = 0;
  const edge = (a, b, wt) => {
    ctx.strokeStyle = wt > 0 ? POS : NEG; ctx.globalAlpha = Math.min(0.9, Math.abs(wt) / 2.5); ctx.lineWidth = Math.min(3, Math.abs(wt));
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  };
  for (let hI = 0; hI < HIDDEN; hI++) { for (let i = 0; i < INPUTS.length; i++) edge(pos[0][i], pos[1][hI], w[p++]); p++; }
  for (let o = 0; o < OUTPUTS.length; o++) { for (let hI = 0; hI < HIDDEN; hI++) edge(pos[1][hI], pos[2][o], w[p++]); p++; }
  ctx.globalAlpha = 1; ctx.font = '10px sans-serif';
  layers.forEach((l, li) => l.forEach((v, i) => {
    const [x, y] = pos[li][i];
    ctx.fillStyle = `hsl(0 0% ${Math.round(25 + 60 * Math.min(1, Math.abs(v)))}%)`;
    ctx.strokeStyle = '#1a1a19'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (names[li]) {
      ctx.fillStyle = '#c3c2b7';
      const t = names[li][i];
      ctx.fillText(t, li === 0 ? x - 10 - ctx.measureText(t).width : x + 10, y + 3);
    }
  }));
}
