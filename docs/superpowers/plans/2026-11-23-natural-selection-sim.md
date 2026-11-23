# Natural Selection Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3D natural-selection sandbox as an offline-capable PWA for iPad. Creatures evolve low-poly bodies and neural-network brains, predators emerge from the gene pool, environmental threats apply pressure, and settings, stats and evolution checkpoints are kept in IndexedDB.

**Architecture:** The simulation is pure, DOM-free ES modules under `src/sim/` that run deterministically from a seed at a fixed timestep. Node's built-in test runner unit-tests them. The rendering layer (`src/render/`) and UI (`src/ui/`) read the sim state each frame and never mutate it directly. They go through `World` methods, which god-mode tools also use. Persistence (`src/storage.js`) serializes genomes, stats and checkpoints only, never per-frame state.

**Tech Stack:** Plain ES modules, with no build step and no runtime dependencies other than Three.js r170, vendored at `vendor/three.module.min.js` and `vendor/OrbitControls.js`. Unit tests use `node --test` on Node 22. Browser smoke tests use the preinstalled Playwright and Chromium. The app is hosted on GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-23-natural-selection-sim-design.md`

## Global Constraints

- Target device: an older iPad Pro, running Safari with WebGL2. Performance goal: a few hundred creatures at 30fps or more.
- There is no server. The site is static, and storage is browser-only (IndexedDB). Store genomes and stats, not full world frames.
- Bodies are not cosmetic: every body part changes at least one derived stat **and** energy upkeep.
- Behaviour is not scripted: all movement and actions come from the brain's outputs.
- Long runs must not be lost: auto-save every 60 s of real time and on `visibilitychange` → hidden.
- Touch-first controls (orbit, pinch-zoom, tap). There are no hover-only interactions.
- The sim is deterministic: the same seed and settings give the same state after N steps.
- Vendor Three.js locally so it works offline. This replaces the spec's CDN-plus-cache approach. It is a builder call: simpler, with the same result.

## Review Focus

1. **Extinction (0 creatures):** the sim keeps running without NaNs, the UI shows "Extinct", and Reseed works. Test: Task 4, `extinction is stable`.
2. **Population explosion:** births stop at `settings.maxCreatures` (default 400) so the iPad stays usable. Test: Task 4, `respects maxCreatures`.
3. **Tab backgrounded or iPad asleep:** a huge frame delta must not cause a spiral of sim steps. Steps per frame are capped at 8 × speed, and the app auto-saves on hide. Test: Task 10, `clamps catch-up steps`.
4. **Storage unavailable or quota exceeded** (private mode, full disk): the app warns once and keeps running with no crash. Test: Task 9, `save failure is non-fatal`.
5. **Save from an older schema:** loading never crashes. A mismatched `schemaVersion` is rejected with a message and the save is not deleted. Test: Task 9, `rejects unknown schemaVersion`.

---

## File Structure

```
index.html                 app shell, loads src/main.js
style.css
manifest.webmanifest, sw.js, icons/icon.svg, icons/icon-192.png, icons/icon-512.png
vendor/three.module.min.js, vendor/OrbitControls.js
package.json               {"type":"module","scripts":{"test":"node --test test/","e2e":"node test-e2e/run.js"}}
src/sim/rng.js             seeded RNG
src/sim/genome.js          gene table, random/mutate/clone/distance
src/sim/body.js            genome -> derived stats (cost/benefit)
src/sim/brain.js           MLP forward pass, sizes
src/sim/grid.js            spatial hash for neighbour queries
src/sim/world.js           World: creatures, food, step(), god-mode API
src/sim/environment.js     seasons, temperature, hazard zones
src/sim/behavior.js        behaviour labels from action stats
src/sim/species.js         clustering + checkpoint detection
src/sim/stats.js           time-series recorder
src/sim/serialize.js       World <-> plain JSON
src/storage.js             IndexedDB wrapper (runs, checkpoints, settings)
src/render/scene.js        renderer, camera, controls, terrain, food, hazards
src/render/creatures.js    instanced low-poly body parts
src/render/preview.js      single-genome 3D viewer (inspector, checkpoints)
src/ui/controls.js         play/pause/step/speed, settings, reseed
src/ui/charts.js           canvas line charts
src/ui/inspector.js        tapped-creature panel
src/ui/godmode.js          tool palette + tap handling
src/ui/runs.js             save/resume/run list, checkpoint gallery
src/main.js                wiring + fixed-timestep loop
test/*.test.js             node unit tests
test-e2e/run.js            Playwright smoke tests (static server + checks)
```

---

### Task 1: Scaffold, RNG, test harness

**Files:**
- Create: `package.json`, `.gitignore`, `src/sim/rng.js`, `test/rng.test.js`, `vendor/three.module.min.js`, `vendor/OrbitControls.js`

**Interfaces:**
- Produces: `createRng(seed: number) -> { next(): number /*[0,1)*/, range(a,b): number, int(a,b): number /*inclusive*/, gauss(): number /*mean 0, sd 1*/, state(): number, setState(s: number) }`

- [ ] **Step 1:** Download Three.js r170 `build/three.module.min.js` and `examples/jsm/controls/OrbitControls.js` from `https://cdn.jsdelivr.net/npm/three@0.170.0/` into `vendor/`. In OrbitControls.js, rewrite `from 'three'` to `from './three.module.min.js'`.
- [ ] **Step 2: Write failing tests** in `test/rng.test.js`:
  - `same seed same sequence`: two `createRng(42)` produce identical first 100 `next()` values.
  - `range bounds`: 1000 `range(2,5)` values all `>=2 && <5`; `int(1,3)` hits all of 1, 2 and 3 and nothing else.
  - `gauss stats`: the mean of 10000 values is within ±0.05 of 0, and the sd is within ±0.05 of 1.
  - `state roundtrip`: after `setState(s)`, where `s` was captured earlier, the sequence repeats.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (module not found).
- [ ] **Step 4:** Implement it with mulberry32 and a Box–Muller `gauss`.
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6:** Commit with the message `feat: scaffold, vendored three, seeded rng`.

### Task 2: Genome and body cost/benefit

**Files:**
- Create: `src/sim/genome.js`, `src/sim/body.js`, `test/genome.test.js`, `test/body.test.js`

**Interfaces:**
- Consumes: `createRng`
- Produces:
  - `GENES`: an array of `{ key, min, max, int?: boolean }`. Keys: `size [0.5,2]`, `legs int [0,8]`, `digits int [0,5]` (per limb), `eyes int [0,6]`, `eyeSize [0.2,1.5]`, `antennae int [0,4]`, `mouth [0.2,1.5]`, `diet [0,1]` (0 = herbivore, 1 = carnivore), `hue [0,1]`, `insulation [0,1]`, `reproThreshold [0.5,0.95]`.
  - `randomGenome(rng) -> { body: {…GENES keys}, brain: Float32Array(BRAIN_WEIGHT_COUNT) }`
  - `mutate(genome, rate: number, rng) -> genome` (new object; each gene changes with probability `rate` by `gauss() * 0.1 * (max-min)`; int genes ±1; clamp; brain weights get `gauss()*0.3` with probability `rate`)
  - `cloneGenome(g)`, `genomeDistance(a, b) -> number` (normalized body-gene L1 + 0.1 × mean abs brain-weight difference)
  - `deriveStats(body) -> { speed, turnRate, senseRange, fov, attack, defense, biteSize, digestPlant, digestMeat, coldResist, heatResist, upkeep, maxEnergy }`
- Starting cost/benefit formulas (tunable; the tests check direction, not exact values):
  - `speed = 1 + 0.35*legs*(1 + 0.1*digits) / size^0.5`; `turnRate` rises with digits
  - `senseRange = 3 + eyes*eyeSize*2.5 + antennae*1.5`; `fov = min(2π, 0.6 + eyes*0.7)` radians
  - `attack = mouth*size*diet`; `defense = size*(1 + 0.05*legs)`; `biteSize = mouth*size`
  - `digestPlant = 1 - diet`; `digestMeat = diet`
  - `coldResist = insulation + 0.3*size`; `heatResist = 1 - insulation`
  - `upkeep = 0.02*size^2 + 0.004*legs*(1+0.2*digits) + 0.003*eyes*eyeSize + 0.002*antennae + 0.002*mouth + 0.002*insulation` per second
  - `maxEnergy = 10*size^2`
- [ ] **Step 1: Write failing tests:**
  - `random genome in range`: across 200 random genomes, every gene is within [min, max], int genes are integers, and `brain.length === BRAIN_WEIGHT_COUNT`.
  - `mutate rate 0 is identity`, and `mutate does not alter input`.
  - `distance zero to self, positive to mutant (rate 1)`.
  - `every part has a cost`: for each of `legs, eyes, antennae, mouth, insulation`, increasing it raises `upkeep`.
  - `every part has a benefit`: legs↑ → speed↑; eyes↑ → senseRange↑ and fov↑; antennae↑ → senseRange↑; mouth↑ → biteSize↑; insulation↑ → coldResist↑; diet↑ → digestMeat↑ and digestPlant↓.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. `BRAIN_WEIGHT_COUNT` is imported from `brain.js`, so create it now with only the sizes (see Task 3).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: genome and body cost/benefit`.

### Task 3: Brain

**Files:**
- Create/Modify: `src/sim/brain.js`, `test/brain.test.js`

**Interfaces:**
- Produces:
  - `INPUTS` (12, in order): `foodDist, foodAngle, preyDist, preyAngle, threatDist, threatAngle, mateDist, mateAngle, energy, temperature, hazardDist, bias`. Distances are normalized to [0,1] by senseRange (1 means none in range), and angles are given relative to heading as [-1,1].
  - `OUTPUTS` (4): `turn [-1,1]`, `throttle [0,1]`, `attack [0,1]`, `reproduce [0,1]`
  - `HIDDEN = 8`; `BRAIN_WEIGHT_COUNT = (12+1)*8 + (8+1)*4` (= 140)
  - `think(weights: Float32Array, inputs: Float32Array, out: Float32Array) -> out` (tanh hidden; `turn` uses tanh, and the other outputs use a sigmoid). It must not allocate per call.
- [ ] **Step 1: Write failing tests:** `zero weights give neutral output` (turn 0, the others 0.5); `deterministic`; `outputs in range` for 100 random weights and inputs; `no allocation` (calls with the same `out` return the same object).
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: mlp brain`.

### Task 4: World core (food, senses, movement, energy, reproduction)

**Files:**
- Create: `src/sim/grid.js`, `src/sim/world.js`, `test/world.test.js`

**Interfaces:**
- Consumes: rng, genome, body, brain
- Produces:
  - `DEFAULT_SETTINGS = { seed: 1, worldSize: 100, initialCreatures: 60, maxCreatures: 400, foodRate: 4 /*per s*/, maxFood: 300, foodEnergy: 3, mutationRate: 0.08, dt: 1/20 }`
  - `class World { constructor(settings); creatures: Creature[]; food: {id,x,z,energy}[]; time: number; nextId: number; rng; step(); reseed(); events: {type,time,...}[] /*drained by the consumer*/ }`
  - `Creature = { id, parentId, generation, genome, stats, x, z, heading, energy, age, alive, lastOutputs: Float32Array(4), actionCounters: {moved, ate, attacked, fled, idle} }`
  - `Grid`: `new Grid(cellSize, worldSize)`, `clear()`, `insert(obj)`, `query(x, z, r, cb)`
- Rules: the world is a square torus of side `worldSize`. Each step: spawn food (Poisson at `foodRate`), rebuild the grid, then for each creature compute inputs (only within senseRange and fov), call `think`, and apply turn and throttle (`v = throttle*speed`). The energy cost per step is `(upkeep + 0.01*throttle*speed*size) * dt`. A creature eats food within `0.5*size` if `digestPlant > 0.1`, gaining `foodEnergy*digestPlant`, capped at maxEnergy. If `reproduce > 0.5` and `energy > reproThreshold*maxEnergy` and creatures < maxCreatures, it spawns a mutated child nearby, and the parent's energy is split 50/50. A creature dies at energy ≤ 0 or age > `60*size` s. Push `birth` and `death` events.
- [ ] **Step 1: Write failing tests:**
  - `deterministic`: two Worlds with seed 7, after 500 steps, have equal creature count and equal summed x.
  - `energy conserving direction`: a single creature with zero brain weights and no food loses energy each step.
  - `eats food`: a creature placed on a food item with digestPlant 1 gains energy and the food is removed.
  - `reproduces`: a creature with full energy and a brain forced to give reproduce=1 spawns a child with `parentId` set and `generation+1`.
  - `respects maxCreatures`: with `maxCreatures: 10` and forced reproduction, the count never exceeds 10.
  - `extinction is stable`: after removing all creatures, 200 steps throw nothing, `food.length <= maxFood`, and `time` advances.
  - `senses respect fov`: food behind a creature with fov 0.6 reads as `foodDist === 1`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Use `Grid` for all neighbour queries, with cell size 8.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Also check that 400 creatures step in under 4 ms on average in Node (log it, but don't assert on it).
- [ ] **Step 5:** Commit with the message `feat: world simulation core`.

### Task 5: Predation and gene-pool predators

**Files:**
- Modify: `src/sim/world.js`; Test: `test/predation.test.js`

**Interfaces:**
- Produces: `world.seedPredators(n: number)`: adds n creatures cloned from random existing ones (random genomes if extinct) with `diet = 0.9` and `mouth = 1.2`.
- Rules: the `prey*` inputs are the nearest creature with a lower `attack` score, and the `threat*` inputs are the nearest creature whose `attack` exceeds this creature's `defense`. If `attack > 0.5` and a target is within `0.6*size`, deal `attack*dt*5` damage to the target's energy. When the target dies, the attacker gains `0.6 * target.maxEnergy * digestMeat`. Push a `kill` event `{killerId, victimId}`. Increment `actionCounters.attacked` and the victim's `fled` (fled counts steps where a threat is in range and the creature is moving away).
- [ ] **Step 1: Write failing tests:** `carnivore kills weaker prey` (forced attack output; the victim dies within 100 steps and the killer gains energy); `herbivore gains little from kill` (digestMeat≈0); `seedPredators works when extinct`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: predation`.

### Task 6: Environmental threats

**Files:**
- Create: `src/sim/environment.js`; Modify: `src/sim/world.js`; Test: `test/environment.test.js`

**Interfaces:**
- Produces:
  - `DEFAULT_ENV = { seasons: true, seasonLength: 120 /*s*/, foodSeasonAmp: 0.7, temperature: true, tempAmp: 1, hazards: true, hazardCount: 3, hazardDamage: 2 /*energy/s*/ }`. These are merged into `settings.env`.
  - `class Environment { constructor(env, rng, worldSize); hazards: {id,x,z,r}[]; temperature(time, x, z) -> [-1,1]; foodMultiplier(time) -> [0, 2]; update(time) }`
  - World: `addHazard(x, z, r) -> id`, `removeHazard(id)`
- Rules: with seasons on, `foodMultiplier = 1 + foodSeasonAmp*sin(2πt/seasonLength)`. Temperature is the season sine × tempAmp plus a gradient along z (the north edge is cold). A creature pays extra upkeep of `max(0, -temp - coldResist) + max(0, temp - heatResist)` per s, and `hazardDamage` per s inside a hazard. Every toggle off means zero effect.
- [ ] **Step 1: Write failing tests:** `toggles off means no effect` (identical energy trajectory against env all-off); `cold hurts uninsulated more`; `hazard drains energy inside only`; `food varies by season`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: environmental threats`.

### Task 7: Behaviour labels, species, checkpoints, stats

**Files:**
- Create: `src/sim/behavior.js`, `src/sim/species.js`, `src/sim/stats.js`; Tests: `test/behavior.test.js`, `test/species.test.js`, `test/stats.test.js`

**Interfaces:**
- Produces:
  - `labelOf(counters) -> 'hunter'|'forager'|'fleer'|'wanderer'|'idler'` (thresholds over counter ratios, evaluated over a rolling 20 s window reset by World)
  - `class SpeciesTracker { constructor({threshold=0.25}); update(creatures, time) -> Checkpoint[] /*new ones*/; species: {id, repGenome, count, avgBody, dominantLabel, firstSeen}[] }`. Clustering is greedy: each creature joins the first species whose rep is within `threshold` `genomeDistance`, or else founds a new one. It runs every 5 s of sim time.
  - `Checkpoint = { id, time, speciesId, kind: 'new-species'|'body-shift'|'behavior-shift'|'first', title: string, genome, avgBody }`. It fires on: a new species reaching ≥10 members; an integer gene's average in a species crossing a whole number (for example, mean legs going 3 → 4); `diet` crossing 0.5; a change in a species' dominant label; and global firsts ("first carnivores", "first N-legged lineage"). Titles are human readable, for example `"Species 4: legs 4 → 6"`.
  - `class StatsRecorder { constructor({interval=2}); sample(world, tracker); series: {t, pop, herb, carn, avg:{size,legs,eyes,speed,diet,…}, labels:{hunter:n,…}}[] }`. It downsamples by dropping every other point once the series exceeds 2000 points.
- [ ] **Step 1: Write failing tests:** labels for crafted counters; `clustering splits distinct genomes` (two genome families → 2 species); `body-shift checkpoint fires once` (a population whose legs go 3→4 fires exactly one checkpoint, and it does not re-fire while it stays at 4); `first carnivores fires`; `stats downsample keeps ≤2000`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. World owns `tracker` and `stats`, calls them on their intervals, and pushes `checkpoint` events.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: behaviour labels, species, checkpoints, stats`.

### Task 8: Serialization

**Files:**
- Create: `src/sim/serialize.js`; Test: `test/serialize.test.js`

**Interfaces:**
- Produces: `SCHEMA_VERSION = 1`; `serializeWorld(world) -> object` (JSON-safe: settings, time, rng state, creatures with genomes (brain as plain arrays), food, hazards, tracker, stats, checkpoints); `deserializeWorld(obj) -> World`, which throws `Error('schema')` if `obj.schemaVersion !== SCHEMA_VERSION`.
- [ ] **Step 1: Write failing tests:** `roundtrip continues identically` (run 200 steps, serialize, then step 200 more on both the original and the restored copy → same count and same summed x); `JSON.stringify works`; `rejects unknown schemaVersion`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: world serialization`.

### Task 9: IndexedDB storage + e2e harness

**Files:**
- Create: `src/storage.js`, `test-e2e/run.js`, `test-e2e/storage.html`

**Interfaces:**
- Produces (all async, never throw; each returns `{ok:true, value}` or `{ok:false, error}`):
  - `saveRun(id: string, name: string, data: object)` (data is serialized World; it also stores `{id, name, updatedAt, time, pop}` in the `runs` meta store)
  - `loadRun(id)`, `listRuns()`, `deleteRun(id)`
  - `saveSettings(obj)`, `loadSettings()`
  - DB `natsel`, version 1, stores `runs` (meta), `runData`, `settings`. Checkpoints live inside the run data.
- `test-e2e/run.js`: starts a `node:http` static server on a free port at the repo root, launches Chromium with Playwright, runs each named check, and prints PASS/FAIL. It exits non-zero on failure. Each check opens a page and evaluates assertions.
- [ ] **Step 1: Write failing e2e checks:** `storage roundtrip` (save → list contains it → load equals → delete → list empty); `save failure is non-fatal` (monkeypatch `indexedDB.open` to throw → `saveRun` returns `{ok:false}` and nothing throws); `rejects unknown schemaVersion` (store `{schemaVersion: 99}` → loading via `deserializeWorld` in the page yields a schema error and the record still exists).
- [ ] **Step 2:** Run `npm run e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run e2e`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: indexeddb storage and e2e harness`.

### Task 10: 3D rendering + main loop

**Files:**
- Create: `index.html`, `style.css`, `src/render/scene.js`, `src/render/creatures.js`, `src/main.js`; Modify: `test-e2e/run.js`

**Interfaces:**
- Consumes: `World`, `DEFAULT_SETTINGS`
- Produces:
  - `createScene(canvas) -> { renderer, scene, camera, controls, setWorld(world), render(world, alpha) , pick(clientX, clientY) -> {type:'creature', id}|{type:'ground', x, z}|null }`
  - `createCreatureRenderer(scene, maxCreatures) -> { update(creatures) }`. There is one `InstancedMesh` per part type (body icosahedron detail 0, leg cylinder 5 segments, digit small cone, eye sphere detail 0, antenna thin cylinder, mouth cone). Each creature's parts are placed procedurally: legs spaced evenly around the body, digits at the leg tips, eyes on the front hemisphere, antennae on top. The body colour comes from `hue`, with diet tinting it red. A creature's body bobs while it moves.
  - `stepsFor(frameDtSec, speed, simDt) -> number`: fixed-timestep accumulator, capped at `8*speed` steps per frame. Export it from `src/main.js` for testing.
- Terrain: a low-poly plane (`worldSize`, 64×64 segments, gentle noise heights for looks only; the sim stays 2D), with flat-shaded material. Food is an instanced green tetrahedron. Hazards are translucent red discs. Tint the light and fog colour by temperature.
- Main loop: `requestAnimationFrame` → `stepsFor` → `world.step()` × n → render. Auto-save: every 60 s real time and on `visibilitychange` hidden → `saveRun(currentRunId, ...)`.
- [ ] **Step 1: Write failing tests:** a node unit test in `test/loop.test.js`: `clamps catch-up steps` (`stepsFor(30, 1, 0.05) <= 8`, `stepsFor(0.05, 1, 0.05) === 1`). An e2e check `app boots` (it loads `/`, the canvas exists, there are no console errors within 3 s, and `window.__world.creatures.length > 0`).
- [ ] **Step 2:** Run `npm test && npm run e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement. Expose `window.__world` for tests.
- [ ] **Step 4:** Run both. Expected: PASS. Also take a screenshot to the scratchpad and inspect it visually.
- [ ] **Step 5:** Commit with the message `feat: 3d rendering and main loop`.

### Task 11: Controls, settings, charts

**Files:**
- Create: `src/ui/controls.js`, `src/ui/charts.js`; Modify: `index.html`, `src/main.js`, `test-e2e/run.js`

**Interfaces:**
- Produces:
  - `mountControls(root, { onPlayPause, onStep, onSpeed(n), onSettings(settings), onReseed() })`: top bar with play/pause, step, speed buttons `0.5× 1× 2× 4× 8×`, and buttons that open the settings sheet. The settings sheet has sliders for every `DEFAULT_SETTINGS` and `DEFAULT_ENV` numeric field and toggles for the env booleans. Changed settings apply on Reseed, except foodRate, mutationRate and env, which apply live. Settings persist through `saveSettings`.
  - `drawLineChart(canvas, series, keys: {key, label, color}[])`: plain 2D canvas, DPR-aware, with an auto y-range.
  - A chart panel with tabs: Population (pop/herb/carn), Traits (avg legs/eyes/size/speed/diet), Behaviour (label counts). It redraws once per second.
  - An "Extinct" banner with a Reseed button, shown when `creatures.length === 0`.
  - All tap targets are at least 44 px.
- [ ] **Step 1: Write failing e2e checks:** `speed buttons change speed` (tap 4× → `window.__speed === 4`); `settings live-apply` (set foodRate slider → `__world.settings.foodRate` updated); `extinct banner` (clear creatures in page → banner visible → tap Reseed → creatures > 0).
- [ ] **Step 2:** Run `npm run e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run e2e`. Expected: PASS. Take a screenshot at iPad size (1024×1366, `deviceScaleFactor: 1`) and check the layout.
- [ ] **Step 5:** Commit with the message `feat: controls, settings, charts`.

### Task 12: Inspector + god-mode tools

**Files:**
- Create: `src/ui/inspector.js`, `src/ui/godmode.js`, `src/render/preview.js`; Modify: `src/sim/world.js`, `src/main.js`, `test/world.test.js`, `test-e2e/run.js`

**Interfaces:**
- Produces:
  - World god-mode API: `addFood(x, z, n=10)`, `killCreature(id)`, `cloneCreature(id) -> newId`, `mutateCreature(id, rate=0.5)` (re-derives stats), `seedPredators(n)` (Task 5), `addHazard` and `removeHazard` (Task 6). Each pushes a `god` event.
  - `createPreview(canvas) -> { show(genome), dispose() }`: a small auto-rotating 3D view of one creature, reusing `creatures.js`'s part-placement function, exported as `placeParts(body) -> {type, position, rotation, scale}[]`.
  - `mountInspector(root, getWorld)`: tapping a creature (with the Inspect tool, the default) opens a panel with the preview, body genes, derived stats, energy bar, age, behaviour label, lineage (generation, parent id with a tap to jump to it if it is alive, species and its founding time), a brain view (a 12-8-4 node diagram with edges coloured by weight sign and thickness by magnitude, drawn on canvas), and a "follow" camera toggle.
  - `mountGodMode(root, scene, world)`: a tool palette with Inspect, Food, Hazard, Remove hazard, Kill, Clone, Mutate, and Seed predators (×5). A tap on the ground or a creature applies the selected tool through `scene.pick`. One-finger drag still orbits, and a tap is a touch under 10 px of movement and under 250 ms.
- [ ] **Step 1: Write failing tests:** unit tests `clone copies genome with new id`, `mutate changes genome and stats`, `kill removes`. An e2e check `tap inspects creature` (project a creature's position to the screen → tap → inspector visible with that id); `food tool adds food`.
- [ ] **Step 2:** Run `npm test && npm run e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: inspector and god-mode tools`.

### Task 13: Runs and checkpoint gallery

**Files:**
- Create: `src/ui/runs.js`; Modify: `src/main.js`, `index.html`, `test-e2e/run.js`

**Interfaces:**
- Produces: `mountRuns(root, { getWorld, setWorld(world), currentRunId })`:
  - Runs sheet: list (name, updated, sim time, pop), New run, Rename, Save now, Resume, Delete (with confirm). On boot, resume the most recent run if one exists, or start a new one otherwise.
  - Checkpoints timeline: a vertical list of `Checkpoint`s (time, title, kind icon). Tapping one opens the preview of its genome plus its avgBody table. A small toast appears when a new checkpoint fires during play.
  - Export: a "Download JSON" button for the current run (Blob + `<a download>`), which carries settings, stats and checkpoints.
  - Storage failure: a single non-blocking warning banner, "Saving unavailable – progress won't persist".
- [ ] **Step 1: Write failing e2e checks:** `resume after reload` (run, Save now, reload → same run id and `__world.time` ≥ saved time); `checkpoint list shows entries` (inject a checkpoint event → listed → tap → preview canvas visible); `storage warning shown` (with indexedDB broken → banner visible, sim still running).
- [ ] **Step 2:** Run `npm run e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run e2e`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: runs and checkpoint gallery`.

### Task 14: PWA, performance pass, deploy

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icons/*`, `.github/workflows/pages.yml`, `README.md`; Modify: `index.html`, `test-e2e/run.js`

**Interfaces:**
- `sw.js`: precache every app file (a list kept in sw.js; bump `CACHE = 'natsel-v1'` on change) and serve cache-first. Manifest: `display: standalone`, `orientation: any`, and theme colours. index.html gets `apple-mobile-web-app-capable`, an apple-touch-icon, and `viewport-fit=cover` with safe-area padding.
- Pages workflow: deploy the repo root on push to `main`. The user must enable Pages (Source: GitHub Actions) in the repo settings, and the README says so.
- [ ] **Step 1: Write failing e2e checks:** `works offline` (load → wait for the SW to be ready → `context.setOffline(true)` → reload → canvas present and creatures > 0); `perf 300 creatures` (set initialCreatures 300, run 10 s, measure the average frame time via `performance.now()` in the rAF loop, and log it. Assert under 33 ms in Chromium as a coarse sanity floor; the real check is on the iPad).
- [ ] **Step 2:** Run `npm run e2e`. Expected: FAIL.
- [ ] **Step 3:** Implement. If perf fails, profile first. Likely fixes: reuse input buffers, skip brain ticks to every second step for distant creatures, and lower the terrain segments.
- [ ] **Step 4:** Run `npm test && npm run e2e`. Expected: all PASS.
- [ ] **Step 5:** Commit with the message `feat: pwa, perf, pages deploy` and push.
- [ ] **Step 6:** Ask the user to open the Pages URL on their iPad, add it to the Home Screen, and report fps (show an fps counter in the controls bar) and anything that feels off.
