# 3b, 4, 5 and the Player Character — Design and Plan

The user approved building 3b, 4 and 5, followed by a customizable, controllable player character that can speak with
syllable buttons (2026-11-25). Earlier decisions in `docs/roadmap.md` apply. Every other choice here is mine *(Claude)*,
kept to the smallest version that does the job; each stage ships tested before the next starts.

## 3b Wings and fins
- **Genes:** body-plan nodes gain `wing` and `fin` flags, toggled by mutation at rate × 0.15, like `gripper`. Wing and fin
  nodes are exempt from the limb proportion rule but must be thin (height ≤ 0.2 × length).
- **Physical mode, plate drag:** a wing or fin part feels a force against the velocity along its own normal (local y).
  The fluid factor is small in air (wings) and large in water (fins). Flapping then produces lift or thrust; nothing is scripted.
- **Kinematic mode:**
  - `flight = clamp(wing area / mass)`. Above 0.5, a creature crosses lakes and cliffs at land speed, at an extra upkeep of 0.03 × flight.
  - Each fin adds 0.3 to swim.
- **Display:** wings in a light tint, fins in a blue tint. Founders have neither.
- **Tests:** mutation toggles the flags; flight and swim stats; a falling wing plate descends slower than a bare box.

## 4 Tool use
- **Objects:** `world.objects = [{id, type, x, z, holder, sharp}]`, saved with the world.
  - stones spawn on mountain/desert, sticks in forest
  - nuts are hard forest food
  - seeds come from eaten plants (sometimes)
- **New brain outputs:** `grab`, `drop`, `use`.
  - **Grab** requires dexterity ≥ 0.2: a creature holds one object at a time.
  - **Inputs:** `objDist`, `objAngle`, `objType`, `holding`, `nutNear`.
- **4a, using objects:** holding a stone and pressing `use` near a nut cracks it for a large energy gain. A held stone
  can be thrown (`use` with a creature ahead) for ranged damage.
- **4b, weapons and traps:** `use` with a stick near a stone sharpens it into a spear, which raises attack while held.
  A sharpened stick that is dropped becomes a trap that hurts whatever steps on it.
- **4c, shelter:** at least 3 dropped objects within 3 units form a shelter. Creatures inside take 70% less temperature
  cost and 50% less damage.
- **4d, agriculture:** a held seed dropped on fertile land becomes a sprout. After 40 s it grows into a plant that keeps
  producing food nearby.
- **Checkpoints:**
  - first nut cracked
  - first throw hit
  - first spear
  - first trap kill
  - first shelter
  - first harvest from a planted crop
- **Tests:** one per mechanic. Save/load continues identically.

## 5 Language
- **Words:** consecutive calls form a word; a silent step ends it. Word length is capped by `attention` (a plan gene,
  1–6, costing 0.003 upkeep per unit). Listeners hear the last `attention` syllables from the loudest caller as inputs
  `heard0`–`heard5`.
- **Shared reference frame:** `compassSin` and `compassCos` (absolute heading).
- **A remembered place to talk about:** `memFoodSin`, `memFoodCos` and `memFoodDist` point to the best food cell on the creature's map.
- **Meaning detection for words:**
  - The existing rules apply (≥ 5 callers, rate-limited, compared with the callers' own base rates).
  - Contexts are threat, food, kin, plus the speaker's biome and the compass octant of its remembered food.
  - Lexicon entries look like `"mi-to": ["food", "forest", "north"]`.
- **Speech bubbles:** an overlay above each calling creature on screen, nearest 15, showing the word and its
  translation through the species lexicon ("?" if the word isn't known).
- **Tests:** attention caps word length; hearing buffer; word lexicon detection, including location; bubble e2e.

## Player character
- **Customize:** a "Play" sheet with body template (worm, quadruped, biped), size, colour, eyes, grippers, wings and fins.
  It spawns a creature flagged `player`, with its brain ignored.
- **Control:**
  - Keyboard: W/A/S/D or arrow keys.
  - On-screen pad for touch.
  - Buttons: attack, grab, drop and use.
  - Syllable buttons **ka ru mi to**: consecutive presses within 1 s form a word, which other creatures hear like any call.
- **Physical mode:** player input sets the root velocity directly (assisted), with a strong balance reflex.
- **World rules:** the player eats, gets hurt and dies like everyone else (a respawn button appears) and doesn't
  reproduce. The camera follows the player.
- **Speech:** speech bubbles translate creature words for the player.
- **Tests:** a unit test for player control; an e2e test that spawns, moves and speaks.

## Non-goals
Multiplayer; scripted creature responses to the player; real grammar beyond words.
