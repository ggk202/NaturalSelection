import * as THREE from '../../vendor/three.module.min.js';
import { createRng } from '../sim/rng.js';
import { BIOME } from '../sim/biomes.js';

// Decorative instanced props per biome. Own RNG so they never perturb the simulation.
const KINDS = {
  trees: { biome: BIOME.forest, perCell: 0.66, geom: () => new THREE.ConeGeometry(1, 2.6, 6).translate(0, 2.6, 0), color: 0x2f6b34, scale: [0.8, 1.6] },
  trunks: { follows: 'trees', geom: () => new THREE.CylinderGeometry(0.18, 0.25, 1.4, 5).translate(0, 0.7, 0), color: 0x6b4a2f },
  rocks: { biome: BIOME.mountain, perCell: 0.2, geom: () => new THREE.DodecahedronGeometry(1, 0), color: 0x7d776e, scale: [0.4, 1.4] },
  cacti: { biome: BIOME.desert, perCell: 0.13, geom: () => new THREE.CylinderGeometry(0.25, 0.3, 1.8, 6).translate(0, 0.9, 0), color: 0x5e8c3a, scale: [0.7, 1.3] },
};
const CAP = 3000;

export function createProps(terrain, seed) {
  const rng = createRng((seed * 7919 + 13) >>> 0), group = new THREE.Group();
  const placed = { trees: [], rocks: [], cacti: [] };
  let total = 0;
  for (let k = 0; k < terrain.biome.length && total < CAP; k++) {
    for (const name of ['trees', 'rocks', 'cacti']) {
      const kind = KINDS[name];
      if (terrain.biome[k] !== kind.biome || rng.next() > kind.perCell) continue;
      const x = ((k % terrain.n) + rng.next()) * terrain.res, z = (Math.floor(k / terrain.n) + rng.next()) * terrain.res;
      placed[name].push({ x, z, y: terrain.heightAt(x, z), s: rng.range(...kind.scale), r: rng.range(0, Math.PI * 2) });
      total++;
    }
  }
  placed.trunks = placed.trees;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [name, list] of Object.entries(placed)) {
    const mesh = new THREE.InstancedMesh(KINDS[name].geom(), new THREE.MeshLambertMaterial({ color: KINDS[name].color, flatShading: true }), Math.max(1, list.length));
    mesh.name = name;
    mesh.count = list.length;
    list.forEach((p, i) => mesh.setMatrixAt(i, m.compose(v.set(p.x, p.y - 0.1, p.z), q.setFromAxisAngle(up, p.r), sc.setScalar(p.s))));
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
