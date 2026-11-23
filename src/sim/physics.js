// Rapier physics (deterministic build, wasm inlined). Initialised once at import.
import RAPIER_NS from '../../vendor/rapier/rapier.js';

export const RAPIER = RAPIER_NS.default || RAPIER_NS;
await RAPIER.init();

const MARGIN = 16; // terrain extends past the world edge so bodies near the wrap stand on ground

// Terrain as a heightfield over [-MARGIN, W+MARGIN]² sampled from the (wrapping) terrain map.
function terrainCollider(world, terrain) {
  const W = terrain.W, res = terrain.res, span = W + 2 * MARGIN, n = Math.round(span / res);
  const heights = new Float32Array((n + 1) * (n + 1));
  // Rapier heightfields are column-major: index = col * (nrows + 1) + row, rows along z, cols along x.
  for (let col = 0; col <= n; col++) for (let row = 0; row <= n; row++) {
    const x = -MARGIN + (col * span) / n, z = -MARGIN + (row * span) / n;
    heights[col * (n + 1) + row] = terrain.heightAt(x, z);
  }
  const desc = RAPIER.ColliderDesc.heightfield(n, n, heights, { x: span, y: 1, z: span })
    .setTranslation(W / 2, 0, W / 2).setFriction(1).setCollisionGroups((1 << 16) | 0xffff); // ground: group 0, hits everything
  return world.createCollider(desc);
}

export function createPhysics(terrain, snapshot = null) {
  const world = snapshot ? RAPIER.World.restoreSnapshot(snapshot) : new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const heightCollider = snapshot ? null : terrainCollider(world, terrain);
  return {
    world, heightCollider,
    step(dt) { world.timestep = dt; world.step(); },
    snapshot: () => world.takeSnapshot(),
  };
}
