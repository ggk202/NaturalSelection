import * as THREE from '../../vendor/three.module.min.js';

// Loose and carried objects (tool use), one instanced mesh per kind.
const KINDS = {
  stone: [() => new THREE.DodecahedronGeometry(0.22, 0), 0x8d8a85],
  stick: [() => new THREE.CylinderGeometry(0.04, 0.05, 1.1, 5).rotateZ(Math.PI / 2), 0x7a5532],
  spear: [() => new THREE.ConeGeometry(0.06, 1.2, 5).rotateZ(-Math.PI / 2), 0xc9b48a],
  nut: [() => new THREE.IcosahedronGeometry(0.14, 0), 0x6b4a2b],
  seed: [() => new THREE.TetrahedronGeometry(0.1), 0xd8d070],
  sprout: [() => new THREE.ConeGeometry(0.12, 0.35, 5).translate(0, 0.17, 0), 0x7fd45a],
  crop: [() => new THREE.IcosahedronGeometry(0.6, 0).translate(0, 0.5, 0), 0x2f9a3a],
};

export function createObjectRenderer(scene, max, heightAt) {
  const meshes = {};
  for (const [k, [geo, color]] of Object.entries(KINDS)) {
    const mesh = new THREE.InstancedMesh(geo(), new THREE.MeshLambertMaterial({ color, flatShading: true }), max);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.name = `obj-${k}`;
    scene.add(mesh);
    meshes[k] = mesh;
  }
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  function update(world) {
    const n = Object.fromEntries(Object.keys(meshes).map((k) => [k, 0]));
    for (const o of world.objects) {
      const k = o.type === 'stick' && o.sharp ? 'spear' : o.type, mesh = meshes[k];
      if (!mesh || n[k] >= max) continue;
      const lift = o.holder != null ? 0.9 : k === 'stick' || k === 'spear' ? 0.06 : 0.12;
      q.setFromAxisAngle(Y, (o.id * 2.39) % 6.28);
      mesh.setMatrixAt(n[k]++, m.compose(v.set(o.x, heightAt(o.x, o.z) + lift, o.z), q, s));
    }
    for (const [k, mesh] of Object.entries(meshes)) { mesh.count = n[k]; mesh.instanceMatrix.needsUpdate = true; }
  }
  function dispose() { for (const mesh of Object.values(meshes)) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); } }
  return { update, dispose };
}
