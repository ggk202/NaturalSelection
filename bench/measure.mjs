// Shared capability protocol: minutes 5–15, predators seeded at minute 2.
import { World } from '../src/sim/world.js';

export function measure(seed) {
  const w = new World({ seed });
  const size = (b) => b.nodes.filter((n) => n.type === 'hid').length + b.conns.filter((c) => c.on).length;
  const founderStructure = w.creatures.reduce((a, c) => a + size(c.genome.brain), 0) / w.creatures.length;
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
  const brains = w.creatures.map((c) => c.genome.brain);
  const structure = brains.reduce((a, b) => a + b.nodes.filter((n) => n.type === 'hid').length + b.conns.filter((c) => c.on).length, 0) / Math.max(1, brains.length);
  return { meanPop: +(pop / samples).toFixed(1), foodPerCreatureMin: +(ate / cmin).toFixed(3), killsPerCreatureMin: +(kills / cmin).toFixed(4), totalFoodPerMin: +(ate / 10).toFixed(1), structure: +structure.toFixed(2), founderStructure: +founderStructure.toFixed(2) };
}
