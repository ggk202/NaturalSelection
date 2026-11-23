// Quick capability probe: node bench/quick.mjs [minutes] [seeds...]
import { World } from '../src/sim/world.js';
const mins = +process.argv[2] || 10, seeds = process.argv.slice(3).map(Number);
for (const seed of seeds.length ? seeds : [1, 2]) {
  const w = new World({ seed }); const row = [];
  let ate = 0, cs = 0;
  for (let m = 1; m <= mins; m++) {
    for (let i = 0; i < 1200; i++) {
      const before = w.creatures.reduce((a, c) => a + c.actionCounters.ate, 0);
      w.step(); w.events.length = 0;
      if (m > mins / 2) { ate += Math.max(0, w.creatures.reduce((a, c) => a + c.actionCounters.ate, 0) - before); cs += w.creatures.length; }
    }
    row.push(w.creatures.length);
  }
  const b = w.creatures.map((c) => c.genome.brain);
  const hid = b.reduce((a, x) => a + x.nodes.filter((n) => n.type === 'hid').length, 0) / Math.max(1, b.length);
  console.log(`seed ${seed} pop ${row.join(' ')} | food/cmin ${(ate / (cs / 1200)).toFixed(2)} | hidden ${hid.toFixed(2)}`);
}
