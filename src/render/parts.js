// Procedural low-poly anatomy in creature-local space (forward = +x, up = +y), scaled by size.
export function placeParts(b) {
  const s = b.size, parts = [];
  const add = (type, position, rotation, scale) => parts.push({ type, position, rotation, scale });
  const legLen = b.legs ? 0.45 * s : 0;
  const r = 0.5 * s, bodyY = legLen + r * 0.8;
  add('body', [0, bodyY, 0], [0, 0, 0], [r * 1.2, r * 0.85, r]);

  for (let i = 0; i < b.legs; i++) {
    const a = (2 * Math.PI * (i + 0.5)) / b.legs;
    const lx = Math.cos(a) * r * 0.75, lz = Math.sin(a) * r * 0.75;
    add('leg', [lx, legLen / 2 + 0.05 * s, lz], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], [0.08 * s, legLen, 0.08 * s]);
    for (let d = 0; d < b.digits; d++) {
      const da = a + ((d - (b.digits - 1) / 2) * 0.5);
      add('digit', [lx + Math.cos(da) * 0.1 * s, 0.03 * s, lz + Math.sin(da) * 0.1 * s], [0, -da, -Math.PI / 2], [0.04 * s, 0.12 * s, 0.04 * s]);
    }
  }
  for (let i = 0; i < b.eyes; i++) {
    const yaw = b.eyes === 1 ? 0 : ((i / (b.eyes - 1)) - 0.5) * 1.6;
    const pitch = 0.35 + (i % 2) * 0.2;
    const es = 0.16 * b.eyeSize * s;
    add('eye', [Math.cos(yaw) * Math.cos(pitch) * r * 1.15, bodyY + Math.sin(pitch) * r * 0.8, Math.sin(yaw) * r], [0, 0, 0], [es, es, es]);
  }
  for (let i = 0; i < b.antennae; i++) {
    const side = b.antennae === 1 ? 0 : ((i / (b.antennae - 1)) - 0.5) * 1.2;
    add('antenna', [r * 0.3, bodyY + r * 0.75 + 0.25 * s, side * r * 0.6], [side * 0.5, 0, -0.5], [0.03 * s, 0.5 * s, 0.03 * s]);
  }
  add('mouth', [r * 1.25, bodyY - r * 0.2, 0], [0, 0, -Math.PI / 2], [0.18 * b.mouth * s, 0.3 * b.mouth * s, 0.18 * b.mouth * s]);
  return parts;
}

export const MAX_PARTS = { body: 1, leg: 8, digit: 40, eye: 6, antenna: 4, mouth: 1 };
