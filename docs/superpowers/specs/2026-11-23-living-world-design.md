# Project 1: Living World — Design

## Intent
The v1 world is a flat torus with a temperature gradient, which gives evolution little to
specialize for. This project gives the world **terrain and biomes, each with its own benefits and
hazards**, so lineages specialize for a home biome and struggle elsewhere. It also lays the
groundwork for project 2 (ambushes, pathfinding, learned hiding spots). Success means specialist
species with distinct body plans in different biomes, plus generalists along the borders, visible in
the graphs and the timeline.

## Goals
- A seeded, larger world (default **200×200**, still a wrapping torus) with smooth height,
  moisture and temperature maps. Biomes form where they combine (**approach A**, chosen by the user):
  | Biome | Where | Benefit | Hazard / cost |
  |---|---|---|---|
  | Plains | mid height, mid moisture | steady food, long sight lines | exposed: predators see you far off |
  | Forest | moist, warm-ish | rich food (fruit), cover hides creatures | sight range reduced, slower movement |
  | Wetland | low and wet, around lakes | richest food | slow unless good swimmer; disease drains energy |
  | Lake (water) | below water level | safe from non-swimming hunters, water food | non-swimmers drown (energy drain) and move slowly |
  | Mountain | high | few competitors, overview (sight bonus) | cold, sparse food, steep slopes need climbing |
  | Desert | dry, hot | little competition | heat, very sparse food in rare patches |
- **Terrain affects movement:** uphill is slower and downhill slightly faster; steep slopes are
  near-impassable without climbing ability; water speed depends on swimming ability.
- **Temperature** is built from the temperature map, minus elevation (high = colder), plus the
  seasonal swing. The existing cold and heat costs then apply.
- **Food** spawns weighted by each biome's fertility, and the season scales it as now.
- **New abilities from the current genes** (an interim measure until project 3), each with a cost:
  - swimming: digits (webbing), size and few legs
  - climbing: legs × digits (grip)
  - camouflage: in forest, smaller creatures are harder to see
- **New senses** (brain inputs): biome here, terrain slope ahead, water ahead, cover density here,
  and the temperature gradient direction. Old saves become incompatible (schema v2): they show the
  existing "can't resume" message, and the save is kept.
- **Visuals:** a terrain mesh coloured by biome, a water surface, instanced low-poly trees in forest,
  rocks on mountains, and cacti or dunes in desert, all built from the same instancing approach as the creatures.
- **Analysis:**
  - population by biome (new graph tab)
  - each species' home biome (where most of its members are)
  - checkpoint "Species N colonized <biome>" when a species becomes established somewhere new
  - the inspector shows the current biome plus the swim and climb abilities
- The settings sheet gets world size, water level, and the biome climate sliders that already exist.

## Non-goals (for now)
- Climate shifts over time, and moving or changing biomes (later).
- Biome-mix controls and painting terrain by hand (approach C, later).
- Rivers (lakes only), caves, and physics.
- New body parts (project 3), and brain changes beyond the added inputs (project 2).

## Anti-goals
- Biomes that differ only in colour. Each must change what wins.
- One biome being strictly best, so every lineage converges on it.
- Dropping below the v1 performance target (a few hundred creatures at 30fps or more on the iPad).

## Approaches considered
- **A. Climate maps:** chosen by the user to save time. Gradual borders are good for speciation.
- B. Distinct patches: clear for experiments, but looks artificial and has few transition zones.
- C. A plus mix controls and a terrain brush: deferred.

## Technical calls (Claude's, can be changed)
- **Maps:**
  - Periodic value noise, so it tiles on the torus, sampled from the seeded RNG into Float32Array grids at a 2-unit resolution (100×100 cells by default).
  - Lookups are bilinear for height and nearest-cell for biome.
  - Maps are regenerated from the seed on load, never saved.
- **Biome rules:** a small table in `src/sim/biomes.js` holds each biome's fertility, movement multiplier, sight multiplier, temperature offset and hazard drain.
  Tuning means editing that table.
- **Wrap handling:** the current hazard discs stay (god-mode and the random toggle), and lakes replace
  nothing. The terrain renderer is rebuilt from the maps. `terrain.js`'s cosmetic height function is removed.
- **Brain inputs:** go from 12 to about 18. The fixed MLP stays until project 2.
- **Food:** gets a `type` field ('plant' | 'fruit' | 'water'), all eaten via `digestPlant` for now.
  This prepares for later diet diversity.

## Left to the builder
- Exact noise octaves and biome thresholds.
- The numbers in the biome table, tuned so each biome is viable for some body plan in headless runs.
- Tree, rock and cactus geometry and placement density, within the performance target.
