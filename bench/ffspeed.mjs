// Fast-forward speed: node bench/ffspeed.mjs <locomotion> <creatures> <stepScale>
import { World } from '../src/sim/world.js';
import { runUntil } from '../src/sim/fastforward.js';
const [loco = 'kinematic', n = '300', scale = '1'] = process.argv.slice(2);
const w = new World({ seed: 1, locomotion: loco, initialCreatures: +n, maxCreatures: +n });
for (let i = 0; i < 40; i++) w.step();
const t0 = performance.now(), simStart = w.time, minutes = loco === 'physical' ? 0.5 : 2;
runUntil(w, { simMinutes: minutes, stepScale: +scale }, { maxSteps: 1e9, startReal: t0, startTime: simStart });
const s = (performance.now() - t0) / 1000;
console.log(`${loco} ${n} creatures, step ×${scale}: ${minutes} sim-min in ${s.toFixed(1)} s → ×${((w.time - simStart) / s).toFixed(0)}`);
