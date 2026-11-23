// Rewrites the PRECACHE list in sw.js from the files on disk. Run after adding/removing app files.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = ['index.html', 'style.css', 'manifest.webmanifest', ...['icons', 'src', 'vendor'].flatMap(walk).sort()];
const list = ["  './',", ...files.map((f) => `  './${f}',`)].join('\n');
const sw = readFileSync('sw.js', 'utf8').replace(/const PRECACHE = \[[\s\S]*?\n\];/, `const PRECACHE = [\n${list}\n];`);
writeFileSync('sw.js', sw);
