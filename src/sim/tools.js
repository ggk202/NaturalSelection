// Tool use: loose objects (stones, sticks, nuts, seeds) that creatures with grippers can carry and use.
// Stones crack nuts and can be thrown; a stick sharpened on a stone is a spear, or a trap when dropped;
// three placed objects make a shelter; a seed dropped on fertile land grows into a crop.
import { BIOME, BIOMES } from './biomes.js';
import { traitsOf } from './genome.js';

export const OBJ_TYPES = ['stone', 'stick', 'nut', 'seed', 'sprout', 'crop'];
export const OBJ_CODE = { stone: 0.25, stick: 0.5, nut: 0.75, seed: 1 };
const CARRY = new Set(['stone', 'stick', 'nut', 'seed']);
const BUILD = new Set(['stone', 'stick']);
export const GRAB_DEX = 0.2, ACT_ON = 0.6;
const CAPS = { stone: 40, stick: 40, nut: 60 }; // per 200×200 area
const NUT_ENERGY = 4, THROW_DMG = 2.5, TRAP_DMG = 4, SPEAR = 0.6, SPROUT_TIME = 40, CROP_LIFE = 240, CROP_EVERY = 4;
const SHELTER_R = 2.5;

const reachOf = (c) => 0.5 * traitsOf(c.genome).size + 0.8;

export function initObjects(w) {
  w.objects = [];
  for (let i = 0; i < 40 * w.areaScale; i++) spawnNatural(w);
}

// Stones lie on mountains and deserts, sticks and nuts under trees.
function spawnNatural(w) {
  const W = w.settings.worldSize, x = w.rng.range(0, W), z = w.rng.range(0, W), b = w.terrain.biomeAt(x, z);
  const type = b === BIOME.forest ? (w.rng.next() < 0.5 ? 'stick' : 'nut') : b === BIOME.mountain || b === BIOME.desert ? 'stone' : null;
  if (!type || w.objects.filter((o) => o.type === type).length >= CAPS[type] * w.areaScale) return;
  w.objects.push({ id: w.nextId++, type, x, z, holder: null });
}

export function rebuildObjectGrid(w) {
  w.objectGrid.clear();
  for (const o of w.objects) if (o.holder == null) w.objectGrid.insert(o);
}

function nearest(w, c, r, pred) {
  let best = null, bd = r;
  w.objectGrid.query(c.x, c.z, r, (o) => {
    if (o.gone || o.holder != null || !pred(o)) return;
    const d = Math.hypot(w.delta(c.x, o.x), w.delta(c.z, o.z));
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}

export const heldOf = (w, c) => (c.held != null ? w.objects.find((o) => o.id === c.held) || null : null);

// Inputs: nearest loose carryable object (distance, angle, type), what is held, a nut within reach; shelter state.
export function senseObjects(w, c, out, S) {
  const o = nearest(w, c, c.stats.senseRange, (o) => CARRY.has(o.type));
  if (o) {
    out[S.objDist] = Math.hypot(w.delta(c.x, o.x), w.delta(c.z, o.z)) / c.stats.senseRange;
    let a = Math.atan2(w.delta(c.z, o.z), w.delta(c.x, o.x)) - c.heading;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    out[S.objAngle] = a / Math.PI;
    out[S.objType] = OBJ_CODE[o.type];
  } else { out[S.objDist] = 1; out[S.objAngle] = 0; out[S.objType] = 0; }
  const h = heldOf(w, c);
  out[S.holding] = h ? OBJ_CODE[h.type] + (h.sharp ? 0.1 : 0) : 0;
  out[S.nutNear] = nearest(w, c, reachOf(c), (o) => o.type === 'nut') ? 1 : 0;
  let n = 0;
  w.objectGrid.query(c.x, c.z, SHELTER_R, (o) => { if (o.placed && BUILD.has(o.type) && Math.hypot(w.delta(c.x, o.x), w.delta(c.z, o.z)) <= SHELTER_R) n++; });
  c.sheltered = n >= 3;
  out[S.sheltered] = c.sheltered ? 1 : 0;
}

// Brain outputs grab / drop / use (dead-zone like calling, so unwired outputs do nothing).
export function act(w, c, o, OUT) {
  if (c.useCd > 0) c.useCd--;
  if (o[OUT.grab] > ACT_ON) grab(w, c);
  if (o[OUT.drop] > ACT_ON) drop(w, c);
  if (o[OUT.use] > ACT_ON && !(c.useCd > 0)) { use(w, c); c.useCd = 20; } // at most once a second
}

export function grab(w, c) {
  if (c.held != null || c.stats.dexterity < GRAB_DEX) return false;
  const o = nearest(w, c, reachOf(c), (o) => CARRY.has(o.type));
  if (!o) return false;
  o.holder = c.id; o.placed = false; c.held = o.id;
  c.actionCounters.grabbed = (c.actionCounters.grabbed || 0) + 1;
  return true;
}

export function drop(w, c) {
  const o = heldOf(w, c);
  if (!o) return false;
  release(w, c, o, c.x, c.z);
  o.placed = true;
  if (o.sharp) { o.trapOwner = c.id; o.armedAt = w.time + 3; } // a sharp stick on the ground is a trap
  if (o.type === 'seed' && !w.terrain.isWater(o.x, o.z) && BIOMES[w.terrain.biomeAt(o.x, o.z)].fertility >= 1) {
    o.type = 'sprout'; o.growAt = w.time + SPROUT_TIME; o.planter = c.id;
  }
  if (BUILD.has(o.type)) {
    let n = 0;
    for (const p of w.objects) if (p.placed && p.holder == null && BUILD.has(p.type) && Math.hypot(w.delta(o.x, p.x), w.delta(o.z, p.z)) <= SHELTER_R) n++;
    if (n >= 3) w.milestone(c, 'shelter', 'First shelter built');
  }
  return true;
}

function release(w, c, o, x, z) {
  o.holder = null; o.x = w.wrap(x); o.z = w.wrap(z); c.held = null;
  w.objectGrid.insert(o);
}

export function use(w, c) {
  const h = heldOf(w, c);
  if (!h) return false;
  if (h.type === 'stone') {
    const nut = nearest(w, c, reachOf(c), (o) => o.type === 'nut');
    if (nut) { // crack it
      nut.gone = true;
      c.energy = Math.min(c.stats.maxEnergy, c.energy + NUT_ENERGY * w.settings.foodEnergy * c.stats.digestPlant);
      c.actionCounters.ate++;
      w.milestone(c, 'nut', 'First nut cracked with a stone');
      return true;
    }
    const t = targetAhead(w, c, 8);
    if (t) { // throw
      release(w, c, h, t.x, t.z);
      hurt(w, t, THROW_DMG, c, 'stone');
      w.milestone(c, 'throw', 'First thrown stone hit');
      return true;
    }
    return false;
  }
  if (h.type === 'stick' && !h.sharp && nearest(w, c, reachOf(c), (o) => o.type === 'stone')) {
    h.sharp = true;
    w.milestone(c, 'spear', 'First spear sharpened');
    return true;
  }
  return false;
}

// Closest creature within range and a narrow cone ahead.
function targetAhead(w, c, range) {
  let best = null, bd = range;
  w.creatureGrid.query(c.x, c.z, range, (o) => {
    if (o === c || !o.alive) return;
    const dx = w.delta(c.x, o.x), dz = w.delta(c.z, o.z), d = Math.hypot(dx, dz);
    let a = Math.atan2(dz, dx) - c.heading;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (d < bd && Math.abs(a) < 0.35) { bd = d; best = o; }
  });
  return best;
}

export function hurt(w, t, dmg, by, cause) {
  if (t.sheltered) dmg *= 0.5;
  t.energy -= dmg;
  if (t.energy > 0 || !t.alive) return;
  t.alive = false;
  if (by && by.alive) by.kills++;
  w.emit({ type: 'death', id: t.id, cause });
  w.recordElite(t);
  if (cause === 'trap' && by) w.milestone(by, 'trap', 'First trap kill');
}

export const spearBonus = (w, c) => { const h = heldOf(w, c); return h && h.sharp ? SPEAR : 0; };

// Once per step: natural respawn, traps, sprouts growing, crops fruiting, held objects following holders.
export function stepObjects(w) {
  const dt = w.settings.dt;
  if (w.rng.next() < 0.5 * dt * w.areaScale) spawnNatural(w);
  const byId = new Map(w.creatures.map((c) => [c.id, c]));
  for (const o of w.objects) {
    if (o.gone) continue;
    if (o.holder != null) {
      const c = byId.get(o.holder);
      if (!c || !c.alive) { o.holder = null; o.placed = false; if (c) c.held = null; } // dropped on death
      else { o.x = c.x; o.z = c.z; }
      continue;
    }
    if (o.sharp && w.time >= o.armedAt) {
      let victim = null;
      w.creatureGrid.query(o.x, o.z, 1, (c) => { if (!victim && c.alive && Math.hypot(w.delta(o.x, c.x), w.delta(o.z, c.z)) < 0.7) victim = c; });
      if (victim) { o.sharp = false; hurt(w, victim, TRAP_DMG, byId.get(o.trapOwner) || null, 'trap'); }
    }
    if (o.type === 'sprout' && w.time >= o.growAt) { o.type = 'crop'; o.dieAt = w.time + CROP_LIFE; o.nextFruit = w.time; }
    if (o.type === 'crop') {
      if (w.time >= o.dieAt) { o.gone = true; continue; }
      if (w.time >= o.nextFruit) {
        o.nextFruit = w.time + CROP_EVERY;
        const f = w.makeFood(o.x + w.rng.range(-1.2, 1.2), o.z + w.rng.range(-1.2, 1.2));
        f.crop = o.planter;
        w.food.push(f);
      }
    }
  }
  if (w.objects.some((o) => o.gone)) w.objects = w.objects.filter((o) => !o.gone);
}

// Eating a plant sometimes leaves a seed behind; eating a crop's fruit is a harvest.
export function onEat(w, c, f) {
  if (f.crop != null) w.milestone(c, 'harvest', 'First harvest from a planted crop');
  if (f.type === 'plant' && w.rng.next() < 0.1 && w.objects.filter((o) => o.type === 'seed').length < 60 * w.areaScale) {
    const s = { id: w.nextId++, type: 'seed', x: f.x, z: f.z, holder: null };
    w.objects.push(s);
    w.objectGrid.insert(s);
  }
}
