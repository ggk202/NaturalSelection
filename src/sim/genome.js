import { createBrain, mutateBrain, cloneBrain, brainDistance, usableInputs } from './neat.js';
import { randomBodyPlan, mutateBodyPlan, cloneBodyPlan, bodyPlanDistance } from './bodyplan.js';
import { paramsFromPlan } from './body.js';

// Summary traits computed from a body plan (for stats, averages and display). Bodies are body plans;
// diet, hue and reproThreshold are plan-level genes.
export const GENES = [
  { key: 'size', min: 0.3, max: 2.5 },
  { key: 'legs', min: 0, max: 12, int: true },
  { key: 'digits', min: 0, max: 5, int: true },
  { key: 'eyes', min: 0, max: 12, int: true },
  { key: 'eyeSize', min: 0.2, max: 1.5 },
  { key: 'antennae', min: 0, max: 8, int: true },
  { key: 'mouth', min: 0, max: 1.5 },
  { key: 'diet', min: 0, max: 1 },
  { key: 'hue', min: 0, max: 1 },
  { key: 'insulation', min: 0, max: 1 },
  { key: 'reproThreshold', min: 0.5, max: 0.95 },
  { key: 'parts', min: 1, max: 32, int: true },
  { key: 'grippers', min: 0, max: 12, int: true },
];
const TRAIT_GENES = { diet: [0, 1], hue: [0, 1], reproThreshold: [0.5, 0.95] };

const traitCache = new WeakMap();
// Cached summary of a genome's body (plans are never mutated in place).
export function traitsOf(g) {
  let t = traitCache.get(g.body);
  if (!t) { t = paramsFromPlan(g.body); traitCache.set(g.body, t); }
  return t;
}

const localIds = () => { let n = 100000; return () => n++; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function randomGenome(rng) {
  const body = randomBodyPlan(rng);
  body.diet = rng.range(0, 0.2); // founders start as herbivores; carnivory must evolve (or be seeded)
  body.hue = rng.next();
  body.reproThreshold = rng.range(0.5, 0.95);
  const g = { body, brain: null };
  g.brain = createBrain(rng, rng.int(4, 8), usableInputs(1 + 2 * traitsOf(g).eyes));
  return g;
}

export function cloneGenome(g) {
  return { body: cloneBodyPlan(g.body), brain: cloneBrain(g.brain) };
}

// nextNodeId supplies hidden-neuron ids; the world passes its own counter (tests may omit it).
export function mutate(g, rate, rng, nextNodeId = localIds()) {
  const body = mutateBodyPlan(g.body, rate, rng);
  for (const [k, [lo, hi]] of Object.entries(TRAIT_GENES)) {
    if (rng.next() < rate) body[k] = clamp((body[k] ?? (lo + hi) / 2) + rng.gauss() * 0.1 * (hi - lo), lo, hi);
  }
  return { body, brain: mutateBrain(g.brain, rate, rng, nextNodeId) };
}

export function genomeDistance(a, b) {
  const pa = a.body, pb = b.body;
  const traits = Math.abs((pa.diet ?? 0) - (pb.diet ?? 0)) + Math.abs((pa.reproThreshold ?? 0.7) - (pb.reproThreshold ?? 0.7)) / 0.45;
  return (bodyPlanDistance(pa, pb) * 11 + traits) / 13 + 0.15 * brainDistance(a.brain, b.brain);
}

// 1 for clones, falling to 0 for strangers (genome distance ≥ 0.25: founders share a few templates,
// so brains and fine body differences must separate unrelated lines).
export const relatedness = (a, b) => Math.max(0, 1 - genomeDistance(a, b) / 0.25);
