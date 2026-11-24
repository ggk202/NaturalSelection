import * as THREE from '../../vendor/three.module.min.js';
import { traitsOf } from '../sim/genome.js';
import { expandBody } from '../sim/bodyplan.js';
import { PHYS_PARTS } from '../sim/creature-physics.js';

// Instanced meshes: one box per body part plus organs placed in each part's frame (x = along the part).
const GEOMS = {
  segments: () => new THREE.BoxGeometry(1, 1, 1),
  eyes: () => new THREE.IcosahedronGeometry(1, 0),
  mouths: () => new THREE.ConeGeometry(1, 1, 5).rotateZ(-Math.PI / 2), // points along +x
  antennae: () => new THREE.CylinderGeometry(1, 1, 1, 4).translate(0, 0.5, 0),
  spikes: () => new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0),
  claws: () => new THREE.ConeGeometry(1, 1, 4).rotateZ(-Math.PI / 2),
};
const PER_CREATURE = { segments: PHYS_PARTS + 8, eyes: 12, mouths: 2, antennae: 8, spikes: 24, claws: 16 };
const FIXED_COLOR = { eyes: 0xf4f4f0, mouths: 0x3a2a2a, claws: 0x2c2620 };
const red = new THREE.Color(0xd8402a), fur = new THREE.Color(0x9a7a55), wingC = new THREE.Color(0xf2efe6), finC = new THREE.Color(0x3d7fc4), sickC = new THREE.Color(0x9bbf3a);

export function creatureColor(traits, target = new THREE.Color()) {
  return target.setHSL(traits.hue, 0.55, 0.55).lerp(red, Math.max(0, traits.diet - 0.3) / 0.7 * 0.8);
}

// Organs of one part, in the part's own frame: [type, position, scale, rotation (euler)].
export function organsOf(p) {
  const [l, h, w] = p.size, out = [];
  for (let i = 0; i < p.eyes; i++) {
    const side = p.eyes === 1 ? 0 : (i / (p.eyes - 1) - 0.5) * w * 0.8, r = 0.09 * p.eyeSize + 0.04;
    out.push(['eyes', [l / 2, h * 0.25, side], [r, r, r], [0, 0, 0]]);
  }
  if (p.mouth > 0) out.push(['mouths', [l / 2 + 0.1 * p.mouth, -h * 0.15, 0], [0.22 * p.mouth, 0.12 * p.mouth, 0.12 * p.mouth], [0, 0, 0]]);
  for (let i = 0; i < p.antennae; i++) {
    const side = p.antennae === 1 ? 0 : (i / (p.antennae - 1) - 0.5) * w * 0.7;
    out.push(['antennae', [l * 0.3, h / 2, side], [0.02, 0.45, 0.02], [0, 0, -0.5]]);
  }
  if (p.covering === 'spikes') for (let i = 0; i < 3; i++) out.push(['spikes', [(i - 1) * l * 0.3, h / 2, 0], [0.06, 0.25, 0.06], [0, 0, 0]]);
  if (p.gripper) for (const s of [-1, 1]) out.push(['claws', [l / 2 + 0.06, 0, s * w * 0.3], [0.12, 0.04, 0.04], [0, s * 0.4, 0]]);
  return out;
}

const restCache = new WeakMap();
const restParts = (genome) => { let p = restCache.get(genome.body); if (!p) { p = expandBody(genome.body, PHYS_PARTS); restCache.set(genome.body, p); } return p; };

export function createCreatureRenderer(scene, maxCreatures, heightAt) {
  const meshes = {};
  for (const type of Object.keys(GEOMS)) {
    const mat = new THREE.MeshLambertMaterial({ flatShading: true, color: FIXED_COLOR[type] ?? 0xffffff });
    const mesh = new THREE.InstancedMesh(GEOMS[type](), mat, maxCreatures * PER_CREATURE[type]);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.name = type;
    scene.add(mesh);
    meshes[type] = mesh;
  }
  const ids = []; // segment instance -> creature id, for picking
  const partM = new THREE.Matrix4(), m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const s = new THREE.Vector3(), e = new THREE.Euler(), hq = new THREE.Quaternion(), color = new THREE.Color(), tint = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0);

  function update(world) {
    const counts = Object.fromEntries(Object.keys(meshes).map((k) => [k, 0]));
    const put = (type, matrix, col) => {
      const mesh = meshes[type], i = counts[type]++;
      if (i >= mesh.instanceMatrix.count) return -1;
      mesh.setMatrixAt(i, matrix);
      if (col) mesh.setColorAt(i, col);
      return i;
    };
    const pw = world.physics && world.physics.world;
    ids.length = 0;
    for (const c of world.creatures) {
      const parts = c.parts || restParts(c.genome);
      creatureColor(traitsOf(c.genome), color);
      if (c.sick) color.lerp(sickC, 0.5);
      if (!c.ph) { // kinematic: rest pose under the creature, lifted so the lowest part touches the ground
        let low = 0;
        for (const p of parts) low = Math.min(low, p.pos[1] - Math.max(...p.size) / 2);
        hq.setFromAxisAngle(UP, -c.heading);
        v.set(c.x, heightAt(c.x, c.z) - low, c.z);
      }
      parts.forEach((p, k) => {
        if (c.ph) {
          const b = pw.getRigidBody(c.ph.bodies[k]);
          if (!b) return;
          const t = b.translation(), r = b.rotation();
          partM.compose(s.set(t.x, t.y, t.z), q.set(r.x, r.y, r.z, r.w).multiply(q2.fromArray(p.rot)), s.clone().set(1, 1, 1));
        } else {
          const at = s.fromArray(p.pos).applyQuaternion(hq).add(v);
          partM.compose(at, q.copy(hq).multiply(q2.fromArray(p.rot)), new THREE.Vector3(1, 1, 1));
        }
        tint.copy(color);
        if (p.covering === 'fur') tint.lerp(fur, 0.5); else if (p.covering === 'shell') tint.multiplyScalar(0.55);
        if (p.wing) tint.lerp(wingC, 0.6); else if (p.fin) tint.lerp(finC, 0.6);
        const i = put('segments', m.copy(partM).multiply(new THREE.Matrix4().makeScale(...p.size)), tint);
        if (i >= 0) ids[i] = c.id;
        for (const [type, pos, scl, rot] of organsOf(p)) {
          put(type, m.copy(partM).multiply(new THREE.Matrix4().compose(v.clone().fromArray(pos), q2.clone().setFromEuler(e.set(...rot)), new THREE.Vector3(...scl))), type === 'spikes' ? tint : null);
        }
      });
    }
    for (const [type, mesh] of Object.entries(meshes)) {
      mesh.count = Math.min(counts[type], mesh.instanceMatrix.count);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  return { update, bodyMesh: meshes.segments, idAt: (i) => ids[i] };
}
