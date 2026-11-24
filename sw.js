// Offline support: network-first (so updates arrive without version bumps), cache as fallback.
const CACHE = 'natsel-v2';
const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './src/ff-worker.js',
  './src/loop.js',
  './src/main.js',
  './src/render/creatures.js',
  './src/render/objects.js',
  './src/render/preview.js',
  './src/render/props.js',
  './src/render/scene.js',
  './src/sim/behavior.js',
  './src/sim/biomes.js',
  './src/sim/body.js',
  './src/sim/bodyplan.js',
  './src/sim/creature-physics.js',
  './src/sim/environment.js',
  './src/sim/fastforward.js',
  './src/sim/genome.js',
  './src/sim/grid.js',
  './src/sim/memory.js',
  './src/sim/neat.js',
  './src/sim/noise.js',
  './src/sim/physics.js',
  './src/sim/rng.js',
  './src/sim/serialize.js',
  './src/sim/species.js',
  './src/sim/stats.js',
  './src/sim/terrain.js',
  './src/sim/tools.js',
  './src/sim/vision.js',
  './src/sim/world.js',
  './src/storage.js',
  './src/ui/brain-graph.js',
  './src/ui/charts.js',
  './src/ui/controls.js',
  './src/ui/dom.js',
  './src/ui/fastforward.js',
  './src/ui/godmode.js',
  './src/ui/inspector.js',
  './src/ui/runs.js',
  './vendor/OrbitControls.js',
  './vendor/rapier/LICENSE',
  './vendor/rapier/rapier.js',
  './vendor/three.module.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // no-cache: revalidate with the server, so a stale HTTP cache can't keep serving old code while online.
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
