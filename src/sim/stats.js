import { LABELS } from './behavior.js';
import { BIOMES } from './biomes.js';
import { intelligence } from './neat.js';
import { traitsOf } from './genome.js';

const AVG_KEYS = ['parts', 'grippers', 'size', 'legs', 'digits', 'eyes', 'antennae', 'mouth', 'diet', 'insulation'];
const MAX_POINTS = 2000;

export class StatsRecorder {
  constructor({ interval = 2 } = {}) {
    this.interval = interval;
    this.series = [];
  }

  due(time) { return !this.series.length || time - this.series.at(-1).t >= this.interval - 1e-9; }

  sample(world) {
    const cs = world.creatures, n = cs.length || 1;
    const avg = {};
    for (const k of AVG_KEYS) avg[k] = cs.reduce((a, c) => a + traitsOf(c.genome)[k], 0) / n;
    avg.speed = cs.reduce((a, c) => a + c.stats.speed, 0) / n;
    avg.intelligence = cs.reduce((a, c) => a + intelligence(c.genome.brain), 0) / n;
    for (const k of ['endurance', 'dexterity']) avg[k] = cs.reduce((a, c) => a + c.stats[k], 0) / n;
    // Calls per minute per syllable since the previous sample.
    const prevT = this.series.length ? this.series.at(-1).t : 0, span = Math.max(1e-6, world.time - prevT);
    const calls = world.callCounts ? world.callCounts.map((k) => (k * 60) / span) : [0, 0, 0, 0];
    if (world.callCounts) world.callCounts.fill(0);
    const labels = Object.fromEntries(LABELS.map((l) => [l, 0]));
    for (const c of cs) if (c.label) labels[c.label]++;
    const biomes = Object.fromEntries(BIOMES.map((b) => [b.key, 0]));
    if (world.terrain) for (const c of cs) biomes[BIOMES[world.terrain.biomeAt(c.x, c.z)].key]++;
    const carn = cs.filter((c) => traitsOf(c.genome).diet > 0.5).length;
    this.series.push({ t: world.time, pop: cs.length, herb: cs.length - carn, carn, food: world.food.length, avg, labels, biomes, calls, rollers: cs.length ? cs.filter((c) => c.rolling).length / cs.length : 0, species: world.tracker ? world.tracker.species.length : 0 });
    // Halve resolution when full so the series stays bounded and evenly spaced.
    if (this.series.length > MAX_POINTS) {
      this.series = this.series.filter((_, i) => i % 2 === 0);
      this.interval *= 2;
    }
  }
}
