// 30-minute probe: calls, detected meanings, labels. Usage: node bench/language.mjs [seeds...]
import { World } from '../src/sim/world.js';
for (const seed of process.argv.slice(2).map(Number)) {
  const w = new World({ seed }), titles = [];
  for (let m = 1; m <= 30; m++) {
    let calls = 0;
    for (let i = 0; i < 1200; i++) {
      w.step();
      for (const e of w.events) if (e.type === 'checkpoint' && /call|ambush/.test(e.checkpoint.title)) titles.push(`${m}m ${e.checkpoint.title}`);
      calls += w.calls.length; w.events.length = 0;
    }
    if (m % 10 === 0) {
      const L = {}; for (const c of w.creatures) L[c.label] = (L[c.label] || 0) + 1;
      const callers = w.creatures.filter((c) => c.genome.brain.conns.some((k) => k.on && k.to === 56 + 39 + 0)).length;
      console.log(`seed ${seed} ${m}m pop ${w.creatures.length} calls/step ${(calls / 1200).toFixed(1)} labels ${JSON.stringify(L)}`);
    }
  }
  const lex = w.tracker.species.filter((s) => s.lexicon && Object.keys(s.lexicon).length).map((s) => `${s.id}:${JSON.stringify(s.lexicon)}`);
  console.log(`seed ${seed} meanings: ${titles.join(' | ') || 'none'}; lexicons ${lex.join(' ') || 'none'}`);
}
