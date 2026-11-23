// Slow: run with `npm run test:slow`. Checks that several biomes sustain populations and logs specialization.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/sim/world.js';
import { BIOMES } from '../../src/sim/biomes.js';

for (const seed of [1, 2, 3]) {
  test(`seed ${seed}: at least 4 biomes hold ≥3% of the population`, () => {
    const w = new World({ seed });
    for (let i = 0; i < 20 * 60 * 12; i++) { w.step(); w.events.length = 0; }
    const last = w.stats.series.slice(-5);
    const share = BIOMES.map((b) => last.reduce((a, p) => a + p.biomes[b.key] / Math.max(1, p.pop), 0) / last.length);
    const trait = (key, k) => { const cs = w.creatures.filter((c) => w.biomeOf(c).key === key); return cs.length ? (cs.reduce((a, c) => a + c.stats[k], 0) / cs.length).toFixed(2) : '–'; };
    console.log(`# seed ${seed} pop ${w.creatures.length}: ` + BIOMES.map((b, i) => `${b.key} ${(share[i] * 100).toFixed(0)}%`).join(' '));
    console.log(`#   swim lake ${trait('lake', 'swim')} vs plains ${trait('plains', 'swim')}; climb mountain ${trait('mountain', 'climb')} vs plains ${trait('plains', 'climb')}; coldResist mountain ${trait('mountain', 'coldResist')} vs desert ${trait('desert', 'coldResist')}`);
    assert.ok(share.filter((s) => s >= 0.03).length >= 4, `only ${share.filter((s) => s >= 0.03).length} viable biomes`);
  });
}
