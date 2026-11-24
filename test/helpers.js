import { createBrain, N_IN, OUTPUTS, INPUT_NAMES } from '../src/sim/neat.js';
import { createRng } from '../src/sim/rng.js';
import { planFromParams } from '../src/sim/body.js';

// Brain with no connections whose output biases force constant outputs.
export function biasBrain(biases = {}) {
  const b = createBrain(createRng(1), 0);
  OUTPUTS.forEach((name, o) => { if (name in biases) b.nodes.find((n) => n.id === N_IN + o).bias = biases[name]; });
  return b;
}

export const inputIndex = (name) => INPUT_NAMES.indexOf(name);
export const BODY = { size: 1, legs: 2, digits: 1, eyes: 2, eyeSize: 1, antennae: 0, mouth: 0.8, diet: 0, hue: 0.3, insulation: 0.5, reproThreshold: 0.7 };
// Old-style parameter bodies are converted to body plans.
export const genome = (body = {}, biases = {}) => ({ body: planFromParams({ ...BODY, ...body }), brain: biasBrain(biases) });
// Legacy tests run on a flat 100-unit plains world.
export const quiet = { worldSize: 100, flat: true, initialCreatures: 0, foodRate: 0, maxFood: 0, respawnMin: 0, apexMin: 0 };
