// Records the capability baseline: node bench/baseline.mjs > bench/<name>.json
import { measure } from './measure.mjs';
console.log(JSON.stringify(Object.fromEntries([1, 2, 3].map((s) => [s, measure(s)]))));
