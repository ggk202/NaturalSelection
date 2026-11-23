import { createRng } from './rng.js';
import { randomGenome, mutate } from './genome.js';
import { deriveStats } from './body.js';
import { think, INPUTS, OUTPUTS } from './brain.js';
import { Grid } from './grid.js';

export const DEFAULT_SETTINGS = {
  seed: 1, worldSize: 100, initialCreatures: 60, maxCreatures: 400,
  foodRate: 4, maxFood: 300, foodEnergy: 3, mutationRate: 0.08, dt: 1 / 20,
  respawnMin: 15, // bootstrap assist: refill from elite parents when population drops below this (0 = off)
};

const MAX_EVENTS = 1000;
const TAU = Math.PI * 2;
const inp = new Float32Array(INPUTS.length);

export class World {
  constructor(settings = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.reseed();
  }

  reseed() {
    const s = this.settings;
    this.rng = createRng(s.seed);
    this.creatures = [];
    this.food = [];
    this.events = [];
    this.time = 0;
    this.nextId = 1;
    this.elite = []; // top parents by child count: { genome, children }
    this.foodGrid = new Grid(8, s.worldSize);
    this.creatureGrid = new Grid(8, s.worldSize);
    for (let i = 0; i < s.initialCreatures; i++) {
      this.spawn(randomGenome(this.rng), this.rng.range(0, s.worldSize), this.rng.range(0, s.worldSize));
    }
    for (let i = 0; i < s.maxFood / 2; i++) this.addFoodAt(this.rng.range(0, s.worldSize), this.rng.range(0, s.worldSize));
  }

  spawn(genome, x, z, parent = null) {
    const stats = deriveStats(genome.body);
    const c = {
      id: this.nextId++, parentId: parent ? parent.id : null, generation: parent ? parent.generation + 1 : 0,
      genome, stats, x: this.wrap(x), z: this.wrap(z), heading: this.rng.range(0, TAU),
      energy: stats.maxEnergy * 0.5, age: 0, alive: true, children: 0,
      lastOutputs: new Float32Array(OUTPUTS.length),
      actionCounters: { moved: 0, ate: 0, attacked: 0, fled: 0, idle: 0 },
    };
    this.creatures.push(c);
    return c;
  }

  addFoodAt(x, z) {
    if (this.food.length >= this.settings.maxFood) return;
    this.food.push({ id: this.nextId++, x: this.wrap(x), z: this.wrap(z), energy: this.settings.foodEnergy });
  }

  emit(e) {
    this.events.push({ time: this.time, ...e });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  wrap(v) { const W = this.settings.worldSize; return ((v % W) + W) % W; }
  delta(a, b) { const W = this.settings.worldSize; let d = b - a; if (d > W / 2) d -= W; else if (d < -W / 2) d += W; return d; }

  // Nearest object within range and field of view; returns [dist/range, angle/π] or [1, 0].
  nearest(c, grid, filter, out, i) {
    const range = c.stats.senseRange, halfFov = c.stats.fov / 2;
    let best = range * range, bx = 0, bz = 0, found = false;
    grid.query(c.x, c.z, range, (o) => {
      if (o === c || (filter && !filter(o))) return;
      const dx = this.delta(c.x, o.x), dz = this.delta(c.z, o.z), d2 = dx * dx + dz * dz;
      if (d2 >= best) return;
      if (halfFov < Math.PI && Math.abs(angleDiff(Math.atan2(dz, dx), c.heading)) > halfFov) return;
      best = d2; bx = dx; bz = dz; found = true;
    });
    if (!found) { out[i] = 1; out[i + 1] = 0; return null; }
    out[i] = Math.sqrt(best) / range;
    out[i + 1] = angleDiff(Math.atan2(bz, bx), c.heading) / Math.PI;
    return true;
  }

  sense(c, out) {
    this.nearest(c, this.foodGrid, null, out, 0);
    out[2] = 1; out[3] = 0; out[4] = 1; out[5] = 0; // prey/threat: see predation
    const b = c.genome.body;
    this.nearest(c, this.creatureGrid, (o) => Math.abs(o.genome.body.diet - b.diet) < 0.25 && Math.abs(o.genome.body.size - b.size) < 0.4, out, 6);
    out[8] = c.energy / c.stats.maxEnergy;
    out[9] = 0; // temperature: see environment
    out[10] = 1; // hazardDist: see environment
    out[11] = 1;
    return out;
  }

  rebuildGrids() {
    this.foodGrid.clear(); for (const f of this.food) this.foodGrid.insert(f);
    this.creatureGrid.clear(); for (const c of this.creatures) this.creatureGrid.insert(c);
  }

  spawnFood(dt) {
    const expected = this.settings.foodRate * dt;
    let n = Math.floor(expected) + (this.rng.next() < expected % 1 ? 1 : 0);
    const W = this.settings.worldSize;
    while (n-- > 0) this.addFoodAt(this.rng.range(0, W), this.rng.range(0, W));
  }

  eat(c) {
    if (c.stats.digestPlant <= 0.1) return;
    const r = 0.5 * c.genome.body.size + 0.3;
    let hit = null;
    this.foodGrid.query(c.x, c.z, r, (f) => {
      if (hit || f.eaten) return;
      const dx = this.delta(c.x, f.x), dz = this.delta(c.z, f.z);
      if (dx * dx + dz * dz <= r * r) hit = f;
    });
    if (!hit) return;
    hit.eaten = true;
    c.energy = Math.min(c.stats.maxEnergy, c.energy + hit.energy * c.stats.digestPlant);
    c.actionCounters.ate++;
  }

  reproduce(c) {
    const s = this.settings;
    if (this.creatures.length >= s.maxCreatures) return;
    if (c.energy <= c.genome.body.reproThreshold * c.stats.maxEnergy) return;
    const child = this.spawn(mutate(c.genome, s.mutationRate, this.rng), c.x + this.rng.range(-1, 1), c.z + this.rng.range(-1, 1), c);
    c.energy /= 2;
    c.children++;
    child.energy = Math.min(child.stats.maxEnergy, c.energy);
    this.emit({ type: 'birth', id: child.id, parentId: c.id });
  }

  step() {
    const dt = this.settings.dt;
    this.spawnFood(dt);
    this.rebuildGrids();
    const n = this.creatures.length;
    for (let i = 0; i < n; i++) {
      const c = this.creatures[i];
      if (!c.alive) continue;
      const o = think(c.genome.brain, this.sense(c, inp), c.lastOutputs);
      const st = c.stats, throttle = o[1];
      c.heading = (c.heading + o[0] * st.turnRate * dt + TAU) % TAU;
      const v = throttle * st.speed;
      c.x = this.wrap(c.x + Math.cos(c.heading) * v * dt);
      c.z = this.wrap(c.z + Math.sin(c.heading) * v * dt);
      c.energy -= (st.upkeep + 0.01 * v * c.genome.body.size) * dt;
      if (throttle > 0.3) c.actionCounters.moved++; else if (throttle < 0.1) c.actionCounters.idle++;
      this.eat(c);
      if (o[3] > 0.5) this.reproduce(c);
      c.age += dt;
    }
    for (const c of this.creatures) {
      if (c.alive && (c.energy <= 0 || c.age > 60 * c.genome.body.size)) {
        c.alive = false;
        this.recordElite(c);
        this.emit({ type: 'death', id: c.id, cause: c.energy <= 0 ? 'starved' : 'old age' });
      }
    }
    this.creatures = this.creatures.filter((c) => c.alive);
    this.food = this.food.filter((f) => !f.eaten);
    this.respawn();
    this.time += dt;
  }

  recordElite(c) {
    if (c.children === 0) return;
    this.elite.push({ genome: c.genome, children: c.children });
    this.elite.sort((a, b) => b.children - a.children);
    if (this.elite.length > 10) this.elite.length = 10;
  }

  respawn() {
    const s = this.settings, W = s.worldSize;
    while (this.creatures.length < s.respawnMin) {
      const g = this.elite.length && this.rng.next() < 0.8
        ? mutate(this.elite[this.rng.int(0, this.elite.length - 1)].genome, s.mutationRate, this.rng)
        : randomGenome(this.rng);
      this.spawn(g, this.rng.range(0, W), this.rng.range(0, W));
    }
  }
}

export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
}
