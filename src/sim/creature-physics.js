// Physical creatures: one rigid box per body part, revolute joints with position motors driven by the brain.
// All bodies rest with the creature's heading rotation; each box's own orientation lives on its collider,
// so a joint's axis is the same vector in both bodies' frames (no snapping at spawn).
import { RAPIER } from './physics.js';
import { expandBody, qmul, qrot } from './bodyplan.js';
import { MAX_JOINTS, JOINT_OUT } from './neat.js';
import { BIOME } from './biomes.js';

export const PHYS_PARTS = MAX_JOINTS + 1;
const SUBSTEPS = 3;
const MOTOR = 1000; // motor stiffness per unit joint strength (acceleration-based); weaker motors stall against ground friction
// shortcut: 15 collision groups, so ~1 in 15 creature pairs pass through each other; fine at current densities.
const groupsOf = (id) => { const g = 1 + (id % 15); return ((1 << g) << 16) | (0xffff & ~(1 << g)); };
const MAX_LIN = 12, MAX_ANG = 10; // speed caps: no free-energy launches or spins
const BALANCE = 40; // righting torque per unit balance gene and mass, plus matching damping
const GRIP = 40; // 1/s sideways drag on touching parts; keep GRIP·substep < 1 for stability
const v3 = (a) => ({ x: a[0], y: a[1], z: a[2] });
const q4 = (q) => ({ x: q[0], y: q[1], z: q[2], w: q[3] });
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
const arr = (q) => [q.x, q.y, q.z, q.w];
const density = (p) => (p.covering === 'shell' ? 1.6 : p.covering === 'fur' ? 1.1 : 1);

// The part that carries the mouth (else the most eyes): it defines where the creature "is" and faces.
function headIndex(parts) {
  let best = 0, score = -1;
  parts.forEach((p, i) => { const s = p.mouth * 10 + p.eyes; if (s > score) { score = s; best = i; } });
  return best;
}

export function buildBody(world, c, x, z, heading) {
  const pw = world.physics.world, parts = expandBody(c.genome.body, PHYS_PARTS);
  const hq = [0, Math.sin(-heading / 2), 0, Math.cos(-heading / 2)]; // yaw about +y (heading measured toward +z)
  let low = 0;
  for (const p of parts) low = Math.min(low, p.pos[1] - Math.max(...p.size) / 2);
  const y0 = world.terrain.heightAt(x, z) + 0.2 - low;
  const bodies = [], joints = [];
  for (const p of parts) {
    const at = qrot(hq, p.pos);
    const rb = pw.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x + at[0], y0 + at[1], z + at[2])
      .setRotation(q4(hq)).setLinearDamping(0.1).setAngularDamping(0.5).setCanSleep(false)); // motors don't wake sleeping bodies
    pw.createCollider(RAPIER.ColliderDesc.cuboid(p.size[0] / 2, p.size[1] / 2, p.size[2] / 2).setRotation(q4(p.rot))
      .setDensity(density(p)).setFriction(0.05).setRestitution(0).setCollisionGroups(groupsOf(c.id)), rb); // own parts never collide // near-frictionless: GRIP gives directional traction
    bodies.push(rb.handle);
    if (p.parent < 0) continue;
    const parent = parts[p.parent], j = p.joint;
    const a1 = j.anchor.map((v, i) => v - parent.pos[i]), a2 = j.anchor.map((v, i) => v - p.pos[i]);
    const joint = pw.createImpulseJoint(RAPIER.JointData.revolute(v3(a1), v3(a2), v3(j.axis)), pw.getRigidBody(bodies[p.parent]), rb, true);
    joint.setContactsEnabled(false);
    joint.setLimits(j.lo, j.hi);
    joints.push(joint.handle);
  }
  c.ph = { bodies, joints, head: headIndex(parts) };
  c.parts = parts;
  c.stamina = c.stats.endurance;
  c.spin = 0; c.upright = 1; c.rolling = false;
}

export function removeBody(world, c) {
  if (!c.ph) return;
  const pw = world.physics.world;
  for (const h of c.ph.bodies) { const b = pw.getRigidBody(h); if (b) pw.removeRigidBody(b); }
  c.ph = null;
}

// Hinge angle of a joint from the two bodies' rotations (both start at the same rest rotation).
function jointAngle(pw, c, j) {
  const p = c.parts[j + 1], q1 = arr(pw.getRigidBody(c.ph.bodies[p.parent]).rotation()), q2 = arr(pw.getRigidBody(c.ph.bodies[j + 1]).rotation());
  const r = qmul(conj(q1), q2), ax = p.joint.axis;
  return 2 * Math.atan2(r[0] * ax[0] + r[1] * ax[1] + r[2] * ax[2], r[3]);
}

// Brain outputs j0.. (tanh, -1..1) set each joint's target within its limits. Returns muscle effort.
export function applyMotors(world, c, outputs) {
  const pw = world.physics.world, tired = c.stamina <= 0 ? 0.3 : 1;
  let effort = 0;
  c.ph.joints.forEach((h, j) => {
    const p = c.parts[j + 1].joint, o = outputs[JOINT_OUT + j];
    const target = p.lo + ((o + 1) / 2) * (p.hi - p.lo), angle = jointAngle(pw, c, j);
    { const k = MOTOR * p.strength * tired; pw.getImpulseJoint(h).configureMotorPosition(target, k, 2 * Math.sqrt(k)); } // critically damped
    effort += p.strength * Math.abs(target - angle);
  });
  return effort;
}

// Body senses: rhythm, posture, forward speed, stamina, joint angles and touch (writes into the input vector).
export function senseBody(world, c, out, S) {
  const t = world.time;
  [0.5, 1, 2].forEach((hz, k) => { const ph = 2 * Math.PI * hz * t + c.id; out[S[`osc${k}s`]] = Math.sin(ph); out[S[`osc${k}c`]] = Math.cos(ph); });
  if (!c.ph) return;
  const pw = world.physics.world, root = pw.getRigidBody(c.ph.bodies[0]), rq = arr(root.rotation());
  out[S.upY] = qrot(rq, [0, 1, 0])[1];
  out[S.pitch] = qrot(rq, [1, 0, 0])[1];
  out[S.roll] = qrot(rq, [0, 0, 1])[1];
  const v = root.linvel();
  out[S.fwdSpeed] = Math.max(-1, Math.min(1, (v.x * Math.cos(c.heading) + v.z * Math.sin(c.heading)) / 5));
  out[S.stamina] = Math.max(0, c.stamina / c.stats.endurance);
  for (let j = 0; j < MAX_JOINTS; j++) {
    if (j < c.ph.joints.length) {
      const jp = c.parts[j + 1].joint, a = jointAngle(pw, c, j);
      out[S[`joint${j}`]] = Math.max(-1, Math.min(1, (2 * (a - jp.lo)) / (jp.hi - jp.lo || 1) - 1));
      const b = pw.getRigidBody(c.ph.bodies[j + 1]).translation(), sz = c.parts[j + 1].size;
      out[S[`touch${j}`]] = b.y - Math.max(...sz) / 2 - world.terrain.heightAt(b.x, b.z) < 0.15 ? 1 : 0;
    } else { out[S[`joint${j}`]] = 0; out[S[`touch${j}`]] = 0; }
  }
}

// Advance physics one sim step: water buoyancy/drag, substeps, then sync positions and wrap the torus.
// Forces are recomputed every substep: velocity-based grip held across substeps overshoots and pumps energy.
function applyForces(world) {
  const pw = world.physics.world, t = world.terrain;
  for (const c of world.creatures) {
    if (!c.ph) continue;
    c.ph.bodies.forEach((h, i) => {
      const b = pw.getRigidBody(h), p = b.translation(), part = c.parts[i], s = part.size;
      const wet = t.biomeAt(p.x, p.z) === BIOME.lake && p.y < t.waterHeight;
      const lv = b.linvel(), av = b.angvel(), ls = Math.hypot(lv.x, lv.y, lv.z), as = Math.hypot(av.x, av.y, av.z);
      if (ls > MAX_LIN) b.setLinvel({ x: lv.x * MAX_LIN / ls, y: lv.y * MAX_LIN / ls, z: lv.z * MAX_LIN / ls }, true);
      if (as > MAX_ANG) b.setAngvel({ x: av.x * MAX_ANG / as, y: av.y * MAX_ANG / as, z: av.z * MAX_ANG / as }, true);
      const touching = p.y - Math.max(...s) / 2 - t.heightAt(p.x, p.z) < 0.15;
      b.resetForces(false);
      b.resetTorques(false);
      if (i === 0 && c.stats.balance > 0) { // balance reflex: turn the torso's up axis back toward world up, damp tipping
        // Gains are bounded by the torso's inertia per substep, or small torsos overshoot and jitter.
        const I = b.principalInertia(), Imin = Math.min(I.x, I.z), h = world.settings.dt / SUBSTEPS;
        const up = qrot(arr(b.rotation()), [0, 1, 0]), k = Math.min(BALANCE * c.stats.balance * b.mass(), 0.25 * Imin / (h * h));
        const d = Math.min(2 * Math.sqrt(BALANCE) * c.stats.balance * b.mass(), 0.5 * Imin / h);
        b.addTorque({ x: -k * up[2] - d * av.x, y: 0, z: k * up[0] - d * av.z }, true); // k·(up × ŷ), damped
      }
      b.setLinearDamping(wet ? 2 : 0.1);
      b.setAngularDamping(touching ? 4 : 0.5); // rolling resistance on the ground
      if (wet) b.addForce({ x: 0, y: 1.2 * 9.81 * s[0] * s[1] * s[2] * density(part), z: 0 }, true);
      // Directional ground grip (scales, claws): parts on the ground resist sliding sideways far more than
      // along their length, which is what turns wiggling into crawling.
      else if (touching) {
        const a = qrot(qmul(arr(b.rotation()), part.rot), [1, 0, 0]), v = b.linvel(), m = b.mass();
        const along = v.x * a[0] + v.y * a[1] + v.z * a[2];
        b.addForce({ x: -GRIP * m * (v.x - along * a[0]), y: 0, z: -GRIP * m * (v.z - along * a[2]) }, true);
      }
    });
  }
}

// Advance physics one sim step (substeps), then sync positions and wrap the torus.
export function stepPhysics(world) {
  const pw = world.physics.world, t = world.terrain, W = world.settings.worldSize, dt = world.settings.dt;
  for (let k = 0; k < SUBSTEPS; k++) { applyForces(world); world.physics.step(dt / SUBSTEPS); }
  applyForces(world); // final speed clamp after the last substep
  for (const c of world.creatures) {
    if (!c.ph) continue;
    const root = pw.getRigidBody(c.ph.bodies[0]).translation();
    const shift = root.x < 0 ? W : root.x >= W ? -W : 0, shiftZ = root.z < 0 ? W : root.z >= W ? -W : 0;
    if (shift || shiftZ) for (const h of c.ph.bodies) { const b = pw.getRigidBody(h), p = b.translation(); b.setTranslation({ x: p.x + shift, y: p.y, z: p.z + shiftZ }, true); }
    const head = pw.getRigidBody(c.ph.bodies[c.ph.head]), hp = head.translation();
    const fwd = qrot(qmul(arr(head.rotation()), c.parts[c.ph.head].rot), [1, 0, 0]);
    c.x = world.wrap(hp.x); c.z = world.wrap(hp.z); c.y = hp.y;
    // Roller detector: smoothed body spin and uprightness of the root.
    const rb = pw.getRigidBody(c.ph.bodies[0]), w = rb.angvel();
    c.spin = 0.9 * c.spin + 0.1 * Math.hypot(w.x, w.y, w.z);
    c.upright = 0.9 * c.upright + 0.1 * qrot(arr(rb.rotation()), [0, 1, 0])[1];
    c.rolling = c.spin > 3 || c.upright < 0.3;
    if (Math.abs(fwd[0]) + Math.abs(fwd[2]) > 1e-3) c.heading = (Math.atan2(fwd[2], fwd[0]) + 2 * Math.PI) % (2 * Math.PI);
    // Safety net: a body that has gone non-finite or fallen through the ground is dead.
    if (!Number.isFinite(hp.x + hp.y + hp.z) || hp.y < t.heightAt(c.x, c.z) - 5) c.physicsFault = true;
  }
}

// Eating and biting need a steady, upright head: rolling bodies can't feed.
export function headSteady(world, c) {
  if (!c.ph) return true;
  const b = world.physics.world.getRigidBody(c.ph.bodies[c.ph.head]), w = b.angvel();
  const up = qrot(arr(b.rotation()), [0, 1, 0])[1]; // bodies rest upright (yaw only), whatever the head part's shape
  return Math.hypot(w.x, w.y, w.z) < 3 && up > 0.3;
}
