// Spatial hash on a torus. Objects need numeric x, z.
export class Grid {
  constructor(cellSize, worldSize) {
    this.n = Math.max(1, Math.floor(worldSize / cellSize));
    this.cs = worldSize / this.n;
    this.cells = Array.from({ length: this.n * this.n }, () => []);
  }
  clear() { for (const c of this.cells) c.length = 0; }
  idx(v) { return ((Math.floor(v / this.cs) % this.n) + this.n) % this.n; }
  insert(o) { this.cells[this.idx(o.z) * this.n + this.idx(o.x)].push(o); }
  // Calls cb for every object in cells overlapping the square of radius r (caller filters by distance).
  query(x, z, r, cb) {
    const span = Math.min(Math.ceil(r / this.cs), Math.floor((this.n - 1) / 2));
    const cx = this.idx(x), cz = this.idx(z), n = this.n;
    for (let dz = -span; dz <= span; dz++) {
      const row = ((cz + dz) % n + n) % n * n;
      for (let dx = -span; dx <= span; dx++) {
        for (const o of this.cells[row + ((cx + dx) % n + n) % n]) cb(o);
      }
    }
  }
}
