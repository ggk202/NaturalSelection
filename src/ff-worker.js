// Fast-forward worker: runs a deserialized world with no rendering until a stop condition, then hands it back.
import { deserializeWorld, serializeWorld } from './sim/serialize.js';
import { runUntil } from './sim/fastforward.js';

let stopped = false;
self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { stopped = true; return; }
  try { await run(data); } catch (e) { self.postMessage({ type: 'error', message: String(e && e.message || e) }); } // async errors don't reach worker.onerror
};

async function run(data) {
  self.postMessage({ type: 'stage', text: 'unpacking world…' });
  const world = deserializeWorld(data.save), cond = { realMinutes: 10, ...data.cond };
  self.postMessage({ type: 'stage', text: 'running first steps…' });
  const startReal = performance.now(), startTime = world.time, log = [];
  let result = null, lastPost = 0;
  while (!result && !stopped) {
    const chunkStart = performance.now();
    while (!result && performance.now() - chunkStart < 100) result = runUntil(world, cond, { maxSteps: 10, startReal, startTime, log });
    const now = performance.now();
    if (now - lastPost > 250) {
      lastPost = now;
      self.postMessage({ type: 'progress', time: world.time, pop: world.creatures.length, speed: (world.time - startTime) / ((now - startReal) / 1000), log: log.slice(-4) });
    }
    await new Promise((r) => setTimeout(r, 0)); // let a Stop message in
  }
  self.postMessage({ type: 'done', reason: result ? result.reason : 'stopped', detail: result ? result.detail : 'stopped by you', save: serializeWorld(world) });
}

self.addEventListener('unhandledrejection', (e) => self.postMessage({ type: 'error', message: String(e.reason && e.reason.message || e.reason) }));

// Handshake: some browsers deliver messages before a module worker (with top-level await) has registered
// its handler, so the page waits for this before sending the world.
self.postMessage({ type: 'ready' });
