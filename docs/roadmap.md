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
   No physics simulation.
4. **Tool use.** World objects that dexterous creatures can handle (dexterity → tools).
5. **Proto-language.** A framework for evolved communication, building on the signals from project 2.
