# Fast-Forward — Design

Decided by the user (2026-11-24): a fast-forward mode with user-set stop conditions, plus the "cheap levers" for speed
(larger fast-forward time steps, hot-path optimisation). A multi-core rewrite is out of scope. Speeds are reported
honestly. Expect roughly 100–300× in kinematic mode and 3–10× in physical mode on an M1 Max.

## Behaviour
- A **⏩ Fast-forward** button opens a sheet with stop conditions (any combination; the first one met stops the run):
  - **time:** after N simulated minutes (default 30)
  - **population:** below N, above N, or extinct (below 1)
  - **event:** the next checkpoint of a chosen kind: any, new species, first (carnivores / ambush / dextrous / word), colonized,
    body shift, behaviour shift
  - **trait:** population average of a trait (intelligence, legs, eyes, size, diet, grippers, dexterity, endurance)
    crossing ≥ or ≤ a value
  - **wall-clock:** after N real minutes (default 10, always on as a safety stop)
  - **step size:** ×1 (identical to normal play), ×2, or ×4 (kinematic only; physical is capped at ×2 for stability)
- While it runs, the simulation goes in a Web Worker with no rendering. A panel shows simulated time, population, achieved speed
  ("×140"), the latest checkpoints, and a **Stop** button.
- When it stops, the world returns to the 3D view exactly where it is (serialize → deserialize, so ×1 is identical to
  normal play), with a toast naming the condition that stopped it. Auto-save runs right after.

## Technical calls (Claude's)
- The pure module `src/sim/fastforward.js` exports `runUntil(world, cond, { maxSteps, now })`, which returns
  `{ reason, detail, steps } | null` (null = not yet). It is shared by the worker and by Node tests.
- `src/ff-worker.js` is a module worker. It receives `{ save, cond }`, runs in ~100 ms chunks, posts progress about every 250 ms,
  and handles `stop` messages.
- The step size multiplies `settings.dt` for the duration, and the original is restored before handing back.
- Hot paths are profiled and optimised (vision rays, hearing, brain evaluation), aiming for ≥1.5× on kinematic steps,
  measured before and after.

## Non-goals
Multi-core simulation; fast-forwarding with rendering; changing world rules for speed (other than the opt-in step size).
