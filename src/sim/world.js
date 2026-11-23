import { createRng } from './rng.js';
import { randomGenome, mutate, cloneGenome } from './genome.js';
import { deriveStats } from './body.js';
import { think, INPUTS, OUTPUTS } from './brain.js';
import { Grid } from './grid.js';
import { Environment, DEFAULT_ENV } from './environment.js';
import { labelOf, emptyCounters } from './behavior.js';
import { SpeciesTracker } from './species.js';
import { StatsRecorder } from './stats.js';

const LABEL_WINDOW = 20, SPECIES_EVERY = 5;

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
    this.settings = { ...DEFAULT_SETTINGS, ...settings, env: { ...DEFAULT_ENV, ...settings.env } };
    this.reseed();
  }

  reseed() {
    const s = this.settings;
    this.rng = createRng(s.seed);
    this.creatures = [];
    this.food = [];
    this.events = [];
    this.time = 0;
    this.tracker = new SpeciesTracker();
    this.stats = new StatsRecorder();
    this.checkpoints = [];
    this.nextLabelAt = LABEL_WINDOW;
    this.nextSpeciesAt = 0;
    this.nextId = 1;
    this.elite = []; // top parents by child count: { genome, children }
    this.foodGrid = new Grid(8, s.worldSize);
    this.creatureGrid = new Grid(8, s.worldSize);
    this.env = new Environment(s.env, this.rng, s.worldSize, () => this.nextId++);
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
      actionCounters: emptyCounters(), label: null, speciesId: null,
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
    const b = c.genome.body, st = c.stats;
    this.nearest(c, this.creatureGrid, (o) => o.stats.defense < st.attack, out, 2);
    c.threatNear = this.nearest(c, this.creatureGrid, (o) => o.stats.attack > st.defense, out, 4);
    this.nearest(c, this.creatureGrid, (o) => Math.abs(o.genome.body.diet - b.diet) < 0.25 && Math.abs(o.genome.body.size - b.size) < 0.4, out, 6);
    out[8] = c.energy / c.stats.maxEnergy;
    out[9] = this.env.temperature(this.time, c.x, c.z);
    out[10] = 1;
    for (const h of this.env.hazards) {
      const d = Math.max(0, Math.hypot(this.delta(c.x, h.x), this.delta(c.z, h.z)) - h.r) / st.senseRange;
      if (d < out[10]) out[10] = d;
    }
    out[11] = 1;
    return out;
  }

  rebuildGrids() {
    this.foodGrid.clear(); for (const f of this.food) this.foodGrid.insert(f);
    this.creatureGrid.clear(); for (const c of this.creatures) this.creatureGrid.insert(c);
  }

  spawnFood(dt) {
    const expected = this.settings.foodRate * dt * this.env.foodMultiplier(this.time);
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
      c.energy -= (st.upkeep + 0.01 * v * c.genome.body.size + this.envCost(c, inp)) * dt;
      c.actionCounters.steps++;
      if (throttle > 0.3) c.actionCounters.moved++; else if (throttle < 0.1) c.actionCounters.idle++;
      if (c.threatNear && throttle > 0.3 && Math.abs(inp[5]) > 0.5) c.actionCounters.fled++;
      this.eat(c);
      if (o[2] > 0.5 && st.attack > 0.05) this.attack(c);
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
    this.periodic();
  }

  periodic() {
    const t = this.time + 1e-9;
    if (t >= this.nextLabelAt) {
      this.nextLabelAt += LABEL_WINDOW;
      for (const c of this.creatures) { c.label = labelOf(c.actionCounters) ?? c.label; c.actionCounters = emptyCounters(); }
    }
    if (t >= this.nextSpeciesAt) {
      this.nextSpeciesAt += SPECIES_EVERY;
      for (const cp of this.tracker.update(this.creatures, this.time)) {
        this.checkpoints.push(cp);
        this.emit({ type: 'checkpoint', checkpoint: cp });
      }
    }
    if (this.stats.due(this.time)) this.stats.sample(this);
  }

  // Extra energy/s from temperature and hazards; reuses the temperature/hazard inputs just sensed.
  envCost(c, sensed) {
    const t = sensed[9], st = c.stats, cfg = this.settings.env;
    let cost = 0.2 * (Math.max(0, -t - st.coldResist) + Math.max(0, t - st.heatResist));
    if (sensed[10] === 0) cost += cfg.hazardDamage;
    return cost;
  }

  addHazard(x, z, r) {
    const h = { id: this.nextId++, x: this.wrap(x), z: this.wrap(z), r };
    this.env.hazards.push(h);
    this.emit({ type: 'god', action: 'addHazard', id: h.id });
    return h.id;
  }

  removeHazard(id) {
    this.env.hazards = this.env.hazards.filter((h) => h.id !== id);
    this.emit({ type: 'god', action: 'removeHazard', id });
  }

  attack(c) {
    c.energy -= 0.02 * this.settings.dt;
    const reach = 0.6 * c.genome.body.size;
    let target = null, best = Infinity;
    this.creatureGrid.query(c.x, c.z, reach + 1, (o) => {
      if (o === c || !o.alive) return;
      const dx = this.delta(c.x, o.x), dz = this.delta(c.z, o.z), d = Math.hypot(dx, dz);
      if (d <= reach + 0.5 * o.genome.body.size && d < best) { best = d; target = o; }
    });
    if (!target) return;
    c.actionCounters.attacked++;
    target.energy -= c.stats.attack * this.settings.dt * 5;
    if (target.energy > 0) return;
    target.alive = false;
    c.energy = Math.min(c.stats.maxEnergy, c.energy + 0.6 * target.stats.maxEnergy * c.stats.digestMeat);
    this.emit({ type: 'kill', killerId: c.id, victimId: target.id });
    this.emit({ type: 'death', id: target.id, cause: 'killed' });
    this.recordElite(target);
  }

  find(id) { return this.creatures.find((c) => c.id === id) || null; }

  addFood(x, z, n = 10) {
    const cap = 2 * this.settings.maxFood; // god-mode may overfill
    for (let i = 0; i < n && this.food.length < cap; i++) {
      this.food.push({ id: this.nextId++, x: this.wrap(x + this.rng.range(-2, 2)), z: this.wrap(z + this.rng.range(-2, 2)), energy: this.settings.foodEnergy });
    }
    this.emit({ type: 'god', action: 'addFood', n });
  }

  killCreature(id) {
    const c = this.find(id);
    if (!c) return;
    c.alive = false;
    this.creatures = this.creatures.filter((x) => x !== c);
    this.emit({ type: 'death', id, cause: 'god' });
  }

  cloneCreature(id) {
    const c = this.find(id);
    if (!c) return null;
    const k = this.spawn(cloneGenome(c.genome), c.x + this.rng.range(-1, 1), c.z + this.rng.range(-1, 1), c);
    k.generation = c.generation; k.energy = Math.min(k.stats.maxEnergy, c.energy);
    this.emit({ type: 'god', action: 'clone', id: k.id, sourceId: id });
    return k.id;
  }

  mutateCreature(id, rate = 0.5) {
    const c = this.find(id);
    if (!c) return;
    c.genome = mutate(c.genome, rate, this.rng);
    c.stats = deriveStats(c.genome.body);
    c.energy = Math.min(c.energy, c.stats.maxEnergy);
    this.emit({ type: 'god', action: 'mutate', id });
  }

  seedPredators(n) {
    const W = this.settings.worldSize;
    for (let i = 0; i < n; i++) {
      const src = this.creatures.length ? this.creatures[this.rng.int(0, this.creatures.length - 1)].genome : randomGenome(this.rng);
      const g = cloneGenome(src);
      g.body.diet = 0.9; g.body.mouth = Math.max(g.body.mouth, 1.2);
      this.spawn(g, this.rng.range(0, W), this.rng.range(0, W));
    }
    this.emit({ type: 'god', action: 'seedPredators', n });
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
