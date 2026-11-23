import { h } from './dom.js';
import { CHECKPOINT_KINDS } from '../sim/fastforward.js';
import { showSheet } from './runs.js';

const TRAITS = ['intelligence', 'legs', 'eyes', 'size', 'diet', 'grippers', 'dexterity', 'endurance'];
const num = (name, label, value = '') => h('label', { class: 'row' }, h('span', {}, label), h('input', { type: 'number', name, value, step: 'any', inputmode: 'decimal' }));
const select = (name, options) => h('select', { name }, options.map(([v, t]) => h('option', { value: v }, t)));

// Fast-forward sheet (stop conditions) and the progress panel shown while the worker runs.
export function mountFastForward(root, app) {
  const sheet = h('div', { id: 'ff', class: 'panel sheet', hidden: true },
    h('div', { class: 'sheet-head' }, h('strong', {}, 'Fast-forward'), h('button', { onclick: () => (sheet.hidden = true) }, 'Close')),
    h('small', {}, 'Runs without drawing until the first condition is met. (fast-forward v4)'),
    num('simMinutes', 'Stop after simulated minutes', 30),
    num('popBelow', 'Stop if population falls below'),
    num('popAbove', 'Stop if population rises above'),
    h('label', { class: 'row' }, h('span', {}, 'Stop at the next checkpoint'), select('checkpoint', [['', 'off'], ...CHECKPOINT_KINDS.map((k) => [k, k])])),
    h('label', { class: 'row' }, h('span', {}, 'Stop when the average trait'), select('traitKey', [['', 'off'], ...TRAITS.map((k) => [k, k])])),
    h('label', { class: 'row' }, h('span', {}, 'reaches'), select('traitOp', [['>=', '≥'], ['<=', '≤']]), h('input', { type: 'number', name: 'traitValue', step: 'any' })),
    num('realMinutes', 'Safety stop after real minutes', 10),
    h('label', { class: 'row' }, h('span', {}, 'Step size (bigger = faster, coarser)'), select('stepScale', [['1', '×1 (same as normal)'], ['2', '×2'], ['4', '×4 (kinematic only)']])),
    h('div', { class: 'row buttons' }, h('button', { class: 'primary', onclick: start }, 'Start')));
  const status = h('div'), recent = h('small');
  const progress = h('div', { id: 'ff-progress', class: 'panel banner', hidden: true },
    h('strong', {}, '⏩ Fast-forwarding'), status, recent, h('button', { onclick: () => app.stopFastForward() }, 'Stop'));
  root.append(sheet, progress);

  function readCond() {
    const v = (n) => sheet.querySelector(`[name="${n}"]`).value, n = (k) => (v(k) === '' ? null : Number(v(k)));
    const cond = { simMinutes: n('simMinutes'), popBelow: n('popBelow'), popAbove: n('popAbove'), realMinutes: n('realMinutes') ?? 10,
      checkpoint: v('checkpoint') || null, stepScale: Number(v('stepScale')) };
    if (v('traitKey') && n('traitValue') != null) cond.trait = { key: v('traitKey'), op: v('traitOp'), value: n('traitValue') };
    if (app.world.settings.locomotion === 'physical') cond.stepScale = Math.min(cond.stepScale, 2); // larger physics steps are unstable
    return cond;
  }
  function start() {
    sheet.hidden = true;
    progress.hidden = false;
    status.textContent = 'starting…';
    app.fastForward(readCond(), {
      progress: (p) => { if (p.stage) { status.textContent = p.stage; return; } status.textContent = `sim ${Math.floor(p.time / 60)}:${String(Math.floor(p.time % 60)).padStart(2, '0')} · ${p.pop} alive · ×${Math.round(p.speed)}`; recent.textContent = p.log.join(' · '); },
      done: () => { progress.hidden = true; },
    });
  }
  return { open: () => showSheet(sheet) };
}
