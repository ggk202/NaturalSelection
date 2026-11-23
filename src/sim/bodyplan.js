// Branching body-plan genome (Karl Sims style graph) with bilateral symmetry by default.
// Creature frame: forward = +x, up = +y, left/right = ±z. Mirroring flips z.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const COVERINGS = ['none', 'fur', 'shell', 'spikes'];
// Faces of a parent box: outward normals in the parent's local frame.
export const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const MIRROR_FACE = [0, 1, 2, 3, 5, 4];

// ---------- tiny vector/quaternion helpers (pure, allocation is fine at expansion time) ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
export function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
// Rotation whose local x-axis points along d (local y as close to world up as possible).
function basisQuat(d) {
  const x = norm(d), hint = Math.abs(x[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const z = norm(cross(x, hint)), y = cross(z, x);
  const m = [x, y, z]; // columns
  const tr = m[0][0] + m[1][1] + m[2][2];
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m[1][2] - m[2][1]) / s, (m[2][0] - m[0][2]) / s, (m[0][1] - m[1][0]) / s, 0.25 * s]; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; q = [0.25 * s, (m[1][0] + m[0][1]) / s, (m[2][0] + m[0][2]) / s, (m[1][2] - m[2][1]) / s]; }
  else if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; q = [(m[1][0] + m[0][1]) / s, 0.25 * s, (m[2][1] + m[1][2]) / s, (m[2][0] - m[0][2]) / s]; }
  else { const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; q = [(m[2][0] + m[0][2]) / s, (m[2][1] + m[1][2]) / s, 0.25 * s, (m[0][1] - m[1][0]) / s]; }
  const l = Math.hypot(...q);
  return q.map((v) => v / l);
}

// ---------- genome ----------
const node = (o) => ({ size: [1, 0.5, 0.5], covering: 'none', eyes: 0, eyeSize: 0.6, mouth: 0, antennae: 0, gripper: false, edges: [], ...o });
const edge = (o) => ({ to: 0, face: 1, u: 0, v: 0, yaw: 0, pitch: 0, axis: 'y', lo: -0.6, hi: 0.6, strength: 1, recur: 1, symmetric: false, ...o });

export const TEMPLATES = {
  worm: () => ({
    nodes: [
      node({ size: [0.8, 0.45, 0.45], eyes: 2, eyeSize: 0.6, mouth: 0.8, edges: [edge({ to: 1, face: 1, axis: 'y' })] }),
      node({ size: [0.8, 0.45, 0.45], edges: [edge({ to: 1, face: 0, axis: 'y', recur: 3 })] }), // face 0 = a segment's far end
    ],
  }),
  quadruped: () => ({
    nodes: [
      node({ size: [1.4, 0.55, 0.7], edges: [
        edge({ to: 1, face: 0, axis: 'z', lo: -0.4, hi: 0.4 }),
        edge({ to: 2, face: 3, u: 0.7, v: 0.8, axis: 'z', lo: -0.7, hi: 0.7, strength: 1.2, symmetric: true }),
        edge({ to: 2, face: 3, u: -0.7, v: 0.8, axis: 'z', lo: -0.7, hi: 0.7, strength: 1.2, symmetric: true }),
      ] }),
      node({ size: [0.5, 0.45, 0.45], eyes: 2, eyeSize: 0.7, mouth: 0.8 }),
      node({ size: [0.8, 0.22, 0.22] }),
    ],
  }),
  biped: () => ({
    nodes: [
      node({ size: [0.8, 0.7, 0.6], eyes: 2, eyeSize: 0.7, mouth: 0.8, edges: [
        edge({ to: 1, face: 3, u: 0, v: 0.6, axis: 'z', lo: -0.9, hi: 0.9, strength: 1.5, symmetric: true }),
      ] }),
      node({ size: [1.2, 0.28, 0.28] }),
    ],
  }),
};

export const cloneBodyPlan = (p) => ({ nodes: p.nodes.map((n) => ({ ...n, size: [...n.size], edges: n.edges.map((e) => ({ ...e })) })) });

export function randomBodyPlan(rng) {
  const names = Object.keys(TEMPLATES), p = TEMPLATES[names[rng.int(0, names.length - 1)]]();
  for (const n of p.nodes) n.size = n.size.map((s) => s * rng.range(0.8, 1.25));
  return p;
}

// ---------- expansion ----------
// Part: { index, parent, node, size, pos, rot (rest pose relative to root), anchorParent, anchorChild,
//         axis (rest frame), lo, hi, strength, mirror, ...organs }
export function expandBody(plan, maxParts = 24) {
  const parts = [];
  const root = plan.nodes[0];
  parts.push(makePart(root, 0, -1, [0, 0, 0], [0, 0, 0, 1], null, false));
  const visit = (pi, counts, mirrored) => {
    const parent = parts[pi], pn = plan.nodes[parent.node];
    for (let ei = 0; ei < pn.edges.length; ei++) {
      const e = pn.edges[ei], key = `${parent.node}:${ei}`, c = counts[key] || 0;
      if (c >= e.recur || !plan.nodes[e.to]) continue;
      const sides = e.symmetric && !(FACES[e.face][2] === 0 && Math.abs(e.v) < 1e-6) ? [false, true] : [false];
      for (const flip of sides) {
        if (parts.length >= maxParts) return;
        const m = mirrored !== flip;
        const ci = parts.length;
        parts.push(attach(plan.nodes[e.to], e.to, parent, pi, e, m));
        visit(ci, { ...counts, [key]: c + 1 }, m);
      }
    }
  };
  visit(0, {}, false);
  parts.forEach((p, i) => (p.index = i));
  return parts;
}

function makePart(n, nodeIndex, parent, pos, rot, joint, mirror) {
  return { parent, node: nodeIndex, size: [...n.size], pos, rot, joint, mirror, covering: n.covering, eyes: n.eyes, eyeSize: n.eyeSize, mouth: n.mouth, antennae: n.antennae, gripper: n.gripper };
}

function attach(n, nodeIndex, parent, parentIndex, e, mirror) {
  const face = mirror ? MIRROR_FACE[e.face] : e.face, normal = FACES[face];
  const v = mirror ? -e.v : e.v, yaw = mirror ? -e.yaw : e.yaw;
  const hs = scale(parent.size, 0.5);
  // Anchor on the parent's face: centre of face + offsets along the two tangent axes.
  const t = normal[0] ? [[0, 1, 0], [0, 0, 1]] : normal[1] ? [[1, 0, 0], [0, 0, 1]] : [[1, 0, 0], [0, 1, 0]];
  const local = add(add([normal[0] * hs[0], normal[1] * hs[1], normal[2] * hs[2]], scale(t[0], e.u * hs[t[0].findIndex((x) => x)])), scale(t[1], v * hs[t[1].findIndex((x) => x)]));
  // Child direction: face normal tilted by yaw (about parent y) and pitch (about parent z), in the parent frame.
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(e.pitch), sp = Math.sin(e.pitch);
  let d = [normal[0] * cy + normal[2] * sy, normal[1], -normal[0] * sy + normal[2] * cy];
  d = [d[0] * cp - d[1] * sp, d[0] * sp + d[1] * cp, d[2]];
  const dWorld = qrot(parent.rot, norm(d));
  const anchor = add(parent.pos, qrot(parent.rot, local));
  const rot = basisQuat(dWorld);
  const pos = add(anchor, scale(dWorld, n.size[0] / 2));
  // Hinge axis in the child's frame ('y' swings sideways, 'z' swings up/down), expressed in the rest frame.
  let axis = qrot(rot, e.axis === 'y' ? [0, 1, 0] : [0, 0, 1]);
  if (mirror) axis = scale(axis, -1); // keeps mirrored limbs moving symmetrically for the same motor command
  return makePart(n, nodeIndex, parentIndex, pos, rot, { anchor, axis, lo: e.lo, hi: e.hi, strength: e.strength }, mirror);
}

// ---------- mutation ----------
export function mutateBodyPlan(plan, rate, rng) {
  const p = cloneBodyPlan(plan), scaleR = rate / 0.08, j = (v, s) => v + rng.gauss() * s;
  for (const n of p.nodes) {
    if (rng.next() < rate) n.size = n.size.map((s) => clamp(s * Math.exp(rng.gauss() * 0.15), 0.15, 2.5));
    if (rng.next() < rate * 0.3) n.covering = COVERINGS[rng.int(0, COVERINGS.length - 1)];
    if (rng.next() < rate) n.eyes = clamp(n.eyes + (rng.next() < 0.5 ? -1 : 1), 0, 6);
    if (rng.next() < rate) n.eyeSize = clamp(j(n.eyeSize, 0.1), 0.2, 1.5);
    if (rng.next() < rate) n.mouth = clamp(j(n.mouth, 0.15), 0, 1.5);
    if (rng.next() < rate) n.antennae = clamp(n.antennae + (rng.next() < 0.5 ? -1 : 1), 0, 4);
    if (rng.next() < rate * 0.2) n.gripper = !n.gripper;
    for (const e of n.edges) {
      if (rng.next() < rate) { e.u = clamp(j(e.u, 0.15), -1, 1); e.v = clamp(j(e.v, 0.15), -1, 1); }
      if (rng.next() < rate) { e.yaw = clamp(j(e.yaw, 0.2), -1.4, 1.4); e.pitch = clamp(j(e.pitch, 0.2), -1.4, 1.4); }
      if (rng.next() < rate) { e.lo = clamp(j(e.lo, 0.1), -1.5, 0); e.hi = clamp(j(e.hi, 0.1), 0, 1.5); }
      if (rng.next() < rate) e.strength = clamp(e.strength * Math.exp(rng.gauss() * 0.15), 0.2, 3);
      if (rng.next() < rate * 0.3) e.recur = clamp(e.recur + (rng.next() < 0.5 ? -1 : 1), 1, 4);
      if (rng.next() < rate * 0.1) e.axis = e.axis === 'y' ? 'z' : 'y';
      if (rng.next() < rate * 0.1) e.face = rng.int(0, 5);
      if (rng.next() < 0.005 * scaleR) e.symmetric = !e.symmetric; // rare: lopsided bodies
    }
  }
  if (rng.next() < 0.05 * scaleR) { // grow: duplicate a node with variation and attach it somewhere
    const src = p.nodes[rng.int(0, p.nodes.length - 1)];
    p.nodes.push({ ...src, size: src.size.map((s) => s * rng.range(0.7, 1.3)), edges: [] });
    p.nodes[rng.int(0, p.nodes.length - 2)].edges.push(edge({ to: p.nodes.length - 1, face: rng.int(0, 5), u: rng.range(-1, 1), v: rng.range(-1, 1), axis: rng.next() < 0.5 ? 'y' : 'z', symmetric: rng.next() < 0.8 }));
  }
  if (rng.next() < 0.05 * scaleR) { // new attachment between existing nodes
    const a = p.nodes[rng.int(0, p.nodes.length - 1)];
    a.edges.push(edge({ to: rng.int(1, Math.max(1, p.nodes.length - 1)), face: rng.int(0, 5), u: rng.range(-1, 1), v: rng.range(-1, 1), axis: rng.next() < 0.5 ? 'y' : 'z', symmetric: rng.next() < 0.8 }));
  }
  if (rng.next() < 0.03 * scaleR) { // lose an attachment
    const withEdges = p.nodes.filter((n) => n.edges.length);
    if (withEdges.length) { const n = withEdges[rng.int(0, withEdges.length - 1)]; n.edges.splice(rng.int(0, n.edges.length - 1), 1); }
  }
  return p;
}

// ---------- summaries (for species, charts, distance) ----------
export function summarizeBody(plan, maxParts = 24) {
  const parts = expandBody(plan, maxParts);
  const s = { parts: parts.length, limbs: 0, grippers: 0, fur: 0, shell: 0, spikes: 0, eyes: 0, mouth: 0, antennae: 0, mass: 0, length: 0 };
  let minX = Infinity, maxX = -Infinity;
  for (const p of parts) {
    if (p.parent >= 0 && p.size[0] >= 2 * Math.max(p.size[1], p.size[2])) s.limbs++; // elongated = limb
    if (p.gripper) s.grippers++;
    if (p.covering !== 'none') s[p.covering]++;
    s.eyes += p.eyes; s.mouth = Math.max(s.mouth, p.mouth); s.antennae += p.antennae;
    s.mass += p.size[0] * p.size[1] * p.size[2] * (p.covering === 'shell' ? 1.6 : 1);
    minX = Math.min(minX, p.pos[0] - p.size[0] / 2); maxX = Math.max(maxX, p.pos[0] + p.size[0] / 2);
  }
  s.length = maxX - minX;
  return s;
}

const SUMMARY_SCALE = { parts: 24, limbs: 20, grippers: 6, fur: 12, shell: 12, spikes: 12, eyes: 12, mouth: 1.5, antennae: 8, mass: 4, length: 6 };
export function bodyPlanDistance(a, b) {
  const sa = summarizeBody(a), sb = summarizeBody(b);
  let d = 0, n = 0;
  for (const [k, sc] of Object.entries(SUMMARY_SCALE)) { d += Math.min(1, Math.abs(sa[k] - sb[k]) / sc); n++; }
  return d / n;
}
