// Evolvable recurrent brains (NEAT-style structure growth, asexual so no innovation table).
// Node ids: inputs 0..N_IN-1, outputs N_IN..N_IN+N_OUT-1, hidden from a world-level counter.
export const RAY_CAP = 13; // max rays any creature can have (eyes 0..6 -> 1..13 rays)
export const RAY_CHANNELS = ['food', 'creature', 'obstacle'];
export const SCALARS = ['energy', 'temperature', 'tempGradient', 'biomeFood', 'biomeDanger', 'cover', 'slopeAhead', 'waterAhead', 'hazardDist', 'bias'];
export const N_IN = RAY_CAP * RAY_CHANNELS.length + SCALARS.length;
export const OUTPUTS = ['turn', 'throttle', 'attack', 'reproduce'];
export const N_OUT = OUTPUTS.length;
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
export const usableInputs = (rays) => [...Array.from({ length: Math.min(rays, RAY_CAP) * 3 }, (_, i) => i), ...SCALARS.map((_, i) => RAY_CAP * 3 + i)];

export function createBrain(rng, links = rng.int(4, 8), inputs = null) {
  const conns = [], seen = new Set();
  while (conns.length < links) {
    const from = inputs ? inputs[rng.int(0, inputs.length - 1)] : rng.int(0, N_IN - 1), to = N_IN + rng.int(0, N_OUT - 1), key = `${from}>${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    conns.push({ from, to, w: rng.gauss(), on: true, p: 0 });
  }
  return { nodes: ioNodes(), conns, lr: rng.range(0, 0.1) };
}

export const cloneBrain = (b) => ({ nodes: b.nodes.map((n) => ({ ...n })), conns: b.conns.map((c) => ({ ...c })), lr: b.lr ?? 0 });

// rate: the world mutation rate (0.08 default). probs overrides per-birth structural probabilities (tests).
export function mutateBrain(b, rate, rng, nextId, probs = null) {
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
    const from = m.nodes[rng.int(0, m.nodes.length - 1)].id;
    const targets = m.nodes.filter((n) => n.type !== 'in');
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

export function brainCost(b) {
  let hid = 0, on = 0;
  for (const n of b.nodes) if (n.type === 'hid') hid++;
  for (const c of b.conns) if (c.on) on++;
  return 0.002 * hid + 0.0004 * on;
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

export function runBrain(b, state, inputs, out, weights = null) {
  const k = compile(b), { incoming, outIdx, scratch } = k, nodes = b.nodes, w = weights || k.weights;
  for (let i = 0; i < N_IN; i++) state[i] = inputs[i]; // input nodes are always ids 0..N_IN-1 at indices 0..N_IN-1
  scratch.set(state);
  for (let j = N_IN; j < nodes.length; j++) {
    const n = nodes[j], inc = incoming[j];
    let s = n.bias;
    for (let q = 0; q < inc.length; q += 2) s += w[inc[q + 1]] * scratch[inc[q]];
    const target = n.type === 'out' && n.id !== N_IN ? 1 / (1 + Math.exp(-s)) : Math.tanh(s);
    state[j] = n.tau === 1 ? target : state[j] + (target - state[j]) / n.tau;
  }
  for (let o = 0; o < N_OUT; o++) out[o] = state[outIdx[o]];
  return out;
}

// Reward-modulated Hebbian update on a creature's working weights, after runBrain:
// pre = activation that fed this step, post = new activation. Weights stay within ±4.
export function learn(b, state, weights, reward) {
  if (!b.lr || !reward) return;
  const { plastic, scratch } = compile(b), rate = b.lr * reward;
  for (let q = 0; q < plastic.length; q += 4) {
    const ci = plastic[q];
    weights[ci] = Math.max(-4, Math.min(4, weights[ci] + rate * plastic[q + 3] * scratch[plastic[q + 1]] * state[plastic[q + 2]]));
  }
}
