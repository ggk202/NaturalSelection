// The player's creature: a customizable body driven by keyboard/touch input instead of a brain.
// It eats, gets hurt and dies like anyone, never reproduces or ages out, and can speak syllables.
import { TEMPLATES } from './bodyplan.js';
import { createBrain } from './neat.js';
import { createRng } from './rng.js';

export const PLAYER_DEFAULTS = { template: 'quadruped', size: 1, hue: 0.12, eyes: 2, diet: 0.3, grippers: true, wings: false, fins: false };
const plate = (flag) => ({ size: [1.3, 0.08, 1], covering: 'none', eyes: 0, eyeSize: 0.5, mouth: 0, antennae: 0, gripper: false, [flag]: true, edges: [] });
const pairEdge = (to, pitch) => ({ to, face: 4, u: 0, v: 0, yaw: 0, pitch, axis: 'z', lo: -0.8, hi: 0.8, strength: 1, recur: 1, symmetric: true });

export function playerGenome(opts = {}) {
  const o = { ...PLAYER_DEFAULTS, ...opts }, body = TEMPLATES[o.template] ? TEMPLATES[o.template]() : TEMPLATES.quadruped();
  for (const n of body.nodes) n.size = n.size.map((s) => s * o.size);
  const head = body.nodes.find((n) => n.eyes) || body.nodes[0];
  head.eyes = Math.max(0, Math.min(6, Math.round(o.eyes)));
  if (o.grippers) body.nodes.forEach((n, i) => { if (i > 0 && !n.eyes && !n.mouth) n.gripper = true; });
  if (o.wings) { body.nodes.push(plate('wing')); body.nodes[0].edges.push(pairEdge(body.nodes.length - 1, 0)); }
  if (o.fins) { body.nodes.push({ ...plate('fin'), size: [0.6, 0.06, 0.5] }); body.nodes[0].edges.push(pairEdge(body.nodes.length - 1, -0.4)); }
  Object.assign(body, { diet: o.diet, hue: o.hue, reproThreshold: 0.95, balance: 1, attention: 6 });
  return { body, brain: createBrain(createRng(1), 0) };
}

export function spawnPlayer(w, opts, x, z) {
  const old = w.creatures.find((c) => c.player);
  if (old) w.killCreature(old.id);
  const c = w.spawn(playerGenome(opts), x, z);
  c.player = true;
  c.playerOpts = { ...PLAYER_DEFAULTS, ...opts };
  c.energy = c.stats.maxEnergy * 0.8;
  w.playerInput = newInput();
  w.emit({ type: 'god', action: 'player', id: c.id });
  return c;
}

export const newInput = () => ({ turn: 0, throttle: 0, attack: false, grab: false, drop: false, use: false, say: [], newWord: false, speaking: false }); // the UI times words in real time

// Builds this step's "brain outputs" from the input (one-shot actions are consumed).
export function playerOutputs(w, c, o, OUT) {
  const inp = w.playerInput || (w.playerInput = newInput());
  o.fill(0);
  o[0] = inp.turn; o[1] = inp.throttle;
  o[2] = inp.attack ? 1 : 0; o[3] = 0; // never reproduces
  if (inp.grab) o[OUT.grab] = 1;
  if (inp.drop) o[OUT.drop] = 1;
  if (inp.use) o[OUT.use] = 1;
  inp.grab = inp.drop = inp.use = false;
  return o;
}

// Syllable buttons: the UI marks the first press of a word (newWord) and keeps `speaking` on until a pause;
// the word is voiced every step while speaking.
export function playerSpeak(w, c) {
  const inp = w.playerInput;
  if (inp && inp.say.length) {
    if (inp.newWord) { w.endWord(c); inp.newWord = false; }
    for (const s of inp.say.splice(0)) if ((c.word || (c.word = [])).length < 6) c.word = [...c.word, s];
  }
  if (inp && inp.speaking && c.word && c.word.length) {
    w.newCalls.push({ x: c.x, z: c.z, syll: c.word[c.word.length - 1], loud: 1, id: c.id, genome: c.genome, word: c.word });
    c.said = c.word[c.word.length - 1];
  } else { c.said = -1; w.endWord(c); }
}

// Physical bodies: assisted control sets the body's horizontal velocity and yaw rate directly.
export function steerPhysical(w, c) {
  const inp = w.playerInput || newInput(), pw = w.physics.world, speed = 3 * Math.max(-0.5, Math.min(1, inp.throttle));
  const vx = Math.cos(c.heading) * speed, vz = Math.sin(c.heading) * speed;
  c.ph.bodies.forEach((h, i) => {
    const b = pw.getRigidBody(h), v = b.linvel();
    b.setLinvel({ x: vx, y: v.y, z: vz }, true);
    if (i === 0) b.setAngvel({ x: 0, y: -2 * inp.turn, z: 0 }, true); // heading grows toward +z, i.e. negative yaw
  });
}
