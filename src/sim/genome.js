import { BRAIN_WEIGHT_COUNT } from './brain.js';

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

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function randomGenome(rng) {
  const body = {};
  for (const { key, min, max, int } of GENES) body[key] = int ? rng.int(min, max) : rng.range(min, max);
  // Founders start as herbivores; carnivory must evolve (or be seeded).
  body.diet = rng.range(0, 0.2);
  const brain = new Float32Array(BRAIN_WEIGHT_COUNT);
  for (let i = 0; i < brain.length; i++) brain[i] = rng.gauss() * 0.8;
  return { body, brain };
}

export function cloneGenome(g) {
  return { body: { ...g.body }, brain: Float32Array.from(g.brain) };
}

export function mutate(g, rate, rng) {
  const out = cloneGenome(g);
  for (const { key, min, max, int } of GENES) {
    if (rng.next() >= rate) continue;
    const v = int ? out.body[key] + (rng.next() < 0.5 ? -1 : 1) : out.body[key] + rng.gauss() * 0.1 * (max - min);
    out.body[key] = clamp(v, min, max);
  }
  for (let i = 0; i < out.brain.length; i++) if (rng.next() < rate) out.brain[i] += rng.gauss() * 0.3;
  return out;
}

export function genomeDistance(a, b) {
  let d = 0;
  for (const { key, min, max } of GENES) if (key !== 'hue') d += Math.abs(a.body[key] - b.body[key]) / (max - min);
  let w = 0;
  for (let i = 0; i < a.brain.length; i++) w += Math.abs(a.brain[i] - b.brain[i]);
  return d / (GENES.length - 1) + 0.1 * (w / a.brain.length);
}
