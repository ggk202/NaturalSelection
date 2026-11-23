# Project 3a: Physical, Evolvable Bodies — Design

Decisions by the user (2026-11-24): bodies are **fully physical** (Rapier, brains drive joint motors); the genome is a
**branching body plan** with **bilateral symmetry by default**; 3a covers **segments with their own shape, joints, limbs,
grippers, coverings (fur, shell, spikes), sense organs placed on the body, and endurance**. Wings and fins come in 3b.
Endurance and dexterity are visible stats with a "dextrous" checkpoint. **Founders start from a few simple body plans
plus a rhythm sense** (option B). Target device: Mac M1 Max, 150–300 creatures. Choices marked *(Claude)* are mine.

## Intent
Bodies are currently a fixed template with gene-set numbers. 3a makes the **shape of the body itself evolve** (worms,
upright bipeds, many-legged crawlers, long-necked browsers) and makes bodies **physical**, so movement is discovered by
brains driving muscles. This is the base for tool use (project 4), which needs grippers and dexterity.

## Goals
1. **Body-plan genome (graph)**
   - **Nodes** are segment types: box dimensions (length, width, height); covering (none, fur, shell, spikes); colour hue;
     organs (eyes count and size, mouth size, antennae count); and gripper (bool).
   - **Edges** are attachments: target node, attach point on the parent (face and offset), orientation, joint (axis, angle
     limits, muscle strength), a recursion limit, and `symmetric` (mirrored pair, on by default).
   - **Expansion** turns the genome into a part list (parent, transform, joint) depth-first, capped at `maxParts` (setting, default 24).
   - **Mutations:** resize, add or remove an attachment, add a node, change the attach point, joint axis, limits or strength, toggle
     symmetry (rare), and change the covering, organs or gripper.
2. **Founder templates** (with random variation) *(Claude)*:
   - a worm (3–4 segment chain)
   - a quadruped (torso plus 2 mirrored leg pairs)
   - a biped hopper (torso plus 1 mirrored long-leg pair)

   Each founder gets a random brain.
3. **Rhythm sense:** 3 oscillator inputs (sine at 0.5, 1 and 2 Hz, each creature's phase offset by its id) *(Claude)*.
4. **Physics (Rapier, deterministic build):**
   - Each segment is a cuboid rigid body, joined to its parent by a revolute joint with a position motor.
     The brain outputs one target angle per joint, and the motor's strength comes from the joint gene.
   - **Terrain** is a heightfield collider built from the terrain map, with a wrapped margin. A creature whose root crosses
     the world edge is translated by ±W as a whole (torus).
   - **Water:** buoyancy plus drag on submerged segments. Drowning drain scales with (1 − swim), where swim is a body
     heuristic (flat limbs and low density) until fins arrive in 3b.
   - Physics runs at 60 Hz (3 substeps per 20 Hz sim step) *(Claude)*.
5. **Senses and actions on the body:**
   - Vision rays come from the head (the segment carrying the most eyes) along its facing direction.
   - Mouth contact eats food and bites creatures: within reach of the mouth segment.
   - **Proprioception inputs:** joint angles, contact of each limb tip, body orientation (up-vector y, pitch, roll),
     forward speed, and stamina.
   - **Outputs:** attack, reproduce, call, syllA, syllB, plus one motor target per joint. Turn and throttle are
     removed in physical mode.
6. **Derived stats from the body:**
   - mass (shell is heavier), with maxEnergy and upkeep scaling with mass
   - attack (mouth × head mass), defense (shell coverage), spikes (damage to whoever bites a spiked segment)
   - insulation (fur coverage), camouflage (size)
   - sense range (eyes on the head)
   - **endurance**: stamina pool from torso mass and recovery rate. Muscle effort drains stamina, and an exhausted creature has weak motors.
   - **dexterity**: grippers × the joint precision of the limbs that carry them
   - Every part costs upkeep.
7. **Kinematic mode** (setting `locomotion: 'kinematic'`) keeps today's turn/throttle movement, using abilities calculated
   from the same body genome. It is used by most unit tests and is the base for the later A/B choice.
   *(Claude)*
8. **Viewer:**
   - Segments drawn as instanced boxes per covering (fur fuzzy-tinted, shell darker and glossy, spikes as cones), plus organs.
   - The inspector shows the body (the preview now uses the expanded parts), endurance and dexterity.
   - Endurance and dexterity are added to the Traits graph.
   - A "dextrous" checkpoint fires when ≥50% of a species has a gripper.
9. **Saves:** the Rapier snapshot is stored with the save, so loading continues identically. Schema 6.

## Success criteria
- Physical runs are **deterministic**, and a save/load roundtrip continues identically.
- Founders of every template **move**: in a 30 s headless test with rhythm-driven random brains, the median
  displacement is greater than a body length.
- **Locomotion improves**: mean ground speed at minute 20 is greater than at minute 2 (seeds 1–2).
- **The population is viable**: the population stays above 3× respawnMin from minute 5 to 20 on the M1-class target
  (headless measurement).
- Performance: 200 creatures × ~10 parts with a sim step of ≤ 25 ms headless in Node *(Claude)*.

## Non-goals (3a)
- Wings, flight, fins and swimming thrust (3b).
- Real hands manipulating objects (project 4). The gripper exists and counts for dexterity, but nothing can be grabbed yet.
- Sexual reproduction.

## Anti-goals
- Scripted gaits. The templates and rhythm inputs are a starting point; brains choose everything.
- Losing determinism.
