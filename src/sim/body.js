// Every body part buys a benefit and pays upkeep, so appearance is under selection.
// Bodies are body plans (bodyplan.js); stats are computed from an equivalent parameter summary
// (size, legs, digits, eyes, …) so the long-standing formulas keep their meaning, plus new physical stats.
import { expandBody } from './bodyplan.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const MAX_PARTS = 25; // same cap as physical bodies (24 joints)
const ROOT_VOL = 0.36; // root box volume of a size-1 body built by planFromParams

// Old-style parameter body -> body plan (torso with organs, legs in mirrored pairs, toes on legs).
export function planFromParams(p) {
  const s = p.size, legs = Math.round(p.legs), digits = Math.round(p.digits);
  const root = { size: [1.2 * s, 0.5 * s, 0.6 * s], covering: p.insulation >= 0.5 ? 'fur' : 'none', eyes: Math.round(p.eyes), eyeSize: p.eyeSize,
    mouth: p.mouth, antennae: Math.round(p.antennae), gripper: false, edges: [] };
  const leg = { size: [0.8 * s, 0.2 * s, 0.2 * s], covering: 'none', eyes: 0, eyeSize: 0.5, mouth: 0, antennae: 0, gripper: false, edges: [] };
  const toe = { size: [0.22 * s, 0.08 * s, 0.08 * s], covering: 'none', eyes: 0, eyeSize: 0.5, mouth: 0, antennae: 0, gripper: false, edges: [] };
  const pairs = Math.floor(legs / 2);
  const J = (o) => ({ to: 1, face: 3, u: 0, v: 0.8, yaw: 0, pitch: 0, axis: 'z', lo: -0.7, hi: 0.7, strength: 1, recur: 1, symmetric: true, ...o });
  for (let i = 0; i < pairs; i++) root.edges.push(J({ u: pairs === 1 ? 0 : -0.8 + (1.6 * i) / (pairs - 1) }));
  if (legs % 2) root.edges.push(J({ u: 0, v: 0, symmetric: false }));
  for (let d = 0; d < digits; d++) leg.edges.push({ to: 2, face: 0, u: 0, v: 0, yaw: digits === 1 ? 0 : -0.6 + (1.2 * d) / (digits - 1), pitch: 0, axis: 'y', lo: -0.4, hi: 0.4, strength: 0.5, recur: 1, symmetric: false });
  return { nodes: [root, leg, toe], diet: p.diet, hue: p.hue, reproThreshold: p.reproThreshold };
}

// Body plan -> parameter summary used by the stat formulas (and species averages).
export function paramsFromPlan(plan) {
  const parts = expandBody(plan, MAX_PARTS), root = parts[0];
  const vol = (q) => q.size[0] * q.size[1] * q.size[2];
  const elongated = (q) => q.size[0] >= 2 * Math.max(q.size[1], q.size[2]);
  const legs = parts.filter((q) => q.parent === 0 && elongated(q));
  const legSet = new Set(legs.map((q) => q.index));
  const toes = parts.filter((q) => legSet.has(q.parent)).length;
  let limbVol = 0, eyes = 0, eyeW = 0, antennae = 0, mouth = 0, total = 0, fur = 0, shell = 0, spikes = 0, mass = 0, grippers = 0, dexterity = 0, strength = 0, wingArea = 0, fins = 0;
  const depth = (q) => (q.parent < 0 ? 0 : 1 + depth(parts[q.parent]));
  for (const q of parts) {
    const v = vol(q);
    total += v;
    if (q.parent >= 0 && !q.eyes && !q.mouth) limbVol += v;
    if (q.covering === 'fur') fur += v; else if (q.covering === 'shell') shell += v; else if (q.covering === 'spikes') spikes += v;
    mass += v * (q.covering === 'shell' ? 1.6 : q.covering === 'fur' ? 1.1 : 1);
    eyes += q.eyes; eyeW += q.eyes * q.eyeSize; antennae += q.antennae; mouth = Math.max(mouth, q.mouth);
    if (q.gripper) { grippers++; dexterity += 0.15 * Math.min(4, depth(q)); } // fingers further out the limb are finer
    if (q.joint) strength += q.joint.strength;
    if (q.wing) wingArea += q.size[0] * q.size[2];
    if (q.fin) fins++;
  }
  return {
    size: Math.cbrt(vol(root) / ROOT_VOL), legs: legs.length, digits: legs.length ? Math.round(toes / legs.length) : 0,
    eyes, eyeSize: eyes ? eyeW / eyes : 0.5, antennae, mouth,
    diet: plan.diet ?? 0, hue: plan.hue ?? 0.5, reproThreshold: plan.reproThreshold ?? 0.7, balance: plan.balance ?? 0.5, attention: Math.round(plan.attention ?? 1),
    insulation: total ? fur / total : 0,
    // physical extras
    parts: parts.length, joints: parts.length - 1, mass, rootVol: vol(root), grippers, dexterity: clamp01(dexterity),
    shell: total ? shell / total : 0, spikes: total ? spikes / total : 0, muscle: strength, limbVol, wingArea, fins,
  };
}

export function deriveStats(body) {
  const b = body.nodes ? paramsFromPlan(body) : body;
  const swim = clamp01(0.12 * b.digits + 0.2 * b.size - 0.06 * b.legs + 0.3 * (b.fins || 0)); // webbing + bulk + fins; legs drag
  const flight = clamp01((b.wingArea || 0) / (2 * (b.mass ?? ROOT_VOL * b.size ** 3))); // wing area per unit mass
  const climb = clamp01(0.2 * b.digits * Math.min(1, b.legs / 2)); // grip needs digits on at least two legs
  const legPower = b.legs * (1 + 0.1 * b.digits);
  const shell = b.shell || 0, spikes = b.spikes || 0, grippers = b.grippers || 0, joints = b.joints || 0;
  const rootVol = b.rootVol ?? ROOT_VOL * b.size ** 3;
  return {
    speed: (1 + 0.35 * legPower / Math.sqrt(b.size)) * (1 - 0.3 * shell),
    turnRate: 1.5 + 0.15 * b.digits + 0.05 * b.legs,
    senseRange: 3 + b.eyes * b.eyeSize * 2.5 + b.antennae * 1.5,
    fov: Math.min(2 * Math.PI, 0.6 + b.eyes * 0.7),
    attack: b.mouth * b.size * b.diet,
    defense: b.size * (1 + 0.05 * b.legs) + 1.5 * shell * b.size,
    biteSize: b.mouth * b.size,
    digestPlant: 1 - b.diet,
    digestMeat: b.diet,
    coldResist: b.insulation + 0.3 * b.size,
    heatResist: 1 - b.insulation,
    upkeep: 0.02 * b.size ** 2 + 0.004 * b.legs * (1 + 0.2 * b.digits) + 0.003 * b.eyes * b.eyeSize
      + 0.002 * b.antennae + 0.002 * b.mouth + 0.002 * b.insulation + 0.003 * swim + 0.003 * climb
      + 0.01 * shell + 0.008 * spikes + 0.003 * grippers + 0.0015 * joints
      + 0.05 * (b.limbVol || 0) // bulky limbs are costly to carry
      + 0.02 * (b.balance ?? 0) // the righting reflex costs energy
      + 0.03 * flight
      + 0.003 * (b.attention ?? 1), // a longer attention span costs brain power
    swim, climb, flight, flies: flight > 0.5,
    camo: clamp01(1.2 - b.size), // only matters in forest
    maxEnergy: 10 * b.size ** 2,
    // physical-body stats
    mass: b.mass ?? rootVol, joints, grippers, shell, spikes,
    dexterity: b.dexterity || 0, balance: b.balance ?? 0, attention: b.attention ?? 1,
    endurance: 2 + 8 * rootVol, // stamina pool from torso mass
    staminaRegen: 0.6,
  };
}
