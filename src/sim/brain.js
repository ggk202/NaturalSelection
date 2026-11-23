export const INPUTS = ['foodDist', 'foodAngle', 'preyDist', 'preyAngle', 'threatDist', 'threatAngle',
  'mateDist', 'mateAngle', 'energy', 'temperature', 'hazardDist', 'bias'];
export const OUTPUTS = ['turn', 'throttle', 'attack', 'reproduce'];
export const HIDDEN = 8;
export const BRAIN_WEIGHT_COUNT = (INPUTS.length + 1) * HIDDEN + (HIDDEN + 1) * OUTPUTS.length;

const hidden = new Float32Array(HIDDEN);
const NI = INPUTS.length, NO = OUTPUTS.length;

// Weight layout: per hidden neuron [NI weights, bias], then per output [HIDDEN weights, bias].
export function think(w, inp, out) {
  let p = 0;
  for (let h = 0; h < HIDDEN; h++) {
    let s = 0;
    for (let i = 0; i < NI; i++) s += w[p++] * inp[i];
    hidden[h] = Math.tanh(s + w[p++]);
  }
  for (let o = 0; o < NO; o++) {
    let s = 0;
    for (let h = 0; h < HIDDEN; h++) s += w[p++] * hidden[h];
    s += w[p++];
    out[o] = o === 0 ? Math.tanh(s) : 1 / (1 + Math.exp(-s));
  }
  return out;
}
