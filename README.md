# Natural Selection

A 3D natural-selection sandbox that runs in the browser and installs on an iPad.
Creatures evolve low-poly bodies (legs, digits, eyes, antennae, mouth, size,
insulation, diet) and small neural-network brains. Every body part has an energy
cost and a benefit, so appearance is under selection. Predators can evolve from the
gene pool. Seasons, a cold-north/hot-south temperature gradient and hazard zones
add pressure. Runs, settings, stats and evolution checkpoints are saved in the
browser (IndexedDB).

## Use it
- **Touch:** drag to orbit, pinch to zoom, two fingers to pan. Tap with the selected
  tool: inspect, drop food, place or remove a hazard, kill, clone, or mutate. The
  🦖 button seeds 5 predators.
- **Top bar:** play/pause, step, speed, Settings, Runs (save/resume/rename/delete/
  download JSON), Timeline (evolution checkpoints), Graphs.
- **Respawn assist** (Settings → World) refills the population from the most
  successful parents when it drops below the minimum. Set it to 0 to allow real extinction.

## Install on iPad
1. In repo **Settings → Pages**, set **Source: GitHub Actions** (one-time).
2. Merge to `main`. The workflow deploys to `https://<user>.github.io/NaturalSelection/`.
3. Open it in Safari → Share → **Add to Home Screen**. After the first load it works offline.

## Develop
No build step. Serve the folder with any static server, e.g. `npx serve .`.
- `npm test`: unit tests for the simulation (Node 22).
- `npm run e2e`: browser smoke tests (Playwright + Chromium).

Design: `docs/superpowers/specs/`. Plan: `docs/superpowers/plans/`.
