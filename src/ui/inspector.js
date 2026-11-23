import { h } from './dom.js';
import { createPreview } from '../render/preview.js';
import { GENES } from '../sim/genome.js';
import { drawBrainGraph } from './brain-graph.js';

const POS = '#3987e5', NEG = '#d95926';
const STAT_KEYS = ['speed', 'senseRange', 'attack', 'defense', 'swim', 'climb', 'camo', 'upkeep', 'maxEnergy'];
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
    status.textContent = `${c.label || 'newborn'} in ${app.world.biomeOf(c).key} · species ${c.speciesId ?? '–'}${sp ? ` (since ${Math.floor(sp.firstSeen)}s${sp.homeBiome ? `, home: ${sp.homeBiome}` : ''})` : ''} · gen ${c.generation} · age ${c.age.toFixed(0)}s · ${c.children} children`;
    energy.firstChild.style.width = `${Math.max(0, Math.min(100, (100 * c.energy) / c.stats.maxEnergy))}%`;
    if (shownGenome !== c.genome) {
      shownGenome = c.genome;
      pv.show(c.genome);
      genes.replaceChildren(...GENES.map((g) => h('tr', {}, h('th', {}, g.key), h('td', {}, fmt(c.genome.body[g.key])))));
    }
    stats.replaceChildren(...STAT_KEYS.map((k) => h('tr', {}, h('th', {}, k), h('td', {}, fmt(c.stats[k])))));
    drawBrainGraph(brain, c.genome.brain, c.brainState);
    sync();
  }
  setInterval(update, 250);
  return { open, close, get id() { return id; } };
}
