// Evolving disease and random disasters.
// Disease: contact-spread strains that mutate on transmission (virulence, contagion, duration evolve);
// recovery gives immunity to that strain; the resistance gene trades upkeep for protection.
// Disasters: wildfire and flood are growing/fixed hazard zones (sensed like hazards), drought stops a biome's food.
import { BIOME, BIOMES } from './biomes.js';
import { traitsOf, cloneGenome } from './genome.js';

const CONTACT = 1.5, SPREAD_EVERY = 4, MUTATE = 0.05, MAX_IMMUNE = 8;
export const DISASTER_KINDS = ['wildfire', 'flood', 'drought'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function threatCheckpoint(w, title, c = null) {
  const t = w.tracker, g = c ? c.genome : w.creatures[0]?.genome;
  if (!g) return;
  const cp = { id: t.nextCheckpointId++, time: w.time, speciesId: c ? c.speciesId : null, kind: 'threat', title, genome: cloneGenome(g), avgBody: { ...traitsOf(g) } };
  w.checkpoints.push(cp);
  w.emit({ type: 'checkpoint', checkpoint: cp });
}

// ---------- disease ----------
export function newStrain(w, parent = null) {
  const j = (v, s, a, b) => clamp(v * Math.exp(w.rng.gauss() * s), a, b);
  const s = parent
    ? { virulence: j(parent.virulence, 0.25, 0.01, 1), contagion: j(parent.contagion, 0.25, 0.05, 3), duration: j(parent.duration, 0.2, 5, 180) }
    : { virulence: w.rng.range(0.05, 0.2), contagion: w.rng.range(0.3, 1), duration: w.rng.range(20, 60) };
  const strain = { id: w.nextId++, parent: parent ? parent.id : null, ...s };
  w.strains.push(strain);
  return strain;
}

export function infect(w, c, strain) {
  if (c.sick || (c.immune && c.immune.includes(strain.id))) return false;
  c.sick = { strain: strain.id, until: w.time + strain.duration };
  return true;
}

export function startOutbreak(w, c = null) {
  if (!w.creatures.length) return null;
  c ||= w.creatures[w.rng.int(0, w.creatures.length - 1)];
  const s = newStrain(w);
  infect(w, c, s);
  threatCheckpoint(w, `Outbreak: strain ${s.id} (${s.virulence > 0.12 ? 'deadly' : 'mild'}, ${s.contagion > 0.7 ? 'very contagious' : 'contagious'})`, c);
  return s;
}

export function stepDisease(w) {
  const dt = w.settings.dt, env = w.settings.env;
  const byId = new Map(w.strains.map((s) => [s.id, s]));
  let active = 0;
  const spread = w.stepCount % SPREAD_EVERY === 0;
  for (const c of w.creatures) {
    if (!c.alive || !c.sick) continue;
    const s = byId.get(c.sick.strain), r = c.stats.resistance || 0;
    if (!s || w.time >= c.sick.until) { (c.immune ||= []).push(c.sick.strain); if (c.immune.length > MAX_IMMUNE) c.immune.shift(); c.sick = null; continue; }
    active++;
    const drain = s.virulence * (1 - 0.5 * r) * dt;
    c.energy -= drain;
    if (!spread) continue;
    w.creatureGrid.query(c.x, c.z, CONTACT, (o) => {
      if (o === c || !o.alive || o.sick) return;
      if (Math.hypot(w.delta(c.x, o.x), w.delta(c.z, o.z)) > CONTACT) return;
      if (w.rng.next() >= s.contagion * dt * SPREAD_EVERY * (1 - 0.8 * (o.stats.resistance || 0))) return;
      infect(w, o, w.rng.next() < MUTATE ? newStrain(w, s) : s);
    });
  }
  if (env.diseases !== false && active === 0 && w.time >= w.nextOutbreakAt) {
    startOutbreak(w);
    w.nextOutbreakAt = w.time + w.rng.range(120, 240);
  }
  if (w.stepCount % 100 === 0) { // forget strains nobody carries
    const live = new Set(w.creatures.filter((c) => c.sick).map((c) => c.sick.strain));
    w.strains = w.strains.filter((s) => live.has(s.id));
  }
}

// ---------- disasters ----------
function randomPointIn(w, biome) {
  const W = w.settings.worldSize;
  for (let i = 0; i < 200; i++) {
    const x = w.rng.range(0, W), z = w.rng.range(0, W);
    if (w.terrain.biomeAt(x, z) === biome) return { x, z };
  }
  return null;
}

export function startDisaster(w, kind = DISASTER_KINDS[w.rng.int(0, DISASTER_KINDS.length - 1)]) {
  if (kind === 'wildfire' || kind === 'flood') {
    const p = randomPointIn(w, kind === 'wildfire' ? BIOME.forest : BIOME.lake);
    if (!p) return null;
    const h = { id: w.nextId++, x: p.x, z: p.z, kind, r: kind === 'wildfire' ? 2 : 20, until: w.time + (kind === 'wildfire' ? 40 : 60) };
    w.env.hazards.push(h);
    threatCheckpoint(w, kind === 'wildfire' ? 'Wildfire in the forest' : 'Flood around a lake');
    return h;
  }
  const options = [BIOME.plains, BIOME.forest, BIOME.wetland], biome = options[w.rng.int(0, options.length - 1)];
  w.drought = { biome, until: w.time + 90 };
  for (const f of w.food) if (w.terrain.biomeAt(f.x, f.z) === biome && w.rng.next() < 0.5) f.eaten = true;
  threatCheckpoint(w, `Drought in the ${BIOMES[biome].key}`);
  return w.drought;
}

export function stepDisasters(w) {
  const dt = w.settings.dt;
  for (const h of w.env.hazards) {
    if (h.kind !== 'wildfire') continue;
    h.r = Math.min(15, h.r + 0.4 * dt);
    if (w.stepCount % 20 === 0) { // burn food and objects inside
      const inside = (o) => Math.hypot(w.delta(h.x, o.x), w.delta(h.z, o.z)) <= h.r;
      for (const f of w.food) if (inside(f)) f.eaten = true;
      for (const o of w.objects) if (o.holder == null && inside(o)) o.gone = true;
    }
  }
  if (w.env.hazards.some((h) => h.until != null && w.time >= h.until)) w.env.hazards = w.env.hazards.filter((h) => h.until == null || w.time < h.until);
  if (w.drought && w.time >= w.drought.until) w.drought = null;
  if (w.settings.env.disasters !== false && w.time >= w.nextDisasterAt) {
    startDisaster(w);
    w.nextDisasterAt = w.time + w.rng.range(180, 300);
  }
}

// Energy/s a hazard zone costs this creature.
export function hazardDamage(w, c, h) {
  if (h.kind === 'wildfire') return 3;
  if (h.kind === 'flood') return c.stats.flies ? 0 : 1.5 * (1 - c.stats.swim);
  return w.settings.env.hazardDamage;
}
