import { h } from './dom.js';
import { showSheet } from './runs.js';
import { createPreview } from '../render/preview.js';
import { PLAYER_DEFAULTS, playerGenome } from '../sim/player.js';
import { SYLLABLES } from '../sim/species.js';

// Play: customize and spawn your own creature, steer it (keys or on-screen pad), act and speak syllables.
const KEYS = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
const WORD_MS = 1000;
const ACTS = { ' ': 'attack', e: 'grab', q: 'drop', f: 'use' };

export function mountPlayer(root, app) {
  const opts = { ...PLAYER_DEFAULTS };
  const range = (key, label, min, max, step) => h('label', { class: 'row' }, h('span', {}, label),
    h('input', { type: 'range', name: key, min, max, step, value: opts[key], oninput: (e) => { opts[key] = Number(e.target.value); redraw(); } }));
  const check = (key, label) => h('label', { class: 'row check' }, h('span', {}, label),
    h('input', { type: 'checkbox', name: key, checked: opts[key], onchange: (e) => { opts[key] = e.target.checked; redraw(); } }));
  const canvas = h('canvas', { class: 'preview' });
  const sheet = h('div', { id: 'player-sheet', class: 'panel sheet', hidden: true },
    h('div', { class: 'sheet-head' }, h('strong', {}, 'Play'), h('button', { onclick: () => close() }, 'Close')),
    h('small', {}, 'Your creature lives by the same rules: it must eat, can be hurt and can die. Keys: WASD/arrows move, space bite, E grab, Q drop, F use, 1–4 speak.'),
    canvas,
    h('label', { class: 'row' }, h('span', {}, 'Body'), h('select', { name: 'template', onchange: (e) => { opts.template = e.target.value; redraw(); } },
      ['quadruped', 'biped', 'worm'].map((t) => h('option', { value: t }, t)))),
    range('size', 'Size', 0.6, 1.6, 0.05), range('hue', 'Colour', 0, 1, 0.01), range('eyes', 'Eyes', 0, 6, 1), range('diet', 'Diet (plants → meat)', 0, 1, 0.05),
    check('grippers', 'Grippers (carry and use objects)'), check('wings', 'Wings'), check('fins', 'Fins'),
    h('div', { class: 'row buttons' }, h('button', { id: 'player-leave', onclick: leave }, 'Leave'), h('button', { class: 'primary', id: 'player-spawn', onclick: spawn }, 'Spawn')));
  const pv = createPreview(canvas);
  const redraw = () => { if (!sheet.hidden) pv.show(playerGenome(opts)); };

  const held = new Set();
  const hold = (name) => ({ onpointerdown: (e) => { e.preventDefault(); held.add(name); }, onpointerup: () => held.delete(name), onpointerleave: () => held.delete(name), onpointercancel: () => held.delete(name) });
  const tap = (name) => () => { const i = app.world.playerInput; if (i) i[name] = true; };
  let lastPress = -Infinity; // real time: presses within WORD_MS form one word, whatever the sim speed
  const say = (k) => {
    const i = app.world.playerInput, now = performance.now();
    if (!i) return;
    if (now - lastPress > WORD_MS) i.newWord = true;
    i.say.push(k); i.speaking = true; lastPress = now;
  };
  const energy = h('div', { class: 'fill' }), word = h('span', { class: 'word' });
  const hud = h('div', { id: 'player-hud', hidden: true },
    h('div', { class: 'pad panel' }, h('span'), h('button', { 'data-dir': 'up', ...hold('up') }, '▲'), h('span'),
      h('button', { 'data-dir': 'left', ...hold('left') }, '◀'), h('button', { 'data-dir': 'down', ...hold('down') }, '▼'), h('button', { 'data-dir': 'right', ...hold('right') }, '▶')),
    h('div', { class: 'acts panel' },
      h('div', { class: 'energy' }, energy), word,
      h('div', { class: 'row-btns' }, h('button', { 'data-act': 'attack', ...hold('attack') }, 'Bite'), h('button', { 'data-act': 'grab', onclick: tap('grab') }, 'Grab'),
        h('button', { 'data-act': 'drop', onclick: tap('drop') }, 'Drop'), h('button', { 'data-act': 'use', onclick: tap('use') }, 'Use')),
      h('div', { class: 'row-btns' }, SYLLABLES.map((s, k) => h('button', { class: 'syll', 'data-syll': s, onclick: () => say(k) }, s)))));
  const dead = h('div', { id: 'player-dead', class: 'panel banner', hidden: true }, h('strong', {}, 'You died'),
    h('div', { class: 'row buttons' }, h('button', { onclick: () => { dead.hidden = true; leaveDead = true; } }, 'Watch'), h('button', { class: 'primary', onclick: spawn }, 'Respawn')));
  root.append(sheet, hud, dead);

  let playing = false, leaveDead = false;
  function spawn() {
    const w = app.world, cam = window.__view?.controls?.target;
    const p = w.spawnPlayer(opts, cam ? cam.x : w.settings.worldSize / 2, cam ? cam.z : w.settings.worldSize / 2);
    app.followId = p.id;
    playing = true; leaveDead = false;
    close();
    dead.hidden = true;
  }
  function leave() { const p = app.world.player; if (p) app.world.killCreature(p.id); playing = false; close(); }
  function close() { sheet.hidden = true; pv.dispose(); }

  const typing = (e) => /input|select|textarea/i.test(e.target.tagName);
  addEventListener('keydown', (e) => {
    if (!playing || typing(e)) return;
    const k = e.key.toLowerCase();
    if (KEYS[k]) { held.add(KEYS[k]); e.preventDefault(); }
    else if (k === ' ') { held.add('attack'); e.preventDefault(); }
    else if (ACTS[k]) tap(ACTS[k])();
    else if ('1234'.includes(k) && !e.repeat) say(Number(k) - 1);
  });
  addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); held.delete(KEYS[k]); if (k === ' ') held.delete('attack'); });

  // Each frame: input → world, HUD state.
  function update(world) {
    const p = world.player;
    hud.hidden = !p;
    if (playing && !p && world.playerInput) { dead.hidden = leaveDead; }
    if (!p) return;
    const i = world.playerInput;
    i.throttle = (held.has('up') ? 1 : 0) - (held.has('down') ? 0.5 : 0);
    i.turn = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    i.attack = held.has('attack');
    i.speaking = performance.now() - lastPress < WORD_MS;
    energy.style.width = `${Math.max(0, Math.min(100, (100 * p.energy) / p.stats.maxEnergy))}%`;
    word.textContent = p.word && p.word.length ? p.word.map((k) => SYLLABLES[k]).join('-') : '';
  }
  return { open: () => { showSheet(sheet); redraw(); }, update, spawn };
}
