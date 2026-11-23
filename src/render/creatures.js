import * as THREE from '../../vendor/three.module.min.js';
import { placeParts, MAX_PARTS } from './parts.js';
import { traitsOf } from '../sim/genome.js';

const GEOMS = {
  body: () => new THREE.IcosahedronGeometry(1, 0),
  leg: () => new THREE.CylinderGeometry(1, 0.7, 1, 5),
  digit: () => new THREE.ConeGeometry(1, 1, 4),
  eye: () => new THREE.IcosahedronGeometry(1, 0),
  antenna: () => new THREE.CylinderGeometry(1, 1, 1, 4),
  mouth: () => new THREE.ConeGeometry(1, 1, 5),
};
const FIXED_COLOR = { eye: 0xf4f4f0, mouth: 0x3a2a2a };

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
const color = new THREE.Color(), limbColor = new THREE.Color(), red = new THREE.Color(0xd8402a);

// Local part matrices are cached per genome object (god-mode mutate replaces the genome, invalidating it).
const localCache = new WeakMap();
function localParts(genome) {
  let p = localCache.get(genome);
  if (!p) {
    p = placeParts(traitsOf(genome)).map((part) => ({
      type: part.type,
      matrix: new THREE.Matrix4().compose(v.fromArray(part.position), q.setFromEuler(e.set(...part.rotation)), sc.fromArray(part.scale)),
    }));
    localCache.set(genome, p);
  }
  return p;
}

export function creatureColor(body, target = new THREE.Color()) {
  return target.setHSL(body.hue, 0.55, 0.55).lerp(red, Math.max(0, body.diet - 0.3) / 0.7 * 0.8);
}

export function createCreatureRenderer(scene, maxCreatures, heightAt) {
  const meshes = {};
  for (const type of Object.keys(GEOMS)) {
    const mat = new THREE.MeshLambertMaterial({ flatShading: true, color: FIXED_COLOR[type] ?? 0xffffff });
    const mesh = new THREE.InstancedMesh(GEOMS[type](), mat, maxCreatures * MAX_PARTS[type]);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    meshes[type] = mesh;
  }
  const bodyIds = []; // instance index -> creature id, for picking
  const world = new THREE.Matrix4();

  function update(creatures, time) {
    const counts = Object.fromEntries(Object.keys(meshes).map((k) => [k, 0]));
    bodyIds.length = 0;
    for (const c of creatures) {
      const moving = c.lastOutputs[1] > 0.3;
      const bob = moving ? Math.abs(Math.sin(time * 12 + c.id)) * 0.08 * traitsOf(c.genome).size : 0;
      world.compose(v.set(c.x, heightAt(c.x, c.z) + bob, c.z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -c.heading), sc.set(1, 1, 1));
      creatureColor(traitsOf(c.genome), color);
      limbColor.copy(color).multiplyScalar(0.7);
      for (const part of localParts(c.genome)) {
        const mesh = meshes[part.type], i = counts[part.type]++;
        if (i >= mesh.instanceMatrix.count) continue;
        mesh.setMatrixAt(i, m4.multiplyMatrices(world, part.matrix));
        if (part.type === 'body' || part.type === 'leg' || part.type === 'antenna' || part.type === 'digit') {
          mesh.setColorAt(i, part.type === 'body' ? color : limbColor);
        }
        if (part.type === 'body') bodyIds[i] = c.id;
      }
    }
    for (const [type, mesh] of Object.entries(meshes)) {
      mesh.count = Math.min(counts[type], mesh.instanceMatrix.count);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  return { update, bodyMesh: meshes.body, idAt: (i) => bodyIds[i] };
}
