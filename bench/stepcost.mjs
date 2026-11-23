// Step cost benchmark: node bench/stepcost.mjs [locomotion] [creatures]
import { World } from '../src/sim/world.js';
const loco = process.argv[2] || 'kinematic', n = +process.argv[3] || 300;
const w = new World({ seed: 1, locomotion: loco, initialCreatures: n, maxCreatures: n, respawnMin: 0 });
for (let i = 0; i < 40; i++) w.step();
const t0 = performance.now(), steps = loco === 'physical' ? 60 : 300;
for (let i = 0; i < steps; i++) { w.step(); w.events.length = 0; }
const ms = (performance.now() - t0) / steps;
console.log(`${loco} ${w.creatures.length} creatures: ${ms.toFixed(2)} ms/step → ×${(1000 / 20 / ms).toFixed(0)} real time (no rendering)`);
