# Roadmap

v1 (done): 3D sandbox, parameter bodies with cost/benefit, fixed MLP brains, gene-pool
predators, seasons/temperature/hazards, checkpoints, IndexedDB runs, offline PWA.

Next, in order. Each project is designed, then built, one at a time:

1. **Living world.** Larger seeded world, terrain that affects movement, biomes each with
   benefits and hazards (forest, plains, water/wetland, mountains, desert), terrain senses,
   and a god-mode terrain brush. The layout is static, with seasons. Slow climate shifts come later.
2. **Smarter brains.** Evolvable topology (NEAT-style), memory/recurrent state, lifetime
   learning (Hebbian, evolved learning rate: hiding spots, areas to avoid), an intelligence
   stat (brain capacity with energy cost), and cheap signal outputs/inputs as a seed for project 5.
   Goals: ambushes, pathfinding.
3. **Flexible bodies.** A segment/spine genome with attachments (legs, arms, wings, tails,
   shells, spikes, fur, eyes) and jointed limbs. Worms, upright bipeds and gliders are
   reachable. Abilities are calculated from the whole body (speed, turning, sight height,
   armour, cold resistance, flight, upkeep, endurance with a stamina pool, dexterity).
   **Revised (user, 2026-11-24):** creatures are **fully physical** (option A). Bodies are jointed rigid segments in
   Rapier (`@dimforge/rapier3d-deterministic-compat`, keeping runs deterministic), and brains drive joint motors, so
   locomotion is discovered, not designed. **Later:** a run-start choice between A (physical) and B (physical bodies, calculated
   movement). Target device: Mac M1 Max (64 GB), aiming for 150–300 physical creatures; the iPad is secondary.
   Decisions (user, 2026-11-24):
   - **Branching body-plan genome**, with bilateral **symmetry by default** (mutations may break it).
   - **3a:** segments with their own shape and size, joints, limbs, grippers (dexterity), coverings (fur, shell, spikes),
     sense organs placed on the body (eyes, mouth, antennae), and endurance as a stamina pool.
   - **3b (later):** wings/gliding and fins/swimming.
   - Endurance and dexterity are shown as stats in the inspector and on the Traits graph, plus a "dextrous" checkpoint.
4. **Tool use.** World objects that dexterous creatures can handle (dexterity → tools).
5. **Proto-language.** A framework for evolved communication, building on the signals from project 2.
   Decisions (user, 2026-11-24):
   - **Dynamic word sequences:** words are runs of syllables between pauses. Max word length is set by an
     evolvable **attention span** trait (1–6 syllables, with an energy cost). It limits both speaking and the listener's
     buffer of recently heard syllables.
   - **Describing locations, not pointing**, supporting **both** the current place ("food here, in the forest") and
     **remembered places** ("food in the forest to the north"). The current place comes first.
     - **Needs:** a compass sense for a shared reference frame; senses for a place's biome, direction, distance and landmarks;
       and a way for speakers to "think about" a remembered spot.
   - **Analytics** detect words that track biome, direction or distance (for example "mi-to ≈ forest, north").
