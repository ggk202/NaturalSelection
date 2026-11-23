import { BRAIN_WEIGHT_COUNT, INPUTS, HIDDEN, OUTPUTS } from '../src/sim/brain.js';

// Brain with zero weights except output biases: forces constant outputs.
export function biasBrain(biases = {}) {
  const w = new Float32Array(BRAIN_WEIGHT_COUNT);
  OUTPUTS.forEach((name, o) => {
    if (name in biases) w[(INPUTS.length + 1) * HIDDEN + o * (HIDDEN + 1) + HIDDEN] = biases[name];
  });
  return w;
}

export const BODY = { size: 1, legs: 2, digits: 1, eyes: 2, eyeSize: 1, antennae: 0, mouth: 0.8, diet: 0, hue: 0.3, insulation: 0.5, reproThreshold: 0.7 };
export const genome = (body = {}, biases = {}) => ({ body: { ...BODY, ...body }, brain: biasBrain(biases) });
export const quiet = { initialCreatures: 0, foodRate: 0, maxFood: 0, respawnMin: 0 };
