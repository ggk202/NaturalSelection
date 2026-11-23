# Project 2a: Perception and Memory — Design

Part of project 2 (smarter brains), which ships as 2a (perception and memory), 2b (learning and mental map) and
2c (intelligence cost, signals, viewer, analytics). The split was approved by the user, along with the language
groundwork for 2c: a vocal channel, a kin sense, overhearable calls and meaning detection.

## Intent
Today's brain is a fixed 18-8-4 network with no memory. It senses only the single nearest food, prey, threat and
mate. Ambushes, hiding and pathfinding cannot exist with it. 2a gives creatures **richer perception** (vision rays
that cover can block) and **brains that grow and remember** (evolvable structure, recurrent loops, neurons with
their own timescales). Evolution, not the software, decides which brain structure pays off: brains have an energy cost,
and lineages whose extra brain earns more than it costs spread.

## Goals
- **Vision rays.** Each creature casts `rays` rays spread evenly across its field of view. The ray count
  comes from the eyes gene (`1 + 2*eyes`, capped by the `maxRays` setting, default 9). Each ray reports three
  intensities, from 0 (nothing) to 1 (touching):
  - **food**
  - **creature**: signed, + for prey (its defense is below my attack), − for a threat (its attack is above my defense), and small + for a neutral creature
  - **obstacle**: water for non-swimmers, slopes too steep to climb, the world edge never (torus)
- **Cover blocks sight.** Each forest cell a ray crosses multiplies its visibility by 0.7. A ray stops when visibility
  drops below 0.25, so creatures can hide in, and ambush from, forest. Camouflage stacks with this.
- **Evolving brain structure (NEAT-style, asexual).**
  - **Genome:** a list of neurons (input, hidden, output; bias; time constant) and connections
    (from, to, weight, enabled), with recurrent connections allowed.
  - **Mutations:** weight jitter, add connection, add neuron (splits a connection; the new links start near-neutral),
    disable or enable a connection, remove a hidden neuron, and jitter of bias and time constant.
  - **Founders** start minimal: no hidden neurons and a few random input→output connections.
- **Memory.**
  - The network keeps its activations between steps (each step reads the previous activations), so loops
    hold state.
  - Each neuron's time constant (1–20 steps) makes it fast or slow, which allows waiting, patience and rhythms.
- **Brain cost:** upkeep rises by 0.002 per hidden neuron and 0.0004 per enabled connection, so complexity
  must pay for itself. 2c turns this into a visible "intelligence" stat.
- **Species distance** includes brain structure: shared connections are compared by weight, and unshared
  ones count as differences.
- **Ambush detection.**
  - New behaviour label **ambusher**: in the last window it stayed nearly still for ≥3 s and then attacked
    within 2 s of moving.
  - New checkpoint **"First ambush"** per species.
  - Labels for "patroller" and "homebody" are deferred to 2b, since they need the mental map.
- **Inspector brain view** shows the evolved network (neurons arranged by depth, live activity, recurrent links curved).
- **Capability check.** A headless benchmark compares mean population, food per creature-minute and kills per
  creature-minute against the recorded v2 baseline (`bench/baseline-v2-mlp.json`). 2a must reach at least 80% of
  baseline food intake by minute 15, and must show more brain structure at minute 30 than at birth.

## Non-goals (2a)
- Lifetime learning, the mental map and inherited knowledge (2b).
- The visible intelligence stat, signals and hearing, kin sense, the new viewer analytics beyond the brain graph,
  and meaning detection (2c).
- Sexual reproduction and crossover. Reproduction stays asexual, so no innovation-number table is needed.
- Smell or sound gradients (later, alongside signals).

## Anti-goals
- Scripted behaviour. Rays and loops only add perception and capacity, never instructions.
- A brain upgrade that leaves creatures less capable than the old brain without anyone noticing (the benchmark guards this).
- Losing determinism or the serialize roundtrip.

## Constraints
- The user will move to a stronger device, so scale knobs are **settings** (maxRays, max creatures), with defaults
  that keep the current iPad usable.
- Deterministic per seed. Schema version 3; older saves are rejected but kept, as before.

## Approaches considered (brain structure)
- **NEAT-style growth: chosen.** Complexity is earned, and it fits species tracking.
- Fixed layout with an evolvable hidden size: cheaper, but caps development.
- A large fixed recurrent network: no growth and expensive from the start; rejected.

## Technical calls (Claude's, can be changed)
- **Evaluation:** one synchronous update per sim step, with leaky integration
  `a += (act(bias + Σw·a_prev) − a) / tau`. `tanh` for hidden neurons, the same output squashing as today.
  Input→output paths of depth k respond after k steps, which is fine at 20 Hz.
- **Neuron ids:** fixed for inputs and outputs, and from a world-level counter for hidden neurons, so descendants share ids and
  species distance is meaningful without innovation numbers.
- **Inputs:**
  - the ray channels for `maxRays` (rays a creature lacks read 0)
  - energy, temperature, tempGradient, biomeFood, biomeDanger, cover, slopeAhead, waterAhead, hazardDist, bias
  - The nearest-object inputs (food/prey/threat/mate dist+angle) are removed, since rays replace them.
- **Ray casting:** creatures and food come from one grid query per creature, each bucketed into its ray by angle (nearest per
  ray). Terrain obstacles and forest cover come from a march along each ray at grid resolution.
- **Mutation rates** (per birth, scaled by the mutationRate setting): add connection 0.08, add neuron 0.03,
  toggle 0.02, remove neuron 0.01.

## Left to the builder
- Exact intensity curves, the founder connection count (around 4–8), and the ambush thresholds.
- Brain graph layout details.
