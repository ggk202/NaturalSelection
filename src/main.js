import { World } from './sim/world.js';
import { serializeWorld } from './sim/serialize.js';
import { createScene } from './render/scene.js';
import { createStepper } from './loop.js';
import { saveRun, loadSettings } from './storage.js';
import { mountControls } from './ui/controls.js';
import { mountCharts } from './ui/charts.js';
import { mountInspector } from './ui/inspector.js';
import { mountGodMode } from './ui/godmode.js';

const AUTOSAVE_MS = 60000;
const canvas = document.getElementById('view');
const view = createScene(canvas);

export const app = {
  world: null, runId: null, runName: null, speed: 1, paused: false, storageOk: true,
  listeners: new Set(), // called with world events each frame
  setWorld(world, runId = `run-${Date.now()}`, runName = new Date().toLocaleString()) {
    app.world = world; app.runId = runId; app.runName = runName;
    window.__world = world;
    view.setWorld(world);
  },
  async save() {
    if (!app.world) return;
    const r = await saveRun(app.runId, app.runName, serializeWorld(app.world));
    if (!r.ok && app.storageOk) { app.storageOk = false; app.onStorageError?.(r.error); }
    return r;
  },
};
window.__app = app;
window.__view = view;

const saved = await loadSettings();
app.setWorld(new World(saved.ok && saved.value ? saved.value : {}));

const ui = document.getElementById('ui');
app.ui = {};
app.ui.charts = mountCharts(ui, app);
app.ui.controls = mountControls(ui, app);
app.ui.inspector = mountInspector(ui, app);
app.ui.godmode = mountGodMode(ui, app, view, canvas);

const stepper = createStepper();
let last = performance.now(), lastSave = last, frameMsAvg = 16;
window.__frames = 0;
function frame(now) {
  const dt = Math.min(1, (now - last) / 1000);
  frameMsAvg += ((now - last) - frameMsAvg) * 0.05;
  last = now;
  const w = app.world;
  if (!app.paused) {
    const n = stepper(dt, app.speed, w.settings.dt);
    for (let i = 0; i < n; i++) w.step();
  }
  if (w.events.length) {
    const evs = w.events.splice(0);
    for (const l of app.listeners) l(evs);
  }
  if (app.followId != null) view.follow(w.find(app.followId));
  view.render(w);
  window.__frames++;
  window.__fps = 1000 / frameMsAvg;
  if (now - lastSave > AUTOSAVE_MS) { lastSave = now; app.save(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') app.save(); });

export { view };
