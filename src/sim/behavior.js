export const LABELS = ['ambusher', 'hunter', 'homebody', 'patroller', 'fleer', 'forager', 'wanderer', 'idler'];

// Label from what a creature actually did over the last window (counters are per-step counts).
export function labelOf(c) {
  if (!c.steps) return null;
  const r = (k) => c[k] / c.steps;
  if (c.ambushes > 0) return 'ambusher';
  if (r('attacked') > 0.05) return 'hunter';
  if (r('fled') > 0.02) return 'fleer';
  // Range-based labels: staying near one spot, or looping over the same ground.
  if (r('moved') > 0.3 && c.path >= 30 && c.maxDist <= 12) return 'homebody'; // real movement, kept local
  if (c.path > 60 && c.maxDist <= 30) return 'patroller';
  if (r('ate') > 0.01) return 'forager';
  if (r('moved') > 0.5) return 'wanderer';
  return 'idler';
}

export const emptyCounters = () => ({ steps: 0, moved: 0, ate: 0, attacked: 0, fled: 0, idle: 0, ambushes: 0, path: 0, maxDist: 0 });
