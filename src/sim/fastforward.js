// Fast-forward: step a world until a stop condition is met (shared by the worker and tests).
import { traitsOf } from './genome.js';
import { intelligence } from './neat.js';

// Checkpoint kinds a user can wait for: matched on kind, or on the title for specific "firsts".
const CHECKPOINTS = {
  any: () => true,
  'new-species': (c) => c.kind === 'new-species',
  colonized: (c) => c.kind === 'colonized',
  'body-shift': (c) => c.kind === 'body-shift',
  'behavior-shift': (c) => c.kind === 'behavior-shift',
  carnivores: (c) => /carnivor/i.test(c.title),
  ambush: (c) => /ambush/i.test(c.title),
  dextrous: (c) => /dextrous/i.test(c.title),
  word: (c) => / call|word/i.test(c.title),
  tool: (c) => /nut|stone|spear|trap|shelter|harvest/i.test(c.title),
  threat: (c) => c.kind === 'threat',
};
export const CHECKPOINT_KINDS = Object.keys(CHECKPOINTS);

const average = (world, key) => {
  const cs = world.creatures;
  if (!cs.length) return 0;
  return cs.reduce((a, c) => a + (key === 'intelligence' ? intelligence(c.genome.brain) : key in c.stats ? c.stats[key] : traitsOf(c.genome)[key]), 0) / cs.length;
};

// cond: { simMinutes, popBelow, popAbove, checkpoint, trait: {key, op, value}, realMinutes, stepScale }
// opts: { maxSteps, now, startReal, startTime, log? (array receiving checkpoint titles) }
// Returns { reason, detail, steps } when a condition is met, or null if maxSteps ran out first.
export function runUntil(world, cond, { maxSteps, now = () => performance.now(), startReal, startTime, log = null }) {
  const dt = world.settings.dt, scale = Math.max(1, cond.stepScale || 1);
  world.settings.dt = dt * scale;
  try {
    const match = cond.checkpoint ? CHECKPOINTS[cond.checkpoint] : null;
    for (let steps = 1; steps <= maxSteps; steps++) {
      world.step();
      let hit = null;
      for (const e of world.events) {
        if (e.type !== 'checkpoint') continue;
        log?.push(e.checkpoint.title);
        if (!hit && match && match(e.checkpoint)) hit = e.checkpoint.title;
      }
      world.events.length = 0;
      const done = (reason, detail) => ({ reason, detail, steps });
      if (hit) return done('checkpoint', hit);
      const n = world.creatures.length;
      if (cond.popBelow != null && n < cond.popBelow) return done('population', `population ${n} < ${cond.popBelow}`);
      if (cond.popAbove != null && n > cond.popAbove) return done('population', `population ${n} > ${cond.popAbove}`);
      if (cond.simMinutes != null && world.time - startTime >= cond.simMinutes * 60 - 1e-9) return done('time', `${cond.simMinutes} sim-minutes`);
      if (cond.trait && (steps % 20 === 0 || steps === 1)) {
        const v = average(world, cond.trait.key), t = cond.trait;
        if (t.op === '>=' ? v >= t.value : v <= t.value) return done('trait', `average ${t.key} ${v.toFixed(2)} ${t.op} ${t.value}`);
      }
      if (cond.realMinutes != null && now() - startReal >= cond.realMinutes * 60000) return done('wallclock', `${cond.realMinutes} real minutes`);
    }
    return null;
  } finally {
    world.settings.dt = dt; // the run keeps normal step size outside fast-forward
  }
}
