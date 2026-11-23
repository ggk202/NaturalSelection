export const LABELS = ['hunter', 'fleer', 'forager', 'wanderer', 'idler'];

// Label from what a creature actually did over the last window (counters are per-step counts).
export function labelOf(c) {
  if (!c.steps) return null;
  const r = (k) => c[k] / c.steps;
  if (r('attacked') > 0.05) return 'hunter';
  if (r('fled') > 0.02) return 'fleer';
  if (r('ate') > 0.01) return 'forager';
  if (r('moved') > 0.5) return 'wanderer';
  return 'idler';
}

export const emptyCounters = () => ({ steps: 0, moved: 0, ate: 0, attacked: 0, fled: 0, idle: 0 });
