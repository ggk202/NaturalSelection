import { World } from './world.js';
import { Environment } from './environment.js';
import { deriveStats } from './body.js';
import { cloneBrain, brainCost } from './neat.js';

export const SCHEMA_VERSION = 3; // 3: evolvable brains + vision rays

const g2j = (g) => ({ body: { ...g.body }, brain: cloneBrain(g.brain) });
const j2g = g2j;

export function serializeWorld(w) {
  const t = w.tracker;
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: w.settings, time: w.time, rng: w.rng.state(), nextId: w.nextId,
    nextLabelAt: w.nextLabelAt, nextSpeciesAt: w.nextSpeciesAt,
    creatures: w.creatures.map(({ stats, threatNear, genome, lastOutputs, brainState, brainUpkeep, ...c }) => ({ ...c, genome: g2j(genome), lastOutputs: Array.from(lastOutputs), brainState: Array.from(brainState) })),
    nextNodeId: w.nextNodeId,
    food: w.food.map((f) => ({ ...f })),
    hazards: w.env.hazards.map((h) => ({ ...h })),
    elite: w.elite.map((e) => ({ children: e.children, genome: g2j(e.genome) })),
    eliteCarn: w.eliteCarn.map((e) => ({ children: e.children, genome: g2j(e.genome) })),
    carnivoresSeen: w.carnivoresSeen,
    tracker: {
      threshold: t.threshold, nextId: t.nextId, nextCheckpointId: t.nextCheckpointId,
      seenLegs: t.seenLegs ? [...t.seenLegs] : null, firstCarnivores: t.firstCarnivores, firstAmbush: !!t.firstAmbush,
      species: t.species.map(({ members, repGenome, ...s }) => ({ ...s, repGenome: g2j(repGenome) })),
    },
    stats: { interval: w.stats.interval, series: w.stats.series },
    checkpoints: w.checkpoints.map((c) => ({ ...c, genome: g2j(c.genome) })),
  };
}

export function deserializeWorld(o) {
  if (!o || o.schemaVersion !== SCHEMA_VERSION) throw new Error(`schema: unsupported save version ${o && o.schemaVersion}`);
  const w = new World({ ...o.settings, initialCreatures: 0 });
  w.settings = o.settings;
  w.time = o.time; w.nextId = o.nextId; w.nextNodeId = o.nextNodeId;
  w.nextLabelAt = o.nextLabelAt; w.nextSpeciesAt = o.nextSpeciesAt;
  w.creatures = o.creatures.map((c) => {
    const genome = j2g(c.genome);
    return { ...c, genome, stats: deriveStats(genome.body), lastOutputs: Float32Array.from(c.lastOutputs), brainState: Float32Array.from(c.brainState), brainUpkeep: brainCost(genome.brain), actionCounters: { ...c.actionCounters } };
  });
  w.food = o.food.map((f) => ({ ...f }));
  w.env = new Environment(o.settings.env, w.rng, o.settings.worldSize, () => 0);
  w.env.hazards = o.hazards.map((h) => ({ ...h }));
  w.rng.setState(o.rng); // after Environment, which consumes rng
  w.elite = o.elite.map((e) => ({ children: e.children, genome: j2g(e.genome) }));
  w.eliteCarn = o.eliteCarn.map((e) => ({ children: e.children, genome: j2g(e.genome) }));
  w.carnivoresSeen = o.carnivoresSeen;
  const t = w.tracker, ot = o.tracker;
  Object.assign(t, { threshold: ot.threshold, nextId: ot.nextId, nextCheckpointId: ot.nextCheckpointId, firstCarnivores: ot.firstCarnivores, firstAmbush: ot.firstAmbush });
  t.seenLegs = ot.seenLegs ? new Set(ot.seenLegs) : null;
  t.species = ot.species.map((s) => ({ ...s, repGenome: j2g(s.repGenome), members: [] }));
  w.stats.interval = o.stats.interval;
  w.stats.series = o.stats.series;
  w.checkpoints = o.checkpoints.map((c) => ({ ...c, genome: j2g(c.genome) }));
  w.events = [];
  return w;
}
