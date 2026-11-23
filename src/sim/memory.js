// Per-creature mental map: a coarse wrapping grid of food/danger/visit memories stored as Int8 (compact, deterministic).
const CH = ['food', 'danger', 'visits'];

export function createMap(W, cell) {
  const n = Math.max(2, Math.ceil(W / cell));
  return { n, cell: W / n, food: new Int8Array(n * n), danger: new Int8Array(n * n), visits: new Int8Array(n * n) };
}

export function mapIndex(m, x, z) {
  const i = ((Math.floor(x / m.cell) % m.n) + m.n) % m.n, j = ((Math.floor(z / m.cell) % m.n) + m.n) % m.n;
  return j * m.n + i;
}

export function remember(m, x, z, ch, amount) {
  const k = mapIndex(m, x, z), arr = m[ch];
  arr[k] = Math.max(-127, Math.min(127, arr[k] + Math.round(amount * 127)));
}

export const recall = (m, x, z, ch) => m[ch][mapIndex(m, x, z)] / 127;

export function fade(m) {
  for (const ch of CH) { const a = m[ch]; for (let i = 0; i < a.length; i++) a[i] = Math.trunc(a[i] * 0.95); }
}

export function inheritMap(m) {
  const k = { n: m.n, cell: m.cell };
  for (const ch of CH) k[ch] = m[ch].map((v) => Math.trunc(v / 2));
  return k;
}

export function encodeMap(m) {
  return { n: m.n, cell: m.cell, ...Object.fromEntries(CH.map((ch) => [ch, toB64(m[ch])])) };
}
export function decodeMap(o) {
  return { n: o.n, cell: o.cell, ...Object.fromEntries(CH.map((ch) => [ch, new Int8Array(fromB64(o[ch]))])) };
}

// Base64 for typed arrays in both Node and browsers.
export function toB64(a) {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s) {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
