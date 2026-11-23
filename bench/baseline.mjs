// Headless capability benchmark: mean population, food eaten and kills per creature-minute,
// minutes 5–15, seeds 1–3, predators seeded at minute 2. Usage: node bench/baseline.mjs
import { World } from '../src/sim/world.js';
const out = {};
for (const seed of [1, 2, 3]) {
  const w = new World({ seed });
  let pop = 0, samples = 0, ate = 0, kills = 0, creatureSteps = 0;
  for (let i = 0; i < 20 * 60 * 15; i++) {
    if (i === 20 * 120) w.seedPredators(5);
    const before = w.creatures.reduce((a, c) => a + c.actionCounters.ate, 0);
    w.step();
    if (i >= 20 * 300) {
      for (const e of w.events) if (e.type === 'kill') kills++;
      ate += Math.max(0, w.creatures.reduce((a, c) => a + c.actionCounters.ate, 0) - before);
      creatureSteps += w.creatures.length;
      if (i % 20 === 0) { pop += w.creatures.length; samples++; }
    }
    w.events.length = 0;
  }
  const cmin = creatureSteps / (20 * 60);
  out[seed] = { meanPop: +(pop / samples).toFixed(1), foodPerCreatureMin: +(ate / cmin).toFixed(3), killsPerCreatureMin: +(kills / cmin).toFixed(4) };
}
console.log(JSON.stringify(out));
