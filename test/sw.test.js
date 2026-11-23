import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test('service worker precaches every app file', () => {
  const sw = readFileSync('sw.js', 'utf8');
  const need = ['index.html', 'style.css', 'manifest.webmanifest', ...walk('src'), ...walk('vendor'), ...walk('icons')];
  for (const f of need) assert.ok(sw.includes(`'./${f}'`), `missing ${f}`);
});
