import { h } from './dom.js';

const TOOLS = [
  ['inspect', '🔍', 'Inspect'], ['food', '🌿', 'Drop food'], ['hazard', '☢', 'Place hazard'], ['unhazard', '🧹', 'Remove hazard'],
  ['kill', '✖', 'Kill'], ['clone', '⧉', 'Clone'], ['mutate', '🧬', 'Mutate'],
];
const TAP_PX = 10, TAP_MS = 250, CREATURE_SNAP = 2.5;

export function mountGodMode(root, app, view, canvas) {
  let tool = 'inspect';
  const btns = TOOLS.map(([id, icon, label]) => h('button', { 'data-tool': id, title: label, 'aria-label': label, onclick: () => { tool = id; sync(); } }, icon));
  const palette = h('div', { id: 'tools', class: 'panel' }, btns,
    h('button', { id: 'btn-predators', title: 'Seed 5 predators', 'aria-label': 'Seed 5 predators', onclick: () => app.world.seedPredators(5) }, '🦖'));
  const hint = h('div', { class: 'hint' });
  root.append(palette, hint);

  function sync() {
    for (const b of btns) b.classList.toggle('on', b.dataset.tool === tool);
    hint.textContent = TOOLS.find((t) => t[0] === tool)[2];
  }

  // Creature under the tap, or the nearest one to the ground point (small creatures are hard to hit on a tablet).
  function creatureAt(hit) {
    if (!hit) return null;
    if (hit.type === 'creature') return app.world.find(hit.id);
    let best = null, bd = CREATURE_SNAP;
    for (const c of app.world.creatures) {
      const d = Math.hypot(app.world.delta(hit.x, c.x), app.world.delta(hit.z, c.z));
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function apply(x, y) {
    const hit = view.pick(x, y), w = app.world;
    if (!hit) return;
    const c = ['inspect', 'kill', 'clone', 'mutate'].includes(tool) ? creatureAt(hit) : null;
    switch (tool) {
      case 'inspect': if (c) app.ui.inspector.open(c.id); break;
      case 'food': if (hit.type === 'ground') w.addFood(hit.x, hit.z, 10); break;
      case 'hazard': if (hit.type === 'ground') w.addHazard(hit.x, hit.z, 6); break;
      case 'unhazard': {
        if (hit.type !== 'ground') break;
        const hz = hit.hazardId ?? w.env.hazards.find((h) => Math.hypot(w.delta(hit.x, h.x), w.delta(hit.z, h.z)) <= h.r)?.id;
        if (hz != null) w.removeHazard(hz);
        break;
      }
      case 'kill': if (c) w.killCreature(c.id); break;
      case 'clone': if (c) w.cloneCreature(c.id); break;
      case 'mutate': if (c) { w.mutateCreature(c.id, 0.5); app.ui.inspector.open(c.id); } break;
    }
  }

  let down = null;
  canvas.addEventListener('pointerdown', (e) => { if (e.isPrimary) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!e.isPrimary || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
    down = null;
    if (moved < TAP_PX && dt < TAP_MS) apply(e.clientX, e.clientY);
  });
  sync();
  return { get tool() { return tool; } };
}
