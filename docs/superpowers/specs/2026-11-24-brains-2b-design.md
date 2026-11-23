# Project 2b: Lifetime Learning and the Mental Map — Design

The user approved building 2b, then 2c, without further input. Choices marked *(Claude)* are mine.

## Intent
Creatures can now perceive and remember short-term (2a), but they forget places and never learn. 2b lets a creature
**learn during its life**: where food was, where it got hurt, which actions paid off. It also lets parents
**pass knowledge on**. That is what's needed for home ranges, learned hiding spots, hazard avoidance and, in turn, biome specialists.

## Goals
- **Mental map** per creature *(Claude)*:
  - A coarse grid over the world (cell size `mapCell` setting, default 10 units → 20×20 at W=200) with two channels:
    **food memory** and **danger memory**. Each is stored as Int8 (−127..127), so it's compact and deterministic.
  - Eating writes food memory into the current cell. Losing energy to attacks, hazards, drowning or temperature writes danger memory.
  - Memories fade by 5% every 5 s.
- **Map senses** (new brain inputs): food and danger memory at 2 cells ahead, ahead-left and ahead-right (6 inputs), plus
  **familiarity** of the current cell (how often it has been visited; also fades).
- **Reward-driven learning** (Hebbian, neuromodulated) *(Claude)*:
  - Each creature keeps its own working copy of its brain weights, starting from its genes.
  - Each step, every enabled connection changes by `lr · plasticity_c · pre · post · reward`. Here `reward` is
    the creature's energy change this step relative to its normal upkeep: food is positive, damage negative, clamped to [−1, 1].
  - `lr` (0–0.3) is a per-brain gene and `plasticity_c` (−1..1) a per-connection gene; both evolve.
    New connections start with plasticity 0, so learning has to be earned too.
  - Weights are clamped to [−4, 4]. Learned weights are **not** inherited: children start from the genes (Baldwinian).
- **Inherited knowledge:** a newborn starts with its parent's map faded to 50%.
- **Costs:** map memory adds 0.0005 upkeep/s if any connection reads a map input; learning adds
  `0.004·lr` upkeep/s. Both feed the 2c intelligence stat.
- **Behaviour labels:**
  - **homebody**: moving for more than 30% of the window but staying within 12 units of where the window started.
  - **patroller**: path longer than 60 units but staying within 30 units, so it loops over the same ground.
- **Success:**
  - (1) A unit test where a creature that took hazard damage at a spot later steers away from it, using its map.
  - (2) A unit test where rewarded co-activation strengthens a plastic connection and punishment weakens it.
  - (3) The specialization slow test, currently a todo, is re-measured; if it passes, it's promoted to a real test.
  - (4) The capability check stays green.

## Non-goals
- Map overlay in the viewer, the intelligence stat UI and new checkpoints (2c).
- Inheriting learned weights (Lamarckian).

## Constraints
- Deterministic, and the save/load roundtrip must continue identically.
- Saves stay compact: maps go into saves as base64 Int8, and learned weights as base64 Float32.
- Schema version 4.
