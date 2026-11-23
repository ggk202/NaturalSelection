export const INPUTS = ['foodDist', 'foodAngle', 'preyDist', 'preyAngle', 'threatDist', 'threatAngle',
  'mateDist', 'mateAngle', 'energy', 'temperature', 'hazardDist', 'bias'];
export const OUTPUTS = ['turn', 'throttle', 'attack', 'reproduce'];
export const HIDDEN = 8;
export const BRAIN_WEIGHT_COUNT = (INPUTS.length + 1) * HIDDEN + (HIDDEN + 1) * OUTPUTS.length;
