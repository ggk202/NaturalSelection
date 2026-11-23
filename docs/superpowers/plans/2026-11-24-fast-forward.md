# Fast-Forward Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Spec:** `docs/superpowers/specs/2026-11-24-fast-forward-design.md`

**Global Constraints:** step size ×1 is identical to normal play; the world returns exactly (save/load roundtrip); the wall-clock safety stop is always on.

**Review Focus:**
- Stop pressed mid-chunk.
- A worker error must return the world unchanged.
- Extinction with respawn assist on (the population never stays < 1).
- Restoring the step size if the run throws.
- The UI stays responsive.

### Task 1: `runUntil` (pure) + tests
Covers time, popBelow, popAbove, checkpoint kind and "any", trait threshold, wall-clock (injected clock), maxSteps chunking (returns null when not done), and step size applied/restored.

### Task 2: Worker + app wiring + UI sheet and progress panel + e2e
The e2e check fast-forwards 0.5 sim-minutes in kinematic mode, then checks that the world advanced, the view continues and there are no errors.

### Task 3: Cheap levers
Profile kinematic steps at 300 creatures, optimise the top hot paths, and measure before and after (bench log in the ledger). Measure fast-forward speed for both modes.
