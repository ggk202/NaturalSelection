import { World } from './sim/world.js';
import { serializeWorld, deserializeWorld } from './sim/serialize.js';
import { createScene } from './render/scene.js';
import { createStepper, runSteps } from './loop.js';
import { saveRun, loadSettings, listRuns, loadRun } from './storage.js';
import { mountRuns } from './ui/runs.js';
import { mountFastForward } from './ui/fastforward.js';
import { mountControls, worldSettings } from './ui/controls.js';
import { mountCharts } from './ui/charts.js';
import { mountInspector } from './ui/inspector.js';
import { mountGodMode } from './ui/godmode.js';
import { mountBubbles } from './ui/bubbles.js';

const AUTOSAVE_MS = 60000;
const STEP_BUDGET_MS = 12; // leaves room for rendering within a 30fps frame
const canvas = document.getElementById('view');
const view = createScene(canvas);

export const app = {
  world: null, runId: null, runName: null, speed: 1, paused: false, storageOk: true,
  listeners: new Set(), // called with world events each frame
  setWorld(world, runId = `run-${Date.now()}`, runName = new Date().toLocaleString()) {
    app.world = world; app.runId = runId; app.runName = runName;
    app.followId = null; app.memoryId = null; // ids restart in a new world
    window.__world = world;
    view.setWorld(world);
  },
  async save() {
    if (!app.world) return;
    const r = await saveRun(app.runId, app.runName, serializeWorld(app.world));
    if (!r.ok && app.storageOk) { app.storageOk = false; app.onStorageError?.(r.error); }
    return r;
  },
  // Fast-forward in a worker: the view pauses, the world comes back where the run stopped.
  fastForward(cond, { progress, done }) {
    if (app.ff) app.ff.terminate(); // a stale run must never block a new one
    const { runId, runName } = app;
    let worker = null;
    const finish = (msg) => { worker?.terminate(); if (app.ff === worker) app.ff = null; app.paused = false; done(); app.ui.runs.toast(msg); };
    try {
      worker = new Worker(new URL('./ff-worker.js', import.meta.url), { type: 'module' });
      app.paused = true;
      app.ff = worker;
      const save = serializeWorld(app.world);
      // Heartbeat: the worker reports every stage and ~4×/s while running; 20 s of silence ends the run.
      let stage = 'loading worker…', beat = null;
      const alive = () => { clearTimeout(beat); beat = setTimeout(() => { if (app.ff === worker) worker.onmessage({ data: { type: 'error', message: `stalled while ${stage}` } }); }, 20000); };
      alive();
      progress({ stage });
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') { stage = 'sending world…'; alive(); progress({ stage }); return worker.postMessage({ save, cond }); }
        if (data.type === 'stage') { stage = data.text; alive(); return progress({ stage }); }
        if (data.type === 'progress') { stage = 'running'; alive(); return progress(data); }
        clearTimeout(beat);
        if (data.type === 'error') return finish(`Fast-forward failed (${data.message}); the world is unchanged.`);
        app.setWorld(deserializeWorld(data.save), runId, runName);
        finish(`⏩ Stopped: ${data.detail}`);
        app.save();
      };
      worker.onerror = (e) => finish(`Fast-forward failed (${e.message || 'worker could not start'}); the world is unchanged.`);
    } catch (e) { finish(`Fast-forward failed (${e.message}); the world is unchanged.`); }
  },
  // Stop asks the worker to hand the world back; if it doesn't answer quickly, abandon the run (world unchanged).
  stopFastForward() {
    const w = app.ff;
    if (!w) return;
    w.postMessage({ type: 'stop' });
    setTimeout(() => { if (app.ff === w) { w.onmessage({ data: { type: 'error', message: 'worker did not respond' } }); } }, 2000);
  },
  // Returns an error message, or null on success. A failed load leaves the save untouched.
  async loadRun(id, name) {
    const r = await loadRun(id);
    if (!r.ok) return r.error;
    if (!r.value) return 'run not found';
    try {
      const world = deserializeWorld(r.value);
      if (app.world && id !== app.runId) await app.save(); // don't lose the run being replaced
      app.setWorld(world, id, name);
      return null;
    } catch (e) { return e.message; }
  },
};
window.__app = app;
window.__view = view;

const saved = await loadSettings();
const runs = await listRuns();
let bootError = null;
if (runs.ok && runs.value.length) bootError = await app.loadRun(runs.value[0].id, runs.value[0].name);
// New runs default to physical bodies with a population size the physics can keep up with.
const forceKinematic = new URLSearchParams(location.search).get('locomotion') === 'kinematic'; // for slow devices and fast tests
if (!app.world) app.setWorld(new World(worldSettings({ physical: true, maxCreatures: 150, ...(saved.ok && saved.value ? saved.value : {}), ...(forceKinematic ? { physical: false } : {}) })));

const ui = document.getElementById('ui');
app.ui = {};
app.ui.charts = mountCharts(ui, app);
app.ui.controls = mountControls(ui, app);
app.ui.inspector = mountInspector(ui, app);
app.ui.godmode = mountGodMode(ui, app, view, canvas);
app.ui.runs = mountRuns(ui, app);
app.ui.ff = mountFastForward(ui, app);
app.ui.bubbles = mountBubbles(app, view);
if (bootError) app.ui.runs.toast(`Couldn’t resume last run (${bootError}); started a new one.`);
if (!runs.ok) app.onStorageError(runs.error);

const stepper = createStepper();
let last = performance.now(), lastSave = last, frameMsAvg = 16;
window.__frames = 0;
function frame(now) {
  const dt = Math.min(1, (now - last) / 1000);
  frameMsAvg += ((now - last) - frameMsAvg) * 0.05;
  last = now;
  const w = app.world;
  if (!app.paused) {
    app.lastSteps = runSteps(w, stepper(dt, app.speed, w.settings.dt), STEP_BUDGET_MS);
  }
  if (w.events.length) {
    const evs = w.events.splice(0);
    for (const l of app.listeners) l(evs);
  }
  if (app.followId != null) view.follow(w.find(app.followId));
  view.showMemory(app.memoryId != null ? w.find(app.memoryId) : null);
  view.render(w);
  app.ui.bubbles.update(w);
  window.__frames++;
  window.__fps = 1000 / frameMsAvg;
  if (now - lastSave > AUTOSAVE_MS) { lastSave = now; app.save(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') app.save(); });

export { view };

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('service worker:', e));
