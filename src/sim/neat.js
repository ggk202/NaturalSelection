// Evolvable recurrent brains (NEAT-style structure growth, asexual so no innovation table).
// Node ids: inputs 0..N_IN-1, outputs N_IN..N_IN+N_OUT-1, hidden from a world-level counter.
export const RAY_CAP = 13; // max rays any creature can have (eyes 0..6 -> 1..13 rays)
export const RAY_CHANNELS = ['food', 'creature', 'obstacle'];
export const SCALARS = ['energy', 'temperature', 'tempGradient', 'biomeFood', 'biomeDanger', 'cover', 'slopeAhead', 'waterAhead', 'hazardDist', 'bias',
  'mapFoodAhead', 'mapFoodLeft', 'mapFoodRight', 'mapDangerAhead', 'mapDangerLeft', 'mapDangerRight', 'familiarity',
  'kinNear', 'hear0', 'hear1', 'hear2', 'hear3', 'hearSin', 'hearCos', 'hearKin',
  // Physical bodies: rhythm sense (sin/cos at 0.5, 1, 2 Hz), posture, speed, stamina, joint angles and touch.
  'osc0s', 'osc0c', 'osc1s', 'osc1c', 'osc2s', 'osc2c', 'upY', 'pitch', 'roll', 'fwdSpeed', 'stamina',
  ...Array.from({ length: 24 }, (_, j) => `joint${j}`), ...Array.from({ length: 24 }, (_, j) => `touch${j}`),
  // Tool use: nearest loose object, what is held, a nut in reach, standing in a shelter.
  'objDist', 'objAngle', 'objType', 'holding', 'nutNear', 'sheltered',
  // Language: the loudest speaker's word (last syllables, up to the listener's attention), a compass, and a remembered food place.
  'heard0', 'heard1', 'heard2', 'heard3', 'heard4', 'heard5', 'compassSin', 'compassCos', 'memFoodSin', 'memFoodCos', 'memFoodDist',
  // Disease: am I ill, is the creature I see ill.
  'sick', 'sickSeen',
  // Culture: what the heard word means to this listener (its own learned vocabulary).
  'heardThreat', 'heardFood', 'heardKin'];
export const N_IN = RAY_CAP * RAY_CHANNELS.length + SCALARS.length;
export const MAX_JOINTS = 24; // joint motor outputs j0..j23 (physical bodies)
export const OUTPUTS = ['turn', 'throttle', 'attack', 'reproduce', 'call', 'syllA', 'syllB', ...Array.from({ length: MAX_JOINTS }, (_, j) => `j${j}`), 'grab', 'drop', 'use'];
export const N_OUT = OUTPUTS.length;
// Founders wire only turn/throttle/attack/reproduce; the voice must be gained by mutation.
const CORE_OUTPUTS = 4;
export const INPUT_NAMES = [...Array.from({ length: RAY_CAP }, (_, r) => RAY_CHANNELS.map((c) => `ray${r}.${c}`)).flat(), ...SCALARS];

const BASE_RATES = { addConn: 0.08, addNode: 0.03, toggle: 0.02, removeNode: 0.01 };
const isOut = (id) => id >= N_IN && id < N_IN + N_OUT;

function ioNodes() {
  const nodes = [];
  for (let i = 0; i < N_IN; i++) nodes.push({ id: i, type: 'in', bias: 0, tau: 1 });
  for (let o = 0; o < N_OUT; o++) nodes.push({ id: N_IN + o, type: 'out', bias: 0, tau: 1 });
  return nodes;
}

// Input ids a creature with `rays` rays can actually use (ray slots are centre-out, so slots < rays).
// Social senses (kin, hearing) are silent for founders, so founder links skip them; mutation can add them.
// Body senses are silent in kinematic mode, so founders there skip them too.
const SOCIAL = new Set(['kinNear', 'hear0', 'hear1', 'hear2', 'hear3', 'hearSin', 'hearCos', 'hearKin', 'heard0', 'heard1', 'heard2', 'heard3', 'heard4', 'heard5', 'heardThreat', 'heardFood', 'heardKin']);
const BODY_SENSE = (name) => /^(osc|joint|touch)|^(upY|pitch|roll|fwdSpeed|stamina)$/.test(name);
export const usableInputs = (rays, physical = false) => [...Array.from({ length: Math.min(rays, RAY_CAP) * 3 }, (_, i) => i),
  ...SCALARS.flatMap((name, i) => (SOCIAL.has(name) || (!physical && BODY_SENSE(name)) ? [] : [RAY_CAP * 3 + i]))];
export const JOINT_OUT = OUTPUTS.indexOf('j0');
// What new links may use: kinematic bodies ignore body senses and joints; physical ones ignore turn/throttle and joints they lack.
export function linkable(rays, physical, joints) {
  const social = SCALARS.flatMap((name, i) => (SOCIAL.has(name) ? [RAY_CAP * 3 + i] : []));
  const tools = ['grab', 'drop', 'use'].map((k) => OUTPUTS.indexOf(k));
  const outputs = physical ? [2, 3, 4, 5, 6, ...Array.from({ length: Math.min(joints, MAX_JOINTS) }, (_, j) => JOINT_OUT + j), ...tools] : [0, 1, 2, 3, 4, 5, 6, ...tools];
  return { inputs: new Set([...usableInputs(rays, physical), ...social]), outputs: new Set(outputs) };
}

// outputs: output indices founders may wire (default: turn/throttle/attack/reproduce).
export function createBrain(rng, links = rng.int(4, 8), inputs = null, outputs = null) {
  const conns = [], seen = new Set();
  while (conns.length < links) {
    const from = inputs ? inputs[rng.int(0, inputs.length - 1)] : rng.int(0, N_IN - 1);
    const to = N_IN + (outputs ? outputs[rng.int(0, outputs.length - 1)] : rng.int(0, CORE_OUTPUTS - 1)), key = `${from}>${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    conns.push({ from, to, w: rng.gauss(), on: true, p: 0 });
  }
  return { nodes: ioNodes(), conns, lr: rng.range(0, 0.1) };
}

export const cloneBrain = (b) => ({ nodes: b.nodes.map((n) => ({ ...n })), conns: b.conns.map((c) => ({ ...c })), lr: b.lr ?? 0 });

// rate: the world mutation rate (0.08 default). probs overrides per-birth structural probabilities (tests).
// allowed (optional): { inputs: Set, outputs: Set } of output indices — new links only use what the body can use.
export function mutateBrain(b, rate, rng, nextId, probs = null, allowed = null) {
  const m = cloneBrain(b), scale = rate / 0.08;
  const p = probs ? { addConn: 0, addNode: 0, toggle: 0, removeNode: 0, jitter: rate, ...probs }
    : { ...Object.fromEntries(Object.entries(BASE_RATES).map(([k, v]) => [k, v * scale])), jitter: rate };
  for (const c of m.conns) {
    if (rng.next() < p.jitter) c.w = rng.next() < 0.1 ? rng.gauss() : c.w + rng.gauss() * 0.3;
    if (rng.next() < p.jitter) c.p = Math.max(-1, Math.min(1, (c.p || 0) + rng.gauss() * 0.3));
  }
  if (rng.next() < p.jitter) m.lr = Math.max(0, Math.min(0.3, m.lr + rng.gauss() * 0.03));
  for (const n of m.nodes) {
    if (n.type === 'in' || rng.next() >= p.jitter) continue;
    n.bias += rng.gauss() * 0.2;
    if (n.type === 'hid') n.tau = Math.min(20, Math.max(1, n.tau * Math.exp(rng.gauss() * 0.3)));
  }
  if (rng.next() < p.addConn) {
    const ok = (n) => !allowed || n.type === 'hid' || (n.type === 'in' ? allowed.inputs.has(n.id) : allowed.outputs.has(n.id - N_IN));
    const sources = m.nodes.filter(ok), from = sources[rng.int(0, sources.length - 1)].id;
    const targets = m.nodes.filter((n) => n.type !== 'in' && ok(n));
    const to = targets[rng.int(0, targets.length - 1)].id;
    const existing = m.conns.find((c) => c.from === from && c.to === to);
    if (existing) existing.on = true; else m.conns.push({ from, to, w: rng.gauss() * 0.5, on: true, p: 0 });
  }
  const enabled = m.conns.filter((c) => c.on);
  if (rng.next() < p.addNode && enabled.length) {
    // Split a connection; new links start near-neutral (weight 1 in, old weight out).
    const c = enabled[rng.int(0, enabled.length - 1)], id = nextId();
    c.on = false;
    m.nodes.push({ id, type: 'hid', bias: 0, tau: 1 });
    m.conns.push({ from: c.from, to: id, w: 1, on: true, p: 0 }, { from: id, to: c.to, w: c.w, on: true, p: c.p || 0 });
  }
  if (rng.next() < p.toggle && m.conns.length) { const c = m.conns[rng.int(0, m.conns.length - 1)]; c.on = !c.on; }
  const hid = m.nodes.filter((n) => n.type === 'hid');
  if (rng.next() < p.removeNode && hid.length) {
    const gone = hid[rng.int(0, hid.length - 1)].id;
    m.nodes = m.nodes.filter((n) => n.id !== gone);
    m.conns = m.conns.filter((c) => c.from !== gone && c.to !== gone);
  }
  return m;
}

// Enabled connections keyed by from*2^32+to, cached per brain (brains are immutable once built).
const connMaps = new WeakMap();
function connMap(b) {
  let m = connMaps.get(b);
  if (!m) { m = new Map(); for (const c of b.conns) if (c.on) m.set(c.from * 2 ** 32 + c.to, c.w); connMaps.set(b, m); }
  return m;
}

export function brainDistance(a, b) {
  const ma = connMap(a), mb = connMap(b);
  let match = 0, wd = 0;
  for (const [k, w] of ma) { const o = mb.get(k); if (o !== undefined) { match++; wd += Math.abs(o - w); } }
  const disjoint = ma.size + mb.size - 2 * match;
  const n = Math.max(1, ma.size, mb.size);
  return disjoint / n + 0.4 * (match ? wd / match : 0);
}

const MAP_FIRST = RAY_CAP * RAY_CHANNELS.length + SCALARS.indexOf('mapFoodAhead');
const MAP_LAST = RAY_CAP * RAY_CHANNELS.length + SCALARS.indexOf('familiarity');

// Display stat: how much mind a creature carries (its energy cost is brainCost).
export function intelligence(b) {
  let hid = 0, on = 0, readsMap = false;
  for (const n of b.nodes) if (n.type === 'hid') hid++;
  for (const c of b.conns) if (c.on) { on++; if (c.from >= MAP_FIRST && c.from <= MAP_LAST) readsMap = true; }
  return hid + 0.25 * on + 20 * (b.lr || 0) + (readsMap ? 2 : 0);
}

// Energy/s for thinking: neurons, connections, reading the mental map, and learning.
export function brainCost(b) {
  let hid = 0, on = 0, readsMap = false;
  for (const n of b.nodes) if (n.type === 'hid') hid++;
  for (const c of b.conns) if (c.on) { on++; if (c.from >= MAP_FIRST && c.from <= MAP_LAST) readsMap = true; }
  return 0.002 * hid + 0.0004 * on + (readsMap ? 0.0005 : 0) + 0.004 * (b.lr || 0);
}

// Compiled form cached per brain object (brains are never mutated in place).
const compiled = new WeakMap();
function compile(b) {
  let k = compiled.get(b);
  if (k) return k;
  const index = new Map(b.nodes.map((n, i) => [n.id, i]));
  const incoming = b.nodes.map(() => []), plastic = [];
  b.conns.forEach((c, ci) => {
    if (!c.on) return;
    incoming[index.get(c.to)].push(index.get(c.from), ci);
    if (c.p) plastic.push(ci, index.get(c.from), index.get(c.to), c.p);
  });
  const outIdx = Array.from({ length: N_OUT }, (_, o) => index.get(N_IN + o));
  k = { index, incoming, outIdx, plastic, weights: initWeights(b), scratch: new Float32Array(b.nodes.length) };
  compiled.set(b, k);
  return k;
}

export const newState = (b) => new Float32Array(b.nodes.length);

// One synchronous update from the previous activations (so loops carry memory), with leaky integration.
// Genome weights as a per-connection array; creatures learn on their own copy.
export const initWeights = (b) => Float32Array.from(b.conns, (c) => c.w);

// pre (optional, per creature) receives the activations that fed this step; learn() needs it,
// and keeping it on the creature lets saves continue identically.
export function runBrain(b, state, inputs, out, weights = null, pre = null) {
  const k = compile(b), { incoming, outIdx } = k, nodes = b.nodes, w = weights || k.weights, scratch = pre || k.scratch;
  for (let i = 0; i < N_IN; i++) state[i] = inputs[i]; // input nodes are always ids 0..N_IN-1 at indices 0..N_IN-1
  scratch.set(state);
  for (let j = N_IN; j < nodes.length; j++) {
    const n = nodes[j], inc = incoming[j];
    let s = n.bias;
    for (let q = 0; q < inc.length; q += 2) s += w[inc[q + 1]] * scratch[inc[q]];
    const target = n.type === 'out' && n.id !== N_IN && n.id < N_IN + JOINT_OUT ? 1 / (1 + Math.exp(-s)) : Math.tanh(s); // turn and joints are signed
    state[j] = n.tau === 1 ? target : state[j] + (target - state[j]) / n.tau;
  }
  for (let o = 0; o < N_OUT; o++) out[o] = state[outIdx[o]];
  return out;
}

// Reward-modulated Hebbian update on a creature's working weights, after runBrain:
// pre = activation that fed this step, post = new activation. Weights stay within ±4.
export function learn(b, pre, state, weights, reward) {
  if (!b.lr || Math.abs(reward) < 1e-6) return;
  const { plastic } = compile(b), rate = b.lr * reward, scratch = pre;
  for (let q = 0; q < plastic.length; q += 4) {
    const ci = plastic[q];
    weights[ci] = Math.max(-4, Math.min(4, weights[ci] + rate * plastic[q + 3] * scratch[plastic[q + 1]] * state[plastic[q + 2]]));
  }
}
