import { h } from './dom.js';
import { World, DEFAULT_SETTINGS } from '../sim/world.js';
import { DEFAULT_ENV } from '../sim/environment.js';
import { saveSettings } from '../storage.js';
import { showSheet } from './runs.js';

const SPEEDS = [0.5, 1, 2, 4, 8];
// [key, label, min, max, step, live?] — non-live settings apply on Reseed.
const FIELDS = [
  ['World', [
    ['physical', 'Physical bodies (muscles and joints)', null, null, null, false],
    ['seed', 'Seed', 1, 99999, 1, false],
    ['worldSize', 'World size', 60, 300, 10, false],
    ['waterLevel', 'Water level', 0, 0.5, 0.02, false],
    ['initialCreatures', 'Starting creatures', 10, 300, 10, false],
    ['maxCreatures', 'Max creatures', 50, 600, 10, true],
    ['respawnMin', 'Respawn assist (min pop, 0 = off)', 0, 50, 1, true],
    ['predatorMin', 'Predator assist (min carnivores once they exist, 0 = off)', 0, 30, 1, true],
    ['mutationRate', 'Mutation rate', 0, 0.5, 0.01, true],
  ]],
  ['Food', [
    ['foodRate', 'Food per second (per 200×200 area)', 0, 40, 1, true],
    ['maxFood', 'Max food (per 200×200 area)', 100, 3000, 50, false],
    ['foodEnergy', 'Energy per food', 1, 10, 0.5, true],
  ]],
  ['Environment', [
    ['env.seasons', 'Seasons', null, null, null, true],
    ['env.seasonLength', 'Season length (s)', 30, 600, 10, true],
    ['env.foodSeasonAmp', 'Seasonal food swing', 0, 1, 0.05, true],
    ['env.temperature', 'Temperature (cold north, hot south)', null, null, null, true],
    ['env.tempAmp', 'Temperature strength', 0, 2, 0.1, true],
    ['env.hazards', 'Random hazard zones', null, null, null, false],
    ['env.hazardCount', 'Hazard zones', 0, 10, 1, false],
    ['env.hazardDamage', 'Hazard damage (energy/s)', 0, 10, 0.5, true],
  ]],
];

const getPath = (o, p) => p.split('.').reduce((a, k) => a[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); ks.slice(0, -1).reduce((a, k) => a[k], o)[ks.at(-1)] = v; };

// The settings sheet's checkbox maps to the world's locomotion mode.
export const worldSettings = (d) => ({ ...structuredClone(d), locomotion: d.physical ? 'physical' : 'kinematic' });

export function mountControls(root, app) {
  const draft = structuredClone({ ...DEFAULT_SETTINGS, ...app.world.settings, env: { ...DEFAULT_ENV, ...app.world.settings.env } });
  draft.physical = app.world.settings.locomotion === 'physical';
  const fps = h('span', { class: 'fps' });
  const playBtn = h('button', { id: 'btn-play', 'aria-label': 'Play or pause', onclick: () => { app.paused = !app.paused; sync(); } });
  const speedBtns = SPEEDS.map((s) => h('button', { 'data-speed': s, onclick: () => { app.speed = s; sync(); } }, `${s}×`));
  const bar = h('div', { id: 'topbar', class: 'panel' },
    playBtn,
    h('button', { id: 'btn-step', 'aria-label': 'Step', onclick: () => { app.paused = true; app.world.step(); sync(); } }, '⏭'),
    h('div', { class: 'group' }, speedBtns),
    h('button', { id: 'btn-settings', onclick: () => showSheet(sheet) }, 'Settings'),
    h('button', { id: 'btn-runs', onclick: () => app.ui.runs.openRuns() }, 'Runs'),
    h('button', { id: 'btn-timeline', onclick: () => app.ui.runs.openTimeline() }, 'Timeline'),
    h('button', { id: 'btn-charts', onclick: () => toggle(app.ui.charts.panel) }, 'Graphs'),
    fps);

  const inputs = [];
  const sheet = h('div', { id: 'settings', class: 'panel sheet', hidden: true },
    h('div', { class: 'sheet-head' }, h('strong', {}, 'Settings'), h('button', { onclick: () => toggle(sheet) }, 'Close')),
    FIELDS.map(([group, fields]) => h('fieldset', {}, h('legend', {}, group), fields.map(([key, label, min, max, step, live]) => {
      const val = getPath(draft, key);
      const bool = typeof val === 'boolean';
      const out = h('output', {}, bool ? '' : String(val));
      const input = h('input', bool ? { type: 'checkbox', name: key, checked: val }
        : { type: key === 'seed' ? 'number' : 'range', inputmode: 'numeric', name: key, min, max, step, value: val });
      const apply = () => {
        const v = bool ? input.checked : Number(input.value);
        setPath(draft, key, v);
        out.textContent = bool ? '' : String(v);
        if (live) setPath(app.world.settings, key, v);
        saveSettings(draft);
      };
      input.addEventListener(bool ? 'change' : 'input', apply);
      inputs.push([key, input, out]);
      return h('label', { class: bool ? 'row check' : 'row' }, h('span', {}, label, live ? '' : h('small', {}, ' · on reseed')), input, out);
    }))),
    h('div', { class: 'row buttons' },
      h('button', { onclick: () => { draft.seed = 1 + Math.floor(Math.random() * 99999); refresh(); saveSettings(draft); } }, 'New seed'),
      h('button', { class: 'primary', onclick: () => reseed() }, 'Reseed world')));

  const extinct = h('div', { id: 'extinct', class: 'panel banner', hidden: true },
    h('strong', {}, 'Extinct'), h('span', {}, 'Every creature has died.'),
    h('button', { class: 'primary', onclick: () => reseed() }, 'Reseed'));

  root.append(bar, sheet, extinct);

  function refresh() {
    for (const [key, input, out] of inputs) {
      const v = getPath(draft, key);
      if (input.type === 'checkbox') input.checked = v; else { input.value = v; out.textContent = String(v); }
    }
  }
  async function reseed() {
    await app.save(); // keep the run being replaced
    app.setWorld(new World(worldSettings(draft)));
    app.paused = false;
    sync();
  }
  function sync() {
    playBtn.textContent = app.paused ? '▶' : '⏸';
    for (const b of speedBtns) b.classList.toggle('on', Number(b.dataset.speed) === app.speed);
  }
  function toggle(el) { el.hidden = !el.hidden; }

  setInterval(() => {
    fps.textContent = `${Math.round(window.__fps || 0)} fps · ${app.world.creatures.length} alive`;
    extinct.hidden = app.world.creatures.length > 0;
  }, 250);
  sync();
  return { reseed, sync, draft };
}
