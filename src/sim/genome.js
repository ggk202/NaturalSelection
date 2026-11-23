import { createBrain, mutateBrain, cloneBrain, brainDistance } from './neat.js';

export const GENES = [
  { key: 'size', min: 0.5, max: 2 },
  { key: 'legs', min: 0, max: 8, int: true },
  { key: 'digits', min: 0, max: 5, int: true },
  { key: 'eyes', min: 0, max: 6, int: true },
  { key: 'eyeSize', min: 0.2, max: 1.5 },
  { key: 'antennae', min: 0, max: 4, int: true },
  { key: 'mouth', min: 0.2, max: 1.5 },
  { key: 'diet', min: 0, max: 1 },
  { key: 'hue', min: 0, max: 1 },
  { key: 'insulation', min: 0, max: 1 },
  { key: 'reproThreshold', min: 0.5, max: 0.95 },
];

const localIds = () => { let n = 100000; return () => n++; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function randomGenome(rng) {
  const body = {};
  for (const { key, min, max, int } of GENES) body[key] = int ? rng.int(min, max) : rng.range(min, max);
  // Founders start as herbivores; carnivory must evolve (or be seeded).
  body.diet = rng.range(0, 0.2);
  return { body, brain: createBrain(rng) };
}

export function cloneGenome(g) {
  return { body: { ...g.body }, brain: cloneBrain(g.brain) };
}

// nextNodeId supplies hidden-neuron ids; the world passes its own counter (tests may omit it).
export function mutate(g, rate, rng, nextNodeId = localIds()) {
  const out = { body: { ...g.body }, brain: mutateBrain(g.brain, rate, rng, nextNodeId) };
  for (const { key, min, max, int } of GENES) {
    if (rng.next() >= rate) continue;
    const v = int ? out.body[key] + (rng.next() < 0.5 ? -1 : 1) : out.body[key] + rng.gauss() * 0.1 * (max - min);
    out.body[key] = clamp(v, min, max);
  }
  return out;
}

export function genomeDistance(a, b) {
  let d = 0;
  for (const { key, min, max } of GENES) if (key !== 'hue') d += Math.abs(a.body[key] - b.body[key]) / (max - min);
  return d / (GENES.length - 1) + 0.15 * brainDistance(a.brain, b.brain);
}
