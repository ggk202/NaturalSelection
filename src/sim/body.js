// Every body part buys a benefit and pays upkeep, so appearance is under selection.
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function deriveStats(b) {
  const swim = clamp01(0.12 * b.digits + 0.2 * b.size - 0.06 * b.legs); // webbing + bulk; legs drag
  const climb = clamp01(0.2 * b.digits * Math.min(1, b.legs / 2)); // grip needs digits on at least two legs
  const legPower = b.legs * (1 + 0.1 * b.digits);
  return {
    speed: 1 + 0.35 * legPower / Math.sqrt(b.size),
    turnRate: 1.5 + 0.15 * b.digits + 0.05 * b.legs,
    senseRange: 3 + b.eyes * b.eyeSize * 2.5 + b.antennae * 1.5,
    fov: Math.min(2 * Math.PI, 0.6 + b.eyes * 0.7),
    attack: b.mouth * b.size * b.diet,
    defense: b.size * (1 + 0.05 * b.legs),
    biteSize: b.mouth * b.size,
    digestPlant: 1 - b.diet,
    digestMeat: b.diet,
    coldResist: b.insulation + 0.3 * b.size,
    heatResist: 1 - b.insulation,
    upkeep: 0.02 * b.size ** 2 + 0.004 * b.legs * (1 + 0.2 * b.digits) + 0.003 * b.eyes * b.eyeSize
      + 0.002 * b.antennae + 0.002 * b.mouth + 0.002 * b.insulation + 0.003 * swim + 0.003 * climb,
    swim, climb,
    camo: clamp01(1.2 - b.size), // only matters in forest
    maxEnergy: 10 * b.size ** 2,
  };
}
