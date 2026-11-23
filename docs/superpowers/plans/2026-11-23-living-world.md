# Living World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat world with a seeded 200×200 terrain made of six biomes (plains, forest, wetland, lake, mountain, desert). Each biome has its own benefits and hazards, and terrain-dependent movement and new senses drive specialization.

**Architecture:**
- A new pure module, `src/sim/terrain.js`, builds periodic noise maps (height, moisture, temperature) and classifies biomes on a 2-unit grid.
- `src/sim/biomes.js` holds the per-biome rule table.
- `World` reads both for movement, energy, food spawning and senses.
- The renderer builds its mesh, water and props from the same maps. Maps are regenerated from the seed and never serialized.

**Tech Stack:** Same as v1: plain ES modules, vendored Three r170, `node --test`, and Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-23-living-world-design.md`

## Global Constraints
- Performance target: a few hundred creatures at 30fps or more on an older iPad Pro. The browser sim step for 300 creatures must stay under 8 ms (existing e2e check).
- The sim stays deterministic per seed and settings, and the serialize roundtrip must continue identically.
- The world wraps (torus). Every map lookup wraps.
- Every biome must change what wins, and none may be strictly best.
- Abilities have costs: swim, climb and camouflage each add upkeep or trade off another stat.
- `SCHEMA_VERSION` becomes 2. v1 saves are rejected with the existing message and not deleted.

## Review Focus
1. **Spawning or respawning in water or on cliffs:** founders and respawns must not land somewhere they instantly drown or get stuck. Spawn points are restricted to non-lake cells. Test: Task 3 `spawns avoid lakes`.
2. **World size changed in settings:** the maps, grid and renderer must rebuild for 60–300 sizes with no out-of-range lookups. Test: Task 1 `lookups valid for any world size`.
3. **A seed with no lake or no desert:** the classification must still produce at least 4 biomes, and the UI and graphs must handle biomes with 0 creatures. Test: Task 1 `biome variety across seeds`.
4. **A creature stuck against a steep slope:** it must not oscillate into NaN or move through cliffs at full speed. Test: Task 3 `steep slope blocks non-climbers`.
5. **Resuming a v2 save:** the maps regenerate identically from the seed, so the restored world continues identically. Test: Task 3 `roundtrip with terrain`.

---

## File Structure
```
src/sim/noise.js        periodic value noise (seeded)
src/sim/terrain.js      createTerrain(settings) -> maps + lookups + biome classification
src/sim/biomes.js       BIOMES table + ids
src/sim/body.js         + swim, climb, camo abilities (modify)
src/sim/brain.js        INPUTS grows 12 -> 18 (modify)
src/sim/world.js        terrain-aware movement, temperature, hazards, food, senses (modify)
src/sim/environment.js  temperature now from terrain (modify)
src/sim/stats.js        per-biome population (modify)
src/sim/species.js      home biome + 'colonized' checkpoint (modify)
src/sim/serialize.js    schema 2 (modify)
src/render/terrain.js   DELETE (replaced by sim terrain lookups)
src/render/scene.js     mesh from maps, water plane, props (modify)
src/render/props.js     instanced trees/rocks/cacti
src/ui/charts.js        Biomes tab (modify); src/ui/inspector.js biome + abilities (modify)
src/ui/controls.js      worldSize up to 300, waterLevel slider (modify)
```

### Task 1: Noise and terrain maps
**Files:** create `src/sim/noise.js`, `src/sim/terrain.js`, `src/sim/biomes.js`, `test/terrain.test.js`

**Interfaces (produces):**
- `periodicNoise(rng, period: int, octaves: int) -> (u, v) => number in [0,1]`. `u` and `v` are in lattice units, and the noise tiles every `period`.
- `BIOMES`: an ordered array of `{ id: 0..5, key: 'plains'|'forest'|'wetland'|'lake'|'mountain'|'desert', color: hex, fertility, moveMul, sightMul, tempOffset, drain }`.
  - Drain is energy/s applied to creatures without the matching ability.
  - The `BIOME` map goes from key to id.
- `createTerrain(settings) -> Terrain`, where `settings` includes `seed, worldSize, waterLevel (default 0.32)`:
  - Uses its own RNG, `createRng(seed ^ 0x9e3779b9)`, so the world RNG sequence is unchanged by terrain.
  - `Terrain = { res: 2, n, W, height: Float32Array, moisture, temp, biome: Uint8Array, heightAt(x,z) /*bilinear, world units, 0..12*/, biomeAt(x,z), slopeAlong(x,z,heading) /*rise per unit ahead*/, isWater(x,z), tempAt(x,z) /*[-1,1]*/ }`.
  - Height = `noise^1.4 * 12`.
  - Classification order: lake if height < waterLevel×12; mountain if height > 0.68×12; wetland if moisture > 0.62 and height < (waterLevel+0.12)×12; desert if moisture < 0.32 and temp > 0.1; forest if moisture > 0.52; plains otherwise.
  - `temp` is the noise temperature plus a latitude term `0.6*cos(2πz/W)`, then minus `0.08*height`.
- [ ] **Step 1: Failing tests:**
  - `noise tiles`: `f(0,v) === f(period,v)` and the value stays in [0,1].
  - `deterministic`: the same seed gives equal maps.
  - `lookups valid for any world size`: sizes 60, 100, 200 and 300; random and edge coords (`-0.001`, `W`, `W+5`) give finite values and biome ids in 0..5.
  - `heightAt continuous across the wrap`: `|heightAt(W-0.01, z) - heightAt(0.01, z)| < 0.5`.
  - `biome variety across seeds`: seeds 1..8 each have at least 4 distinct biomes with ≥2% of cells, and the union over seeds covers all 6.
  - `lake cells are below water level`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Biome table starting values:
  - plains: fert 1, move 1, sight 1.2, temp 0, drain 0
  - forest: fert 1.6, move 0.8, sight 0.55, temp 0, drain 0
  - wetland: fert 2, move 0.6, sight 0.9, temp 0, drain 0.03 (disease)
  - lake: fert 0.6, move 0.35, sight 1, temp 0, drain 0.25 (drowning)
  - mountain: fert 0.4, move 0.7, sight 1.4, temp −0.35, drain 0
  - desert: fert 0.25, move 0.9, sight 1.3, temp +0.4, drain 0
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Log each seed's biome fractions.
- [ ] **Step 5:** Commit with the message `feat: seeded terrain maps and biomes`.

### Task 2: Swim, climb and camouflage abilities
**Files:** modify `src/sim/body.js`, `test/body.test.js`

**Interfaces (produces):** `deriveStats(body)` adds:
- `swim = min(1, 0.15*digits + 0.25*size - 0.05*legs + 0.2)`, clamped to [0,1]
- `climb = min(1, 0.05*legs*(1+0.3*digits))`
- `camo = clamp(1.2 - size, 0, 1)` (used only in forest)

Upkeep gains `0.003*swim + 0.003*climb`.
- [ ] **Step 1: Failing tests:** `digits raise swim and climb`; `swim and climb cost upkeep`; `small creatures camouflage better`; abilities are in [0,1] across 200 random genomes.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit with the message `feat: swim, climb, camo abilities`.

### Task 3: Terrain-aware world
**Files:** modify `src/sim/world.js`, `src/sim/environment.js`, `src/sim/brain.js`, `src/sim/serialize.js`, `test/helpers.js`; create `test/terrain-world.test.js`; update existing tests whose input indices or `BRAIN_WEIGHT_COUNT` (140 → 188) change.

**Interfaces:**
- `DEFAULT_SETTINGS` changes: `worldSize: 200`, `waterLevel: 0.32`, `maxFood: 500`, `foodRate: 8`, `initialCreatures: 80`. `world.terrain` is created in `reseed()`.
- `INPUTS` appends (in order): `biomePlainsness`. Rather than one-hot, it uses 3 inputs: `biomeFood` (fertility/2), `biomeDanger` (drain for this creature, scaled to 0..1), and `cover` (1 − sightMul, clamped ≥ 0). Then `slopeAhead` (clamped [-1,1]), `waterAhead` (0/1, 2 units ahead), and `tempGradient` (tempAt ahead minus tempAt here, ×5, clamped). That is 18 inputs, so `BRAIN_WEIGHT_COUNT = 19*8 + 9*4 = 188`.
- **Movement:**
  - `v *= biome.moveMul`, but in a lake `v *= 0.25 + 0.75*swim` instead.
  - slope `s = slopeAlong`: if `s > 0.6` and `climb < s - 0.4`, then `v = 0` (blocked). Otherwise `v *= 1 / (1 + max(0, s) * 2)`, and `v *= 1 + min(0.3, max(0, -s))` downhill.
- **Energy:** extra drain per second:
  - lake: `drain * (1 - swim)`
  - wetland: `drain`
  - otherwise: the biome's `drain`

  Temperature comes from `terrain.tempAt + season*0.4*tempAmp + biome.tempOffset`, clamped [-1,1]. It replaces `Environment.temperature`, which now delegates to terrain.
- **Senses:**
  - `senseRange` is multiplied by the observer's biome `sightMul`.
  - In forest, a target's effective distance is divided by `1 - 0.6*target.camo`. Prey/threat/mate filters treat that target as farther away.
- **Food:** spawn locations are picked by rejection sampling, accepting with probability `fertility/2`. Each food item gets `type: 'fruit'` in forest, `'water'` in lake, and `'plant'` otherwise.
- **Spawning:** `spawn()` is unchanged when given explicit coordinates. `randomLandPoint()` is used for founders, respawns and seeded predators (up to 50 tries for a non-lake cell).
- **Serialize:** `SCHEMA_VERSION = 2`. The terrain is not saved and is rebuilt from settings.
- [ ] **Step 1: Failing tests** (`test/terrain-world.test.js`, using a fixed seed and placing creatures on cells found via `terrain.biomeAt`):
  - `lake slows non-swimmers and drains them`
  - `good swimmer crosses lake cheaper`
  - `steep slope blocks non-climbers` (finds the steepest cell, heading up it, `climb 0` → position unchanged after 5 steps; no NaN)
  - `forest shortens sight`
  - `camouflaged prey unseen at distance in forest`
  - `food spawns more in fertile biomes` (over 2000 spawns, forest share/forest cells > desert share/desert cells)
  - `spawns avoid lakes`
  - `temperature colder on mountains`
  - `roundtrip with terrain` (the existing serialize roundtrip test passes with the new defaults)
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. Update the old tests that hard-code input indices 9, 10 and 11 or weight count 140, and the `quiet` helper (add `waterLevel: -1` so tests that don't care about terrain get no lakes, plus a flat terrain option `flat: true`, which forces height 0 and biome plains for legacy tests).
- [ ] **Step 4:** `npm test`. Expected: all PASS.
- [ ] **Step 5:** Commit with the message `feat: terrain-aware movement, senses, food, temperature`.

### Task 4: Biome analysis
**Files:** modify `src/sim/stats.js`, `src/sim/species.js`, `src/ui/inspector.js`, `test/stats.test.js`, `test/species.test.js`

**Interfaces:**
- Each stats sample gains `biomes: { plains: n, ... }`.
- Each species gains `homeBiome` (the key with the most members) and `biomeCounts`.
- A checkpoint kind `'colonized'` fires once per species+biome when a species has ≥8 members in a biome that is not its home biome and that it had <2 members in at its last update. Title: `Species N colonized the <biome>`. It is a milestone, so it is kept by the cap. It uses the `fresh()` revert guard.
- The `SpeciesTracker.update` signature becomes `update(creatures, time, biomeOf: (c) => key)`. World passes `(c) => BIOMES[terrain.biomeAt(c.x, c.z)].key`.
- The inspector status line adds `in <biome>`, and the Abilities table adds swim, climb and camo.
- [ ] **Step 1: Failing tests:** `sample counts creatures per biome`; `homeBiome is majority`; `colonized fires once` (move 10 members' biome via the injected `biomeOf`).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit with the message `feat: biome stats, home biome, colonized checkpoints`.

### Task 5: Rendering the world
**Files:** create `src/render/props.js`; modify `src/render/scene.js`, `src/render/creatures.js` (height source), and `sw.js` (precache list); delete `src/render/terrain.js`; modify `test-e2e/checks.js`

**Interfaces:**
- `scene.setWorld(world)` builds:
  - a terrain mesh whose vertex Y comes from `terrain.heightAt` and whose vertex colours are biome colours shaded by height (mesh segments = `n`, capped at 128)
  - a water plane at `waterLevel*12`, translucent blue
  - props from `createProps(scene, terrain, rng)`: instanced trees (cone + trunk) in forest at about 1 per 6 units², rocks (dodecahedron) on mountain at 1 per 20, and cacti in desert at 1 per 30
  - Props use their own seeded RNG and a total cap of 3000 instances.
- Creature and food heights come from `world.terrain.heightAt`. In a lake, creatures sit at `max(height, waterLevel*12 - 0.3*size)`, so they float.
- [ ] **Step 1:** Update the e2e checks: `app boots` stays as is. Add `world renders biomes`: `__view.scene` contains a mesh named `water` and an InstancedMesh named `trees` with count > 0 for seed 1. The existing `tap inspects creature` and `perf 300` checks must still pass.
- [ ] **Step 2:** `npm run e2e`. Expected: the new check FAILs.
- [ ] **Step 3:** Implement. Add every new file to `sw.js` (the `sw.test.js` guard enforces this).
- [ ] **Step 4:** `npm test && npm run e2e`. Expected: PASS. Take screenshots (overview and close-up) to the scratchpad and look at them.
- [ ] **Step 5:** Commit with the message `feat: render terrain, water, props`.

### Task 6: UI and tuning pass
**Files:** modify `src/ui/charts.js`, `src/ui/controls.js`, `test-e2e/checks.js`; create `test/biome-viability.test.js`

**Interfaces:**
- Charts: a new `biomes` tab with series per biome, coloured from the categorical palette in fixed order (plains, forest, wetland, lake, mountain, desert). That makes 6 series: the first 5 dark steps plus slot 6 `#0ca30c`. Re-run the validator for 6 slots, and if it fails, use the next passing slot.
- Settings: `worldSize` slider range 60–300 (reseed). New `waterLevel` slider from 0 to 0.5 (reseed).
- Tuning: adjust the `BIOMES` numbers until the viability test passes.
- [ ] **Step 1: Failing tests:**
  - `biome-viability`: for seeds 1, 2 and 3, a 15-sim-minute headless run (respawnMin default) has at least 4 biomes holding ≥3% of the population at the end, averaged over the last 5 samples. Log the per-biome shares and mean traits by biome.
  - e2e `biomes tab draws` (same pattern as `charts draw`).
- [ ] **Step 2:** FAIL (no tab; viability may fail before tuning).
- [ ] **Step 3:** Implement the UI. Tune the table, and record each tuning change and its measured effect in the ledger.
- [ ] **Step 4:** `npm test && npm run e2e`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: biomes graph, world settings, biome tuning`, then push.
