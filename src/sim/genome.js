import { createBrain, mutateBrain, cloneBrain, brainDistance, usableInputs, linkable, INPUT_NAMES, OUTPUTS, N_IN, JOINT_OUT, MAX_JOINTS } from './neat.js';
import { randomBodyPlan, mutateBodyPlan, cloneBodyPlan, bodyPlanDistance, expandBody } from './bodyplan.js';
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
  { key: 'attention', min: 1, max: 6, int: true },
];
const TRAIT_GENES = { diet: [0, 1], hue: [0, 1], reproThreshold: [0.5, 0.95], balance: [0, 1], attention: [1, 6] };

const traitCache = new WeakMap();
// Cached summary of a genome's body (plans are never mutated in place).
export function traitsOf(g) {
  let t = traitCache.get(g.body);
  if (!t) { t = paramsFromPlan(g.body); traitCache.set(g.body, t); }
  return t;
}

const localIds = () => { let n = 100000; return () => n++; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// physical: founders wire attack/reproduce and their own joints, and each joint starts linked to a
// rhythm input (the rhythm sense); everything else about the brain is random.
export function randomGenome(rng, physical = false) {
  const body = randomBodyPlan(rng);
  body.diet = rng.range(0, 0.2); // founders start as herbivores; carnivory must evolve (or be seeded)
  body.hue = rng.next();
  body.reproThreshold = rng.range(0.5, 0.95);
  body.balance = rng.range(0.4, 0.8); // righting reflex strength (physical bodies)
  body.attention = rng.range(1, 2.5); // max word length (syllables), rounded
  const g = { body, brain: null }, rays = 1 + 2 * traitsOf(g).eyes;
  if (!physical) { g.brain = createBrain(rng, rng.int(4, 8), usableInputs(rays)); return g; }
  const joints = Math.min(MAX_JOINTS, expandBody(body, MAX_JOINTS + 1).length - 1);
  g.brain = createBrain(rng, rng.int(4, 8), usableInputs(rays, true), [2, 3, ...Array.from({ length: joints }, (_, j) => JOINT_OUT + j)]);
  const osc = ['osc0s', 'osc0c', 'osc1s', 'osc1c', 'osc2s', 'osc2c'].map((n) => INPUT_NAMES.indexOf(n));
  for (let j = 0; j < joints; j++) {
    const from = osc[rng.int(0, osc.length - 1)], to = N_IN + JOINT_OUT + j;
    if (!g.brain.conns.some((k) => k.from === from && k.to === to)) g.brain.conns.push({ from, to, w: rng.gauss() * 2, on: true, p: 0 });
  }
  return g;
}

export function cloneGenome(g) {
  return { body: cloneBodyPlan(g.body), brain: cloneBrain(g.brain) };
}

// nextNodeId supplies hidden-neuron ids; the world passes its own counter (tests may omit it).
// opts.physical: restrict new brain links to what this body can use (joints, body senses).
export function mutate(g, rate, rng, nextNodeId = localIds(), opts = null) {
  const body = mutateBodyPlan(g.body, rate, rng);
  for (const [k, [lo, hi]] of Object.entries(TRAIT_GENES)) {
    if (rng.next() < rate) body[k] = clamp((body[k] ?? (lo + hi) / 2) + rng.gauss() * 0.1 * (hi - lo), lo, hi);
  }
  const t = { body };
  const allowed = opts ? linkable(1 + 2 * traitsOf(t).eyes, opts.physical, expandBody(body, MAX_JOINTS + 1).length - 1) : null;
  return { body, brain: mutateBrain(g.brain, rate, rng, nextNodeId, null, allowed) };
}

export function genomeDistance(a, b) {
  const pa = a.body, pb = b.body;
  const traits = Math.abs((pa.diet ?? 0) - (pb.diet ?? 0)) + Math.abs((pa.reproThreshold ?? 0.7) - (pb.reproThreshold ?? 0.7)) / 0.45;
  return (bodyPlanDistance(pa, pb) * 11 + traits) / 13 + 0.15 * brainDistance(a.brain, b.brain);
}

// 1 for clones, falling to 0 for strangers (genome distance ≥ 0.25: founders share a few templates,
// so brains and fine body differences must separate unrelated lines).
export const relatedness = (a, b) => Math.max(0, 1 - genomeDistance(a, b) / 0.25);
