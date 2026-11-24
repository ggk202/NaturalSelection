import { createRng } from './rng.js';
import { randomGenome, mutate, cloneGenome, relatedness, traitsOf } from './genome.js';
import { deriveStats } from './body.js';
import { runBrain, newState, brainCost, initWeights, learn, N_IN, N_OUT, RAY_CAP, SCALARS } from './neat.js';
import { createMap, inheritMap, remember, recall, fade } from './memory.js';
import { createPhysics } from './physics.js';
import { buildBody, removeBody, applyMotors, senseBody, stepPhysics, headSteady } from './creature-physics.js';
import { castRays } from './vision.js';
import { Grid } from './grid.js';
import { Environment, DEFAULT_ENV } from './environment.js';
import { labelOf, emptyCounters } from './behavior.js';
import { SpeciesTracker, capCheckpoints, SYLLABLES } from './species.js';
export { SYLLABLES };
import { StatsRecorder } from './stats.js';
import { createTerrain } from './terrain.js';
import { BIOMES, BIOME } from './biomes.js';
import { initObjects, rebuildObjectGrid, senseObjects, act, stepObjects, onEat, spearBonus, hurt } from './tools.js';
import { OUTPUTS } from './neat.js';
const OUT = { grab: OUTPUTS.indexOf('grab'), drop: OUTPUTS.indexOf('drop'), use: OUTPUTS.indexOf('use') };

const LABEL_WINDOW = 20, SPECIES_EVERY = 5;
const CALL_ON = 0.6;
const CALL_COST = 0.05; // energy/s at full loudness (≈ base upkeep; 0.3 starved founders)
const WORD_HOLD = 10; // steps a syllable is held before it repeats within a word
const OCTANTS = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast']; // +x east, +z south
const AMBUSH_WAIT = 60, AMBUSH_STRIKE = 40; // steps: still ≥3 s, then strike within 2 s

export const DEFAULT_SETTINGS = {
  seed: 1, locomotion: 'kinematic', // 'physical': jointed bodies driven by muscles (Rapier)
  worldSize: 200, waterLevel: 0.22, flat: false, initialCreatures: 80, maxCreatures: 400,
  maxRays: 9, mapCell: 10, foodRate: 16, maxFood: 1200, foodEnergy: 4, mutationRate: 0.08, dt: 1 / 20, // food: same density per unit² as v1 on a 4× larger world
  predatorMin: 5, // once carnivores exist, refill them from the best hunters below this (0 = off)
  respawnMin: 15, // bootstrap assist: refill from elite parents when population drops below this (0 = off)
};

const MAX_EVENTS = 1000;
const TAU = Math.PI * 2;
const inp = new Float32Array(N_IN);
export const SCALAR_AT = Object.fromEntries(SCALARS.map((k, i) => [k, RAY_CAP * 3 + i]));
const S = SCALAR_AT;

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
    this.nextFadeAt = 5;
    this.calls = []; // heard this step (emitted last step)
    this.newCalls = [];
    this.callCounts = [0, 0, 0, 0]; // per syllable since the last stats sample
    this.stepCount = 0;
    this.nextSpeciesAt = 0;
    this.nextId = 1;
    this.nextNodeId = 1000; // hidden neuron ids (shared by descendants)
    this.nodeIds = () => this.nextNodeId++;
    this.elite = []; // top parents by child count: { genome, children }
    this.eliteCarn = []; // top carnivores by kills + children
    this.carnivoresSeen = false;
    this.foodGrid = new Grid(8, s.worldSize);
    this.creatureGrid = new Grid(8, s.worldSize);
    this.objectGrid = new Grid(8, s.worldSize);
    this.terrain = createTerrain(s);
    this.physics = s.locomotion === 'physical' ? createPhysics(this.terrain) : null;
    this.env = new Environment(s.env, this.rng, s.worldSize, () => this.nextId++);
    for (let i = 0; i < s.initialCreatures; i++) {
      const p = this.randomLandPoint();
      this.spawn(randomGenome(this.rng, !!this.physics), p.x, p.z);
    }
    for (let i = 0; i < this.foodCap / 2; i++) this.spawnOneFood();
    initObjects(this);
  }

  // A one-off "first ever" milestone (tool use and the like).
  milestone(c, key, title) {
    const t = this.tracker;
    if (t.firsts[key]) return;
    t.firsts[key] = true;
    const cp = { id: t.nextCheckpointId++, time: this.time, speciesId: c.speciesId, kind: 'first', title, genome: cloneGenome(c.genome), avgBody: { ...traitsOf(c.genome) } };
    this.checkpoints.push(cp);
    this.emit({ type: 'checkpoint', checkpoint: cp });
  }

  // Food settings are per 200×200 area, so density stays the same at any world size.
  get areaScale() { return (this.settings.worldSize / 200) ** 2; }
  // Physical bodies cover ground far slower, so their worlds hold 3× the food density.
  get foodScale() { return this.areaScale * (this.settings.locomotion === 'physical' ? 3 : 1); }
  get foodCap() { return Math.round(this.settings.maxFood * this.foodScale); }
  get foodRateNow() { return this.settings.foodRate * this.foodScale; }

  spawn(genome, x, z, parent = null) {
    const stats = deriveStats(genome.body);
    const c = {
      id: this.nextId++, parentId: parent ? parent.id : null, generation: parent ? parent.generation + 1 : 0,
      genome, stats, x: this.wrap(x), z: this.wrap(z), heading: this.rng.range(0, TAU),
      energy: stats.maxEnergy * 0.5, age: 0, alive: true, children: 0, kills: 0,
      lastOutputs: new Float32Array(N_OUT), brainState: newState(genome.brain), brainPre: newState(genome.brain), brainUpkeep: brainCost(genome.brain), stillRun: 0, strikeWindow: 0,
      weights: initWeights(genome.brain), energyMark: null, normalCost: 0,
      map: parent ? inheritMap(parent.map) : createMap(this.settings.worldSize, this.settings.mapCell),
      actionCounters: emptyCounters(), label: null, speciesId: null,
    };
    if (traitsOf(genome).diet > 0.5) this.carnivoresSeen = true;
    if (this.physics) buildBody(this, c, c.x, c.z, c.heading);
    this.creatures.push(c);
    return c;
  }

  addFoodAt(x, z) {
    if (this.food.length >= this.foodCap) return;
    this.food.push(this.makeFood(x, z));
  }

  makeFood(x, z) {
    x = this.wrap(x); z = this.wrap(z);
    const b = this.terrain.biomeAt(x, z);
    return { id: this.nextId++, x, z, energy: this.settings.foodEnergy, type: b === BIOME.forest ? 'fruit' : b === BIOME.lake ? 'water' : 'plant' };
  }

  // Food lands preferentially in fertile biomes (rejection sampling on fertility).
  spawnOneFood() {
    const W = this.settings.worldSize;
    for (let tries = 0; tries < 12; tries++) {
      const x = this.rng.range(0, W), z = this.rng.range(0, W);
      if (this.rng.next() * 2 < BIOMES[this.terrain.biomeAt(x, z)].fertility) return this.addFoodAt(x, z);
    }
  }

  randomLandPoint() {
    const W = this.settings.worldSize;
    let x = 0, z = 0;
    for (let tries = 0; tries < 50; tries++) {
      x = this.rng.range(0, W); z = this.rng.range(0, W);
      if (!this.terrain.isWater(x, z)) break;
    }
    return { x, z };
  }

  biomeOf(c) { return BIOMES[this.terrain.biomeAt(c.x, c.z)]; }

  temperatureAt(x, z) {
    return this.env.temperature(this.time, x, z, this.terrain, BIOMES[this.terrain.biomeAt(x, z)]);
  }

  // Energy/s lost to the biome itself (drowning in lakes scales with lack of swimming).
  biomeDrain(c, b) { return b.id === BIOME.lake ? (c.stats.flies ? 0 : b.drain * (1 - c.stats.swim) ** 2) : b.drain; }

  emit(e) {
    this.events.push({ time: this.time, ...e });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  wrap(v) { const W = this.settings.worldSize; return ((v % W) + W) % W; }
  delta(a, b) { const W = this.settings.worldSize; let d = b - a; if (d > W / 2) d -= W; else if (d < -W / 2) d += W; return d; }

  // Number of vision rays: from eyes, capped by the maxRays setting.
  raysOf(c) { return Math.max(1, Math.min(this.settings.maxRays, RAY_CAP, 1 + 2 * traitsOf(c.genome).eyes)); }

  // Fills the brain input vector: ray channels, then scalars (see neat.js INPUT_NAMES).
  sense(c, out) {
    const t = this.terrain, biome = this.biomeOf(c), st = c.stats;
    c.threatNear = castRays(this, c, this.raysOf(c), out, 0);
    const hx = Math.cos(c.heading), hz = Math.sin(c.heading);
    out[S.energy] = c.energy / st.maxEnergy;
    out[S.temperature] = this.temperatureAt(c.x, c.z);
    out[S.tempGradient] = Math.max(-1, Math.min(1, 5 * (t.tempAt(c.x + 2 * hx, c.z + 2 * hz) - t.tempAt(c.x, c.z))));
    out[S.biomeFood] = biome.fertility / 2;
    out[S.biomeDanger] = Math.min(1, this.biomeDrain(c, biome) / 0.25);
    out[S.cover] = Math.max(0, 1 - biome.sightMul);
    out[S.slopeAhead] = Math.max(-1, Math.min(1, t.slopeAlong(c.x, c.z, c.heading)));
    out[S.waterAhead] = t.isWater(c.x + 2 * hx, c.z + 2 * hz) ? 1 : 0;
    let hz2 = 1;
    for (const h of this.env.hazards) {
      const d = Math.max(0, Math.hypot(this.delta(c.x, h.x), this.delta(c.z, h.z)) - h.r) / st.senseRange;
      if (d < hz2) hz2 = d;
    }
    out[S.hazardDist] = hz2;
    out[S.bias] = 1;
    const m = c.map, look = 2 * m.cell;
    for (const [side, a] of [['Ahead', 0], ['Left', -0.6], ['Right', 0.6]]) {
      const x = c.x + Math.cos(c.heading + a) * look, z = c.z + Math.sin(c.heading + a) * look;
      out[S[`mapFood${side}`]] = recall(m, x, z, 'food');
      out[S[`mapDanger${side}`]] = recall(m, x, z, 'danger');
    }
    out[S.familiarity] = recall(m, c.x, c.z, 'visits');
    // Relatedness only changes when the creature looks at someone else (or genomes change): cache it.
    const o = c.nearestSeen;
    if (o && (!c.kinCache || c.kinCache.a !== c.genome || c.kinCache.b !== o.genome)) c.kinCache = { a: c.genome, b: o.genome, v: relatedness(c.genome, o.genome) };
    out[S.kinNear] = o ? c.kinCache.v : 0;
    this.hear(c, out);
    senseObjects(this, c, out, S);
    out[S.compassSin] = Math.sin(c.heading); out[S.compassCos] = Math.cos(c.heading);
    if ((this.stepCount + c.id) % 20 === 0 || c.memFood === undefined) c.memFood = bestFood(c.map);
    if (c.memFood) {
      const dx = this.delta(c.x, c.memFood.x), dz = this.delta(c.z, c.memFood.z), a = Math.atan2(dz, dx) - c.heading;
      out[S.memFoodSin] = Math.sin(a); out[S.memFoodCos] = Math.cos(a);
      out[S.memFoodDist] = Math.min(1, Math.hypot(dx, dz) / (this.settings.worldSize / 2));
    } else { out[S.memFoodSin] = 0; out[S.memFoodCos] = 0; out[S.memFoodDist] = 1; }
    senseBody(this, c, out, S);
    return out;
  }

  // Hearing: loudness per syllable, direction and kinship of the loudest call (from last step's calls).
  hear(c, out) {
    for (let k = 0; k < 4; k++) out[S[`hear${k}`]] = 0;
    out[S.hearSin] = 0; out[S.hearCos] = 0; out[S.hearKin] = 0;
    const ears = 1 + 0.25 * traitsOf(c.genome).antennae;
    let loudest = null, best = 0;
    for (const k of this.calls) {
      if (k.id === c.id) continue;
      const dx = this.delta(c.x, k.x), dz = this.delta(c.z, k.z), R = (10 + 30 * k.loud) * ears;
      if (Math.abs(dx) >= R || Math.abs(dz) >= R) continue; // cheap reject before hypot
      const d = Math.hypot(dx, dz);
      if (d >= R) continue;
      const v = k.loud * (1 - d / R), slot = S[`hear${k.syll}`];
      if (v > out[slot]) out[slot] = v;
      if (v > best) { best = v; loudest = k; out[S.hearSin] = Math.sin(Math.atan2(dz, dx) - c.heading); out[S.hearCos] = Math.cos(Math.atan2(dz, dx) - c.heading); }
    }
    if (loudest) out[S.hearKin] = relatedness(c.genome, loudest.genome);
    c.heard = loudest ? loudest.syll : -1;
    // The loudest speaker's word so far: its last syllables, as many as this listener can attend to.
    const word = loudest ? loudest.word : null, span = word ? Math.min(word.length, c.stats.attention) : 0;
    for (let i = 0; i < 6; i++) out[S[`heard${i}`]] = i < span ? (word[word.length - span + i] + 1) / 4 : 0;
  }

  rebuildGrids() {
    this.foodGrid.clear(); for (const f of this.food) this.foodGrid.insert(f);
    this.creatureGrid.clear(); for (const c of this.creatures) this.creatureGrid.insert(c);
    rebuildObjectGrid(this);
  }

  spawnFood(dt) {
    const expected = this.foodRateNow * dt * this.env.foodMultiplier(this.time);
    let n = Math.floor(expected) + (this.rng.next() < expected % 1 ? 1 : 0);
    while (n-- > 0) this.spawnOneFood();
  }

  eat(c) {
    if (c.stats.digestPlant <= 0.1 || !headSteady(this, c)) return;
    const r = 0.5 * traitsOf(c.genome).size + 0.3;
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
    remember(c.map, c.x, c.z, 'food', 0.5);
    onEat(this, c, hit);
  }

  reproduce(c) {
    const s = this.settings;
    if (this.creatures.length >= s.maxCreatures) return;
    if (c.energy <= traitsOf(c.genome).reproThreshold * c.stats.maxEnergy) return;
    const away = this.physics ? 1.5 + traitsOf(c.genome).size * 1.5 : 1, ang = this.rng.range(0, TAU); // physical: don't spawn inside the parent
    const child = this.spawn(mutate(c.genome, s.mutationRate, this.rng, this.nodeIds, { physical: !!this.physics }), c.x + Math.cos(ang) * this.rng.range(0, away), c.z + Math.sin(ang) * this.rng.range(0, away), c);
    c.normalCost += c.energy / 2; // giving birth is not a punishment
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
      // Reward = energy change since this creature's last update, beyond its normal running costs.
      // Credit goes to the activations that produced last step's actions (still in brainState).
      if (c.energyMark !== null) {
        const reward = Math.max(-1, Math.min(1, c.energy - c.energyMark + c.normalCost));
        learn(c.genome.brain, c.brainPre, c.brainState, c.weights, reward);
        if (reward < -0.02) remember(c.map, c.x, c.z, 'danger', Math.min(1, -2 * reward));
      }
      c.energyMark = c.energy;
      remember(c.map, c.x, c.z, 'visits', 1 / 127);
      const o = runBrain(c.genome.brain, c.brainState, this.sense(c, inp), c.lastOutputs, c.weights, c.brainPre);
      const st = c.stats, ac = c.actionCounters;
      let throttle, move;
      if (this.physics) {
        // Muscles move the body; physics runs after every creature has acted. Effort tires and costs energy.
        const effort = applyMotors(this, c, o);
        c.stamina = Math.min(st.endurance, c.stamina - 0.2 * effort * dt + (effort < 0.5 ? st.staminaRegen * dt : 0));
        throttle = Math.min(1, (c.speed || 0) / 2);
        move = 0.004 * effort;
      } else {
        throttle = o[1];
        c.heading = (c.heading + o[0] * st.turnRate * dt + TAU) % TAU;
        const v = throttle * st.speed * this.terrainSpeed(c);
        c.x = this.wrap(c.x + Math.cos(c.heading) * v * dt);
        c.z = this.wrap(c.z + Math.sin(c.heading) * v * dt);
        this.track(c, Math.abs(v) * dt);
        move = 0.01 * v * traitsOf(c.genome).size;
      }
      c.normalCost = (st.upkeep + c.brainUpkeep + move) * dt;
      c.energy -= c.normalCost + this.envCost(c, inp) * dt;
      c.actionCounters.steps++;
      if (throttle > 0.3) c.actionCounters.moved++; else if (throttle < 0.1) c.actionCounters.idle++;
      // Ambush tracking: a long still spell opens a short strike window once the creature moves.
      if (throttle < 0.1) c.stillRun++;
      else { if (c.stillRun >= AMBUSH_WAIT) c.strikeWindow = AMBUSH_STRIKE; c.stillRun = 0; }
      if (c.strikeWindow > 0) c.strikeWindow--;
      if (c.threatNear && throttle > 0.3 && Math.abs(o[0]) > 0.5) c.actionCounters.fled++; // moving and turning hard while threatened
      this.eat(c);
      if (o[2] > 0.5 && st.attack + spearBonus(this, c) > 0.05) this.attack(c);
      act(this, c, o, OUT);
      if ((this.stepCount & 7) === 0) this.tracker.noteContext(c, this.callContext(c), this.stepCount); // base rates, sampled
      // Dead-zone: a drifting unwired output (≈0.5) must not murmur constantly.
      if (o[4] > CALL_ON) this.call(c, (o[4] - CALL_ON) / (1 - CALL_ON), (o[5] > 0.5 ? 1 : 0) + (o[6] > 0.5 ? 2 : 0));
      else { c.said = -1; this.endWord(c); }
      if (o[3] >= 0.5) this.reproduce(c); // unwired output (0.5) = willing; brains can evolve restraint
      c.age += dt;
    }
    if (this.physics) {
      const before = this.creatures.map((c) => [c.x, c.z]);
      stepPhysics(this);
      this.creatures.forEach((c, i) => {
        const d = Math.hypot(this.delta(before[i][0], c.x), this.delta(before[i][1], c.z));
        c.speed = d / dt;
        this.track(c, d);
      });
    }
    stepObjects(this);
    for (const c of this.creatures) {
      if (c.alive && (c.energy <= 0 || c.age > 60 * traitsOf(c.genome).size || c.physicsFault)) {
        c.alive = false;
        this.recordElite(c);
        this.emit({ type: 'death', id: c.id, cause: c.physicsFault ? 'physics' : c.energy <= 0 ? 'starved' : 'old age' });
      }
    }
    if (this.physics) for (const c of this.creatures) if (!c.alive) removeBody(this, c);
    this.creatures = this.creatures.filter((c) => c.alive);
    this.food = this.food.filter((f) => !f.eaten);
    this.stepCount++;
    this.calls = this.newCalls; // heard next step: keeps updates order-independent
    this.newCalls = [];
    this.respawn();
    this.time += dt;
    this.periodic();
  }

  // Movement range for behaviour labels (homebody, patroller).
  track(c, dist) {
    const ac = c.actionCounters;
    if (c.winX === undefined) { c.winX = c.x; c.winZ = c.z; }
    ac.path += dist;
    ac.maxDist = Math.max(ac.maxDist, Math.hypot(this.delta(c.winX, c.x), this.delta(c.winZ, c.z)));
  }

  periodic() {
    const t = this.time + 1e-9;
    if (t >= this.nextLabelAt) {
      this.nextLabelAt += LABEL_WINDOW;
      for (const c of this.creatures) { c.label = labelOf(c.actionCounters) ?? c.label; c.actionCounters = emptyCounters(); c.winX = c.x; c.winZ = c.z; }
    }
    if (t >= this.nextFadeAt) {
      this.nextFadeAt += 5;
      for (const c of this.creatures) fade(c.map);
    }
    if (t >= this.nextSpeciesAt) {
      this.nextSpeciesAt += SPECIES_EVERY;
      for (const cp of this.tracker.update(this.creatures, this.time, (c) => this.biomeOf(c).key)) {
        this.checkpoints.push(cp);
        this.emit({ type: 'checkpoint', checkpoint: cp });
      }
      this.checkpoints = capCheckpoints(this.checkpoints);
    }
    if (this.stats.due(this.time)) this.stats.sample(this);
  }

  // Calling costs energy and can be overheard by anyone, predators included.
  call(c, loud, syll) {
    // Consecutive syllables form a word, up to the attention span; a silent step ends it.
    const w = c.word || (c.word = []);
    if (!w.length || w[w.length - 1] !== syll || ++c.wordHold >= WORD_HOLD) {
      if (w.length < c.stats.attention) c.word = [...w, syll]; // new array: heard records keep their copy
      c.wordHold = 0;
    }
    const cost = CALL_COST * loud * this.settings.dt;
    c.energy -= cost;
    c.normalCost += cost; // a chosen action, not a punishment
    this.newCalls.push({ x: c.x, z: c.z, syll, loud, id: c.id, genome: c.genome, word: c.word });
    this.callCounts[syll]++;
    c.said = syll;
    this.tracker.noteCall(c, syll, this.callContext(c), this.stepCount);
  }

  endWord(c) {
    if (!c.word || !c.word.length) return;
    c.lastWord = c.word;
    if (c.word.length > 1) this.tracker.noteWord(c, c.word.map((k) => SYLLABLES[k]).join('-'), this.callContext(c), this.stepCount);
    c.word = [];
  }

  // What was going on when a creature called: threat seen, food seen, kin nearby; where it is and
  // which compass direction its best remembered food lies in (what a word might describe).
  callContext(c) {
    let food = false;
    for (let r = 0; r < RAY_CAP; r++) if (inp[r * 3] > 0.3) { food = true; break; }
    const m = c.memFood, dir = m ? OCTANTS[(Math.round(Math.atan2(this.delta(c.z, m.z), this.delta(c.x, m.x)) / (Math.PI / 4)) + 8) % 8] : null;
    return { threat: !!c.threatNear, food, kin: inp[S.kinNear] > 0.6, biome: this.biomeOf(c).key, dir };
  }

  // Speed multiplier from biome, water and slope; 0 when a slope is too steep to climb.
  terrainSpeed(c) {
    if (c.stats.flies && !this.physics) return 1; // flyers cross water and cliffs at land speed
    const b = this.biomeOf(c), s = this.terrain.slopeAlong(c.x, c.z, c.heading);
    if (s > 0.6 && c.stats.climb < s - 0.4) return 0;
    // Water slows everyone; swimming recovers most (not all) of the land speed.
    // Mountains likewise reward climbing.
    const skill = b.id === BIOME.lake || b.id === BIOME.wetland ? c.stats.swim : b.id === BIOME.mountain ? c.stats.climb : null;
    let m = skill == null ? b.moveMul : b.moveMul + (0.9 - b.moveMul) * skill;
    m /= 1 + Math.max(0, s) * 2;
    return m * (1 + Math.min(0.3, Math.max(0, -s)));
  }

  // Extra energy/s from temperature, biome and hazards; reuses the inputs just sensed.
  envCost(c, sensed) {
    const t = sensed[S.temperature], st = c.stats, cfg = this.settings.env;
    let cost = 0.2 * (Math.max(0, -t - st.coldResist) + Math.max(0, t - st.heatResist)) * (c.sheltered ? 0.3 : 1);
    cost += this.biomeDrain(c, this.biomeOf(c));
    if (sensed[S.hazardDist] === 0) cost += cfg.hazardDamage;
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
    if (!headSteady(this, c)) return;
    const reach = 0.6 * traitsOf(c.genome).size;
    let target = null, best = Infinity;
    this.creatureGrid.query(c.x, c.z, reach + 1, (o) => {
      if (o === c || !o.alive) return;
      const dx = this.delta(c.x, o.x), dz = this.delta(c.z, o.z), d = Math.hypot(dx, dz);
      if (d <= reach + 0.5 * traitsOf(o.genome).size && d < best) { best = d; target = o; }
    });
    if (!target) return;
    // Lakes are a refuge from hunters that can't swim.
    if (c.stats.swim < 0.5 && !c.stats.flies && this.terrain.isWater(target.x, target.z)) return;
    c.actionCounters.attacked++;
    if (c.strikeWindow > 0) {
      c.strikeWindow = 0;
      c.actionCounters.ambushes++;
      this.emit({ type: 'ambush', id: c.id });
      for (const cp of this.tracker.noteAmbush(c, this.time)) { this.checkpoints.push(cp); this.emit({ type: 'checkpoint', checkpoint: cp }); }
    }
    const dmg = Math.min(Math.max(target.energy, 0), (c.stats.attack + spearBonus(this, c)) * this.settings.dt * 5 * (target.sheltered ? 0.5 : 1));
    target.energy -= dmg;
    c.energy = Math.min(c.stats.maxEnergy, c.energy + 0.8 * dmg * c.stats.digestMeat); // feeding while biting
    if (target.energy > 0) return;
    target.alive = false;
    c.energy = Math.min(c.stats.maxEnergy, c.energy + 0.25 * target.stats.maxEnergy * c.stats.digestMeat); // kept small: bigger bonuses create energy from nothing via cannibalism
    c.kills++;
    this.emit({ type: 'kill', killerId: c.id, victimId: target.id });
    this.emit({ type: 'death', id: target.id, cause: 'killed' });
    this.recordElite(target);
  }

  find(id) { return this.creatures.find((c) => c.id === id) || null; }

  addFood(x, z, n = 10) {
    const cap = 2 * this.foodCap; // god-mode may overfill
    for (let i = 0; i < n && this.food.length < cap; i++) {
      this.food.push({ id: this.nextId++, x: this.wrap(x + this.rng.range(-2, 2)), z: this.wrap(z + this.rng.range(-2, 2)), energy: this.settings.foodEnergy });
    }
    this.emit({ type: 'god', action: 'addFood', n });
  }

  killCreature(id) {
    const c = this.find(id);
    if (!c) return;
    c.alive = false;
    if (this.physics) removeBody(this, c);
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
    c.genome = mutate(c.genome, rate, this.rng, this.nodeIds, { physical: !!this.physics });
    c.stats = deriveStats(c.genome.body);
    c.brainState = newState(c.genome.brain);
    c.brainPre = newState(c.genome.brain);
    c.energyMark = null; // a new maxEnergy clamp isn't damage
    c.brainUpkeep = brainCost(c.genome.brain);
    c.weights = initWeights(c.genome.brain); // memories (map) are kept: they aren't genetic
    c.energy = Math.min(c.energy, c.stats.maxEnergy);
    if (this.physics) { removeBody(this, c); buildBody(this, c, c.x, c.z, c.heading); } // new body shape
    this.emit({ type: 'god', action: 'mutate', id });
  }

  seedPredators(n) {
    const W = this.settings.worldSize;
    for (let i = 0; i < n; i++) {
      const src = this.creatures.length ? this.creatures[this.rng.int(0, this.creatures.length - 1)].genome : randomGenome(this.rng, !!this.physics);
      const p = this.randomLandPoint();
      this.spawn(predatorGenome(src), p.x, p.z);
    }
    this.emit({ type: 'god', action: 'seedPredators', n });
  }

  recordElite(c) {
    if (traitsOf(c.genome).diet > 0.5 && c.kills + c.children > 0) {
      this.eliteCarn.push({ genome: c.genome, children: c.kills * 2 + c.children });
      this.eliteCarn.sort((a, b) => b.children - a.children);
      if (this.eliteCarn.length > 10) this.eliteCarn.length = 10;
    }
    if (c.children === 0) return;
    this.elite.push({ genome: c.genome, children: c.children });
    this.elite.sort((a, b) => b.children - a.children);
    if (this.elite.length > 10) this.elite.length = 10;
  }

  respawn() {
    const s = this.settings, W = s.worldSize;
    if (this.carnivoresSeen && s.predatorMin > 0) {
      let carn = 0;
      for (const c of this.creatures) if (traitsOf(c.genome).diet > 0.5) carn++;
      for (; carn < s.predatorMin && this.creatures.length < s.maxCreatures; carn++) {
        const g = this.eliteCarn.length
          ? mutate(this.eliteCarn[this.rng.int(0, this.eliteCarn.length - 1)].genome, s.mutationRate, this.rng, this.nodeIds, { physical: !!this.physics })
          : predatorGenome(this.creatures.length ? this.creatures[this.rng.int(0, this.creatures.length - 1)].genome : randomGenome(this.rng, !!this.physics));
        g.body.diet = Math.max(g.body.diet ?? 0, 0.55);
        const p = this.randomLandPoint();
        this.spawn(g, p.x, p.z);
      }
    }
    while (this.creatures.length < s.respawnMin) {
      const g = this.elite.length && this.rng.next() < 0.8
        ? mutate(this.elite[this.rng.int(0, this.elite.length - 1)].genome, s.mutationRate, this.rng, this.nodeIds, { physical: !!this.physics })
        : randomGenome(this.rng, !!this.physics);
      const p = this.randomLandPoint();
      this.spawn(g, p.x, p.z);
    }
  }
}

// Centre of the best remembered food cell (null if nothing worth remembering).
function bestFood(m) {
  let best = 12, k = -1; // ≈0.1 of full strength
  for (let i = 0; i < m.food.length; i++) if (m.food[i] > best) { best = m.food[i]; k = i; }
  return k < 0 ? null : { x: (k % m.n + 0.5) * m.cell, z: (Math.floor(k / m.n) + 0.5) * m.cell };
}

function predatorGenome(src) {
  const g = cloneGenome(src);
  g.body.diet = 0.9;
  const mouths = g.body.nodes.filter((n) => n.mouth > 0);
  for (const n of mouths.length ? mouths : [g.body.nodes[0]]) n.mouth = Math.max(n.mouth, 1.2);
  return g;
}

export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
}
