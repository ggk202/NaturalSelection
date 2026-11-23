import { GENES, genomeDistance, cloneGenome } from './genome.js';

export const SYLLABLES = ['ka', 'ru', 'mi', 'to'];
const MEANINGS = [['threat', 'alarm'], ['food', 'food'], ['kin', 'kin']];
const add = (o, ctx) => { o.n++; if (ctx.threat) o.threat++; if (ctx.food) o.food++; if (ctx.kin) o.kin++; };
const halve = (o) => { for (const k of Object.keys(o)) o[k] = Math.floor(o[k] / 2); };

const INT_GENES = GENES.filter((g) => g.int).map((g) => g.key);
const MIN_ANNOUNCE = 10;
const REVERT_WINDOW = 300; // s: flipping back to a value announced this recently is noise, not a milestone

// Keeps every 'first' and 'new-species' milestone plus the most recent other checkpoints.
export function capCheckpoints(list, max = 200) {
  if (list.length <= max) return list;
  const milestone = (c) => c.kind === 'first' || c.kind === 'new-species' || c.kind === 'colonized';
  const keepOthers = max - list.filter(milestone).length;
  let others = list.filter((c) => !milestone(c)).length;
  return list.filter((c) => milestone(c) || others-- <= keepOthers);
}

// Records an announced value; returns false if it just reverts to a recently announced value.
function fresh(s, key, value, time) {
  const recent = (s.recent[key] ||= []).filter((r) => time - r.time < REVERT_WINDOW);
  const isFresh = !recent.some((r) => r.value === value);
  if (isFresh) recent.push({ value, time });
  s.recent[key] = recent;
  return isFresh;
}

export class SpeciesTracker {
  constructor({ threshold = 0.25 } = {}) {
    this.threshold = threshold;
    this.species = [];
    this.nextId = 1;
    this.nextCheckpointId = 1;
    this.seenLegs = null; // global "first N-legged lineage"
    this.firstCarnivores = false;
    this.firstMeaning = {};
  }

  // biomeOf(creature) -> biome key; optional so callers without terrain still work.
  // Signal statistics per species: contexts at each call vs. contexts in general (base rates).
  sigOf(c) {
    const s = c.speciesId != null && this.species.find((x) => x.id === c.speciesId);
    if (!s) return null;
    return (s.sig ||= { calls: SYLLABLES.map(() => ({ n: 0, threat: 0, food: 0, kin: 0 })), base: { n: 0, threat: 0, food: 0, kin: 0 } });
  }
  noteContext(c, ctx) { const g = this.sigOf(c); if (g) add(g.base, ctx); }
  noteCall(c, syll, ctx) { const g = this.sigOf(c); if (g) add(g.calls[syll], ctx); }

  // A syllable means a context when it reliably accompanies it (≥60%) well above chance (≥2× base rate).
  meanings(s, time, cp) {
    const g = s.sig;
    if (!g || !g.base.n) return;
    s.lexicon ||= {};
    s.meant ||= {};
    SYLLABLES.forEach((name, k) => {
      const c = g.calls[k];
      if (c.n < 50) return;
      for (const [ctx, label] of MEANINGS) {
        const p = c[ctx] / c.n, base = g.base[ctx] / g.base.n;
        if (p < 0.6 || p < 2 * base) continue;
        s.lexicon[name] = label;
        if (s.meant[`${name}:${ctx}`]) continue;
        s.meant[`${name}:${ctx}`] = true;
        cp(s, 'first', `Species ${s.id} evolved ${label === 'alarm' ? 'an alarm' : `a ${label}`} call ("${name}")`);
        if (!this.firstMeaning[ctx]) { this.firstMeaning[ctx] = true; cp(s, 'first', `First ${label} call`); }
      }
    });
    // Keep the statistics recent: halve once a species has called a lot.
    if (g.calls.reduce((a, c) => a + c.n, 0) > 2000) { for (const c of g.calls) halve(c); halve(g.base); }
  }

  // Ambush milestones: once globally, once per species.
  noteAmbush(c, time) {
    const out = [], s = this.species.find((x) => x.id === c.speciesId);
    const make = (title) => out.push({ id: this.nextCheckpointId++, time, speciesId: c.speciesId, kind: 'first', title, genome: cloneGenome(c.genome), avgBody: { ...(s ? s.avgBody : c.genome.body) } });
    if (!this.firstAmbush) { this.firstAmbush = true; make('First ambush'); }
    if (s && !s.ambushed) { s.ambushed = true; make(`Species ${s.id}: first ambush`); }
    return out;
  }

  update(creatures, time, biomeOf = null) {
    for (const s of this.species) { s.members = []; }
    for (const c of creatures) {
      let sp = this.species.find((s) => genomeDistance(s.repGenome, c.genome) < this.threshold);
      if (!sp) {
        sp = { id: this.nextId++, repGenome: cloneGenome(c.genome), firstSeen: time, announced: false, members: [] };
        this.species.push(sp);
      }
      sp.members.push(c);
      c.speciesId = sp.id;
    }
    this.species = this.species.filter((s) => s.members.length > 0);

    const out = [];
    const cp = (s, kind, title) => out.push({
      id: this.nextCheckpointId++, time, speciesId: s.id, kind, title,
      genome: cloneGenome(s.members[0].genome), avgBody: { ...s.avgBody },
    });
    const initLegs = this.seenLegs === null;
    if (initLegs) this.seenLegs = new Set();

    for (const s of this.species) {
      s.count = s.members.length;
      s.avgBody = {};
      for (const { key } of GENES) s.avgBody[key] = s.members.reduce((a, c) => a + c.genome.body[key], 0) / s.count;
      const tally = {};
      for (const c of s.members) if (c.label) tally[c.label] = (tally[c.label] || 0) + 1;
      s.dominantLabel = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || null;
      const prevCounts = s.biomeCounts || {};
      s.biomeCounts = {};
      if (biomeOf) for (const c of s.members) { const b = biomeOf(c); s.biomeCounts[b] = (s.biomeCounts[b] || 0) + 1; }
      s.homeBiome = Object.keys(s.biomeCounts).sort((a, b) => s.biomeCounts[b] - s.biomeCounts[a])[0] || null;
      const legs = Math.round(s.avgBody.legs);
      if (initLegs) this.seenLegs.add(legs); // founders don't count as "firsts"

      if (!s.announced) {
        if (s.count < MIN_ANNOUNCE) continue;
        s.announced = true;
        s.shown = Object.fromEntries(INT_GENES.map((k) => [k, Math.round(s.avgBody[k])]));
        s.carnivore = s.avgBody.diet > 0.5;
        s.shownLabel = s.dominantLabel;
        s.recent = {};
        for (const k of INT_GENES) fresh(s, k, s.shown[k], time);
        fresh(s, 'diet', s.carnivore, time);
        if (s.shownLabel) fresh(s, 'label', s.shownLabel, time);
        if (initLegs) continue;
        cp(s, 'new-species', `Species ${s.id} emerged (${s.count} members, ${legs} legs)`);
      } else {
        // Hysteresis: only announce when the average is clearly past the next whole number.
        for (const k of INT_GENES) {
          const avg = s.avgBody[k], prev = s.shown[k];
          if (Math.abs(avg - prev) >= 0.75) {
            const now = Math.round(avg);
            if (fresh(s, k, now, time)) cp(s, 'body-shift', `Species ${s.id}: ${k} ${prev} → ${now}`);
            s.shown[k] = now;
          }
        }
        const carn = s.carnivore ? s.avgBody.diet > 0.4 : s.avgBody.diet > 0.6;
        if (carn !== s.carnivore) {
          s.carnivore = carn;
          if (fresh(s, 'diet', carn, time)) cp(s, 'body-shift', `Species ${s.id} became ${carn ? 'carnivorous' : 'herbivorous'}`);
        }
        if (s.dominantLabel && s.shownLabel && s.dominantLabel !== s.shownLabel) {
          if (fresh(s, 'label', s.dominantLabel, time)) cp(s, 'behavior-shift', `Species ${s.id}: ${s.shownLabel} → ${s.dominantLabel}`);
        }
        if (s.dominantLabel) s.shownLabel = s.dominantLabel;
        s.colonized ||= {};
        for (const [b, n] of Object.entries(s.biomeCounts)) {
          if (b !== s.homeBiome && n >= 8 && (prevCounts[b] || 0) < 2 && !s.colonized[b]) {
            s.colonized[b] = true;
            cp(s, 'colonized', `Species ${s.id} colonized the ${b}`);
          }
        }
      }
      if (s.announced) this.meanings(s, time, cp);
      if (s.carnivore && !this.firstCarnivores) {
        this.firstCarnivores = true;
        if (!initLegs) cp(s, 'first', 'First carnivores evolved');
      }
      if (!this.seenLegs.has(legs)) {
        this.seenLegs.add(legs);
        if (!initLegs) cp(s, 'first', `First ${legs}-legged lineage`);
      }
    }
    return out;
  }
}
