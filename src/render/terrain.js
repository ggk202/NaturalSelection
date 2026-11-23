// Cosmetic terrain height (the simulation is 2D). Periodic in x and z so the torus wraps seamlessly.
export function makeHeightAt(W) {
  const k = (2 * Math.PI) / W;
  return (x, z) => 0.9 * Math.sin(2 * k * x) * Math.cos(3 * k * z) + 0.6 * Math.sin(5 * k * x + 1) * Math.sin(4 * k * z + 2);
}
