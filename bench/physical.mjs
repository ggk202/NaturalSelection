// Physical-mode probe: node bench/physical.mjs <minutes> <seeds...>
// Reports population, mean ground speed, food eaten per creature-minute and death causes per minute.
import { World } from '../src/sim/world.js';
const mins = +process.argv[2] || 10;
for (const seed of process.argv.slice(3).map(Number)) {
  const w = new World({ seed, locomotion: 'physical', maxCreatures: 120 });
  const t0 = performance.now();
  for (let m = 1; m <= mins; m++) {
    let speed = 0, n = 0, ate = 0; const deaths = {};
    for (let i = 0; i < 1200; i++) {
      const before = w.creatures.reduce((a, c) => a + c.actionCounters.ate, 0);
      w.step();
      ate += Math.max(0, w.creatures.reduce((a, c) => a + c.actionCounters.ate, 0) - before);
      for (const c of w.creatures) { speed += c.speed || 0; n++; }
      for (const e of w.events) if (e.type === 'death') deaths[e.cause] = (deaths[e.cause] || 0) + 1;
      w.events.length = 0;
    }
    console.log(`seed ${seed} ${m}m pop ${w.creatures.length} speed ${(speed / Math.max(1, n)).toFixed(3)} food/cmin ${(ate / Math.max(1, n / 1200)).toFixed(2)} deaths ${JSON.stringify(deaths)} (${((performance.now() - t0) / 1000 / m).toFixed(0)} s/min)`);
  }
}
