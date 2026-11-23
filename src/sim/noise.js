// Seeded value noise that tiles with the given integer period (in lattice units), fractal over octaves.
export function periodicNoise(rng, period, octaves = 4) {
  const layers = [];
  for (let o = 0; o < octaves; o++) {
    const p = period << o;
    const lattice = new Float32Array(p * p);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
    layers.push({ p, lattice, amp: 0.5 ** o });
  }
  const total = layers.reduce((a, l) => a + l.amp, 0);
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    let sum = 0;
    for (const { p, lattice, amp } of layers) {
      const x = u * (p / period), y = v * (p / period);
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
      const i0 = ((x0 % p) + p) % p, j0 = ((y0 % p) + p) % p, i1 = (i0 + 1) % p, j1 = (j0 + 1) % p;
      const a = lattice[j0 * p + i0], b = lattice[j0 * p + i1], c = lattice[j1 * p + i0], d = lattice[j1 * p + i1];
      sum += amp * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy);
    }
    return sum / total;
  };
}
