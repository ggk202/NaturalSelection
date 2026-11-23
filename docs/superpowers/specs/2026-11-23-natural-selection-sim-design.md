# Natural Selection Simulator — Design

## Intent
A 3D natural-selection sandbox that runs as a web app on an iPad. It is used for
**learning, experiments, and fun**. The headline feature is watching **bodies and
behaviour co-evolve**: creatures grow different low-poly bodies and evolve their own
neural-network brains, and nothing about their behaviour is scripted.

## Goals
- Bodies, built from genes, are made of low-poly parts: limbs, digits, eyes, antennae, mouth, size and colour.
  **Every part has a real cost and benefit** (decided by the user), for example: more legs give more speed
  but higher energy upkeep, and bigger or more eyes give a longer or wider sight range but cost more energy.
- Behaviour comes from a small neural-network brain (decided by the user: approach A). Senses feed the inputs
  and the outputs drive movement and actions. The brain's weights and the body genes mutate when a creature reproduces.
- Threats in v1 (decided by the user):
  - **Gene-pool predators:** a diet gene runs from herbivore to carnivore, so predators can evolve
    from the population. A "seed predators" button guarantees some appear for experiments.
  - **Simple environmental threats:** examples are seasons or food scarcity cycles, hazard zones, and temperature
    that favours certain body sizes. They are adjustable and can be switched on or off.
- Experiment controls: world settings such as food rate, mutation rate, world size and threat toggles; sim speed;
  pause and step; reset with a seed.
- **God-mode tools** (decided by the user): drop food, place or remove hazards, kill, clone, or mutate a chosen creature,
  and seed predators.
- Live graphs: population by diet, average values for key traits, and behaviour-label counts.
- Tap a creature to see its genes, its brain, its stats and its lineage.
- **Persistence** (browser storage, IndexedDB): settings, stats time-series, and **evolution
  checkpoints**. A checkpoint is recorded automatically when the dominant body plan or behaviour changes
  significantly, for example "first lineage with 6 legs" or "carnivory emerged" or "fleeing behaviour emerged".
  Each one stores a snapshot of a representative creature's genome so it can be viewed in 3D later.
  You can save runs, resume them and look back at them.
- Runs offline on iPad as an installable PWA, and is controlled by touch (orbit, zoom, tap).

## Non-goals (for now)
- A separate co-evolving threat species and evolving disease. Both are wanted later, so the code should
  leave room for more kinds of threat, but they are not built in v1.
- Accounts, cloud sync and multiplayer.
- Realistic physics or walking animation. Creatures glide or hop, and limbs are visual plus stat effects.

## Anti-goals
- Behaviour that is secretly scripted, which would defeat the point.
- Body parts that are purely cosmetic and so not under selection.
- Running too slowly on iPad to be enjoyable (below about 30fps with a few hundred creatures).
- Losing a long run because the tab was closed. Auto-save is required.

## Constraints
- Target device: an older iPad Pro (decided by the user). Performance goal: a few hundred creatures at 30fps or more.
- Runs on iPad Safari (WebGL2). There is no server, and it is hosted statically (GitHub Pages).
- Storage is browser-only, so stored data has to stay compact. Store genomes and stats, not full world frames.

## Approaches considered (behaviour)
- **A. Neural-network brains:** chosen. Behaviours can emerge that were never designed. Hard to read on its own,
  which is why the behaviour labels exist.
- B. Weighted fixed drives: easy to read, but behaviour is capped by the rules as written.
- C. A hybrid of the two: more complex, and mostly delays the decision.

Threat origin: we chose to have predators come from the gene pool and to add environmental threats. A separate
threat species comes later.

## Technical calls (made by Claude, can be changed)
- Three.js with plain ES modules and no build step. Imported from a pinned CDN version, with a local copy
  cached by the service worker so it works offline.
- The simulation runs at a fixed timestep, separate from rendering, so sim speed can be turned up.
  It may move to a Web Worker if performance needs it.
- Creatures are drawn with instanced meshes for each part type, which keeps hundreds of creatures fast.
- Brain: a fixed-topology MLP (multi-layer perceptron), for example about 12 inputs, 1 hidden layer of about 8 neurons and about 4 outputs,
  with Gaussian weight mutation. Topology evolution (NEAT) is a possible later upgrade.
- Reproduction: asexual, triggered by an energy threshold, with mutation. Sexual reproduction is a later option.
- "Species" are clusters of similar genomes, found by grouping on genome distance. A
  checkpoint fires when a cluster's average traits cross a threshold, or when a new behaviour label becomes
  dominant within a cluster.
- Behaviour labels (forager, wanderer, hunter, flee-er, etc.) are worked out from what creatures actually do over a
  time window, not read from the brain.

## Left to the builder
- The exact genes, their ranges, and the cost/benefit formulas, which need tuning.
- The exact set of brain inputs and outputs.
- Checkpoint thresholds, UI layout, visual style and the terrain look.
