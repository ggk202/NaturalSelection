import { SYLLABLES, translate } from '../sim/species.js';

// Speech bubbles over the nearest speaking creatures: the word so far and its translation via the species lexicon.
const MAX = 15, LINGER = 1.5; // bubbles stay up briefly after the speaker falls silent (sim seconds)

export function mountBubbles(app, view) {
  const layer = document.createElement('div');
  layer.id = 'bubbles';
  document.getElementById("view").after(layer); // under the UI panels
  const pool = [], said = new Map(); // creature id -> { word, until }
  let enabled = true;
  function update(world) {
    if (!enabled) { layer.hidden = true; return; }
    layer.hidden = false;
    for (const k of world.calls) if (k.word && k.word.length) said.set(k.id, { word: k.word, until: world.time + LINGER });
    const byId = new Map(world.creatures.map((c) => [c.id, c])), cam = view.camera.position, shown = [];
    for (const [id, s] of said) {
      const c = byId.get(id);
      if (!c || world.time > s.until || world.time < s.until - LINGER - 1) { said.delete(id); continue; } // dead, stale, or a reloaded world
      shown.push({ c, s, d: (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 });
    }
    shown.sort((a, b) => a.d - b.d);
    const W = innerWidth, H = innerHeight;
    let n = 0;
    for (const { c, s } of shown) {
      if (n >= MAX) break;
      const p = view.project(c.x, c.z);
      if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) continue;
      const el = pool[n] || (pool[n] = layer.appendChild(Object.assign(document.createElement('div'), { className: 'bubble' })));
      const sp = world.tracker.species.find((x) => x.id === c.speciesId);
      const gloss = c.player ? null : translate(sp && sp.lexicon, s.word);
      el.innerHTML = '';
      el.append(Object.assign(document.createElement('b'), { textContent: s.word.map((k) => SYLLABLES[k]).join('-') }),
        Object.assign(document.createElement('span'), { textContent: c.player ? 'you' : gloss ? `“${gloss}”` : '?' }));
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y - 28)}px) translate(-50%, -100%)`;
      el.hidden = false;
      n++;
    }
    for (let i = n; i < pool.length; i++) pool[i].hidden = true;
  }
  return { update, setEnabled: (v) => { enabled = v; } };
}
