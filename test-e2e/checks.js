export const checks = {};

const blank = (page, base) => page.goto(`${base}/test-e2e/blank.html`);

checks['storage roundtrip'] = async ({ page, base, assert }) => {
  await blank(page, base);
  const r = await page.evaluate(async () => {
    const s = await import('/src/storage.js');
    const saved = await s.saveRun('r1', 'Run 1', { schemaVersion: 1, time: 12, creatures: [1, 2] });
    const list = await s.listRuns();
    const loaded = await s.loadRun('r1');
    await s.saveSettings({ foodRate: 7 });
    const settings = await s.loadSettings();
    await s.deleteRun('r1');
    const after = await s.listRuns();
    return { saved, list, loaded, settings, after };
  });
  assert.equal(r.saved.ok, true);
  assert.equal(r.list.value.length, 1);
  assert.equal(r.list.value[0].name, 'Run 1');
  assert.equal(r.list.value[0].pop, 2);
  assert.deepEqual(r.loaded.value.creatures, [1, 2]);
  assert.equal(r.settings.value.foodRate, 7);
  assert.equal(r.after.value.length, 0);
};

checks['save failure is non-fatal'] = async ({ page, base, assert }) => {
  await blank(page, base);
  const r = await page.evaluate(async () => {
    indexedDB.open = () => { throw new Error('blocked'); };
    const s = await import('/src/storage.js');
    return [await s.saveRun('x', 'X', { schemaVersion: 1, creatures: [] }), await s.listRuns(), await s.loadSettings()];
  });
  for (const x of r) assert.equal(x.ok, false);
};

checks['rejects unknown schemaVersion'] = async ({ page, base, assert }) => {
  await blank(page, base);
  const r = await page.evaluate(async () => {
    const s = await import('/src/storage.js');
    const { deserializeWorld } = await import('/src/sim/serialize.js');
    await s.saveRun('old', 'Old', { schemaVersion: 99, creatures: [] });
    const loaded = await s.loadRun('old');
    let err = null;
    try { deserializeWorld(loaded.value); } catch (e) { err = e.message; }
    return { err, still: (await s.listRuns()).value.map((x) => x.id) };
  });
  assert.match(r.err, /schema/);
  assert.deepEqual(r.still, ['old']);
};

checks['app boots'] = async ({ page, base, errors, assert }) => {
  await page.goto(`${base}/`);
  await page.waitForFunction(() => window.__world && window.__frames > 30, null, { timeout: 15000 });
  assert.ok(await page.$('canvas#view'));
  assert.ok(await page.evaluate(() => window.__world.creatures.length > 0));
  assert.deepEqual(errors, []);
};

const boot = async (page, base) => {
  await page.goto(`${base}/`);
  await page.waitForFunction(() => window.__world && window.__frames > 5, null, { timeout: 15000 });
};

checks['speed buttons change speed'] = async ({ page, base, assert }) => {
  await boot(page, base);
  await page.click('[data-speed="4"]');
  assert.equal(await page.evaluate(() => window.__app.speed), 4);
  await page.click('#btn-play');
  assert.equal(await page.evaluate(() => window.__app.paused), true);
  const t = await page.evaluate(() => window.__world.time);
  await page.click('#btn-step');
  assert.ok(await page.evaluate((t) => window.__world.time > t, t));
};

checks['settings live-apply and persist'] = async ({ page, base, assert }) => {
  await boot(page, base);
  await page.click('#btn-settings');
  await page.fill('#settings input[name="foodRate"]', '9');
  await page.dispatchEvent('#settings input[name="foodRate"]', 'input');
  assert.equal(await page.evaluate(() => window.__world.settings.foodRate), 9);
  await page.click('#settings input[name="env.seasons"]');
  assert.equal(await page.evaluate(() => window.__world.settings.env.seasons), false);
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.__world && window.__frames > 5);
  assert.equal(await page.evaluate(() => window.__world.settings.foodRate), 9);
};

checks['extinct banner and reseed'] = async ({ page, base, assert }) => {
  await boot(page, base);
  await page.evaluate(() => { window.__world.settings.respawnMin = 0; window.__world.creatures = []; });
  await page.waitForSelector('#extinct', { state: 'visible', timeout: 3000 });
  await page.click('#extinct button');
  await page.waitForFunction(() => window.__world.creatures.length > 0);
  await page.waitForSelector('#extinct', { state: 'hidden', timeout: 3000 });
};

checks['charts draw'] = async ({ page, base, assert }) => {
  await boot(page, base);
  await page.evaluate(() => { window.__app.speed = 8; });
  await page.waitForFunction(() => window.__world.stats.series.length > 3, null, { timeout: 20000 });
  for (const tab of ['pop', 'traits', 'behavior']) {
    await page.click(`#charts [data-tab="${tab}"]`);
    await page.waitForTimeout(1200);
    const lit = await page.evaluate(() => {
      const c = document.querySelector('#charts canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 200) n++;
      return n;
    });
    assert.ok(lit > 200, `${tab} lit ${lit}`);
  }
};

const screenOf = (page, id) => page.evaluate((id) => {
  const c = window.__world.creatures.find((c) => c.id === id);
  return window.__view.project(c.x, c.z);
}, id);

checks['tap inspects creature'] = async ({ page, base, assert, errors }) => {
  await boot(page, base);
  const id = await page.evaluate(() => {
    window.__app.paused = true;
    const w = window.__world, v = window.__view;
    const c = w.creatures.reduce((a, b) => (Math.hypot(b.x - 50, b.z - 50) < Math.hypot(a.x - 50, a.z - 50) ? b : a));
    const h = w.terrain.heightAt(c.x, c.z);
    v.controls.target.set(c.x, h, c.z); v.camera.position.set(c.x, h + 12, c.z + 10); v.controls.update();
    return c.id;
  });
  await page.waitForTimeout(200);
  const p = await screenOf(page, id);
  await page.mouse.click(p.x, p.y);
  await page.waitForSelector('#inspector', { state: 'visible', timeout: 2000 });
  assert.equal(await page.getAttribute('#inspector', 'data-id'), String(id));
  assert.ok(await page.$('#inspector canvas.preview'));
  assert.ok(await page.$('#inspector canvas.brain'));
  await page.waitForTimeout(600);
  assert.deepEqual(errors, []);
};

checks['food tool adds food'] = async ({ page, base, assert }) => {
  await boot(page, base);
  await page.evaluate(() => { window.__app.paused = true; });
  const n0 = await page.evaluate(() => window.__world.food.length);
  await page.click('[data-tool="food"]');
  await page.mouse.click(512, 500);
  assert.equal(await page.evaluate(() => window.__world.food.length), n0 + 10);
};

checks['seed predators button'] = async ({ page, base, assert }) => {
  await boot(page, base);
  await page.evaluate(() => { window.__app.paused = true; });
  const n0 = await page.evaluate(() => window.__world.creatures.filter((c) => c.genome.body.diet >= 0.9).length);
  await page.click('#btn-predators');
  assert.equal(await page.evaluate(() => window.__world.creatures.filter((c) => c.genome.body.diet >= 0.9).length), n0 + 5);
};

checks['resume after reload'] = async ({ page, base, assert }) => {
  await boot(page, base);
  await page.evaluate(() => { window.__app.speed = 8; });
  await page.waitForFunction(() => window.__world.time > 5);
  await page.evaluate(() => { window.__app.paused = true; });
  await page.click('#btn-runs');
  await page.click('#btn-save-now');
  await page.waitForSelector('#runs li');
  const { runId, time } = await page.evaluate(() => ({ runId: window.__app.runId, time: window.__world.time }));
  await page.reload();
  await page.waitForFunction(() => window.__world && window.__frames > 5);
  assert.equal(await page.evaluate(() => window.__app.runId), runId);
  assert.ok(await page.evaluate((t) => window.__world.time >= t - 1, time));
};

checks['new run, rename and delete'] = async ({ page, base, assert }) => {
  await boot(page, base);
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Renamed run' : undefined));
  await page.click('#btn-runs');
  await page.click('#btn-save-now');
  const first = await page.evaluate(() => window.__app.runId);
  await page.click('#btn-new-run');
  assert.notEqual(await page.evaluate(() => window.__app.runId), first);
  await page.click('#btn-save-now');
  await page.waitForFunction(() => document.querySelectorAll('#runs li').length === 2);
  await page.click(`#runs li[data-id="${first}"] [data-act="rename"]`);
  await page.waitForFunction((id) => document.querySelector(`#runs li[data-id="${id}"]`).textContent.includes('Renamed run'), first);
  await page.click(`#runs li[data-id="${first}"] [data-act="delete"]`);
  await page.waitForFunction(() => document.querySelectorAll('#runs li').length === 1);
};

checks['checkpoint list shows entries'] = async ({ page, base, assert, errors }) => {
  await boot(page, base);
  await page.evaluate(() => {
    const w = window.__world, c = w.creatures[0];
    // 'first' is a milestone, so it always toasts (other kinds are rate-limited).
    const cp = { id: 99, time: w.time, speciesId: 1, kind: 'first', title: 'Species 1: legs 3 → 4', genome: c.genome, avgBody: { ...c.genome.body } };
    w.checkpoints.push(cp);
    w.emit({ type: 'checkpoint', checkpoint: cp });
  });
  await page.waitForSelector('#toast:not([hidden])', { timeout: 2000 });
  await page.click('#btn-timeline');
  await page.click('#checkpoints li >> text=legs 3 → 4');
  await page.waitForSelector('#checkpoints canvas.preview', { state: 'visible' });
  await page.waitForTimeout(300);
  assert.deepEqual(errors, []);
};

checks['storage warning shown'] = async ({ page, context, base, assert }) => {
  await context.addInitScript(() => { indexedDB.open = () => { throw new Error('blocked'); }; });
  await boot(page, base);
  await page.evaluate(() => window.__app.save());
  await page.waitForSelector('#storage-warning', { state: 'visible', timeout: 3000 });
  const t = await page.evaluate(() => window.__world.time);
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate((t) => window.__world.time > t, t));
};

checks['works offline'] = async ({ page, context, base, assert }) => {
  await boot(page, base);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 10000 });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__world && window.__frames > 5 && window.__world.creatures.length > 0, null, { timeout: 15000 });
  assert.ok(await page.$('canvas#view'));
};

checks['manifest and icons load'] = async ({ page, base, assert }) => {
  await boot(page, base);
  const m = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]').href;
    const j = await (await fetch(href)).json();
    const ok = await Promise.all(j.icons.map(async (i) => (await fetch(new URL(i.src, href))).ok));
    return { display: j.display, ok };
  });
  assert.equal(m.display, 'standalone');
  assert.ok(m.ok.length >= 2 && m.ok.every(Boolean));
};

checks['perf 300 creatures (sim time asserted, frame time logged)'] = async ({ page, base, assert }) => {
  await boot(page, base);
  const r = await page.evaluate(async () => {
    const { World } = await import('/src/sim/world.js');
    const w = new World({ initialCreatures: 300, maxCreatures: 300, respawnMin: 0 });
    // Best of 3 trials: the shared CI machine's load makes single means noisy.
    let step = Infinity;
    for (let trial = 0; trial < 3; trial++) {
      const t0 = performance.now();
      for (let i = 0; i < 40; i++) w.step();
      step = Math.min(step, (performance.now() - t0) / 40);
    }
    window.__app.setWorld(new World({ initialCreatures: 300, maxCreatures: 300 }));
    const f0 = window.__frames, s = performance.now();
    await new Promise((res) => setTimeout(res, 3000));
    return { step, frameMs: (performance.now() - s) / (window.__frames - f0) };
  });
  console.log(`  # sim step ${r.step.toFixed(2)} ms, frame ${r.frameMs.toFixed(1)} ms (software GL — check fps on iPad)`);
  assert.ok(r.step < 10, `sim step ${r.step}`); // relaxed 8→10ms in 2a: user moving to a stronger device; vision rays cost ~2ms
};

checks['deleting the current run does not resurrect it'] = async ({ page, base, assert }) => {
  await boot(page, base);
  page.on('dialog', (d) => d.accept());
  await page.click('#btn-runs');
  await page.click('#btn-save-now');
  const id = await page.evaluate(() => window.__app.runId);
  await page.waitForSelector(`#runs li[data-id="${id}"]`);
  await page.click(`#runs li[data-id="${id}"] [data-act="delete"]`);
  await page.waitForTimeout(500);
  const ids = await page.evaluate(async () => (await (await import('/src/storage.js')).listRuns()).value.map((r) => r.id));
  assert.ok(!ids.includes(id), `still saved: ${ids}`);
  assert.notEqual(await page.evaluate(() => window.__app.runId), id);
};

checks['switching runs or reseeding saves the current run first'] = async ({ page, base, assert }) => {
  await boot(page, base);
  await page.click('#btn-runs');
  await page.click('#btn-save-now');
  const a = await page.evaluate(() => window.__app.runId);
  await page.click('#btn-new-run');
  await page.evaluate(() => { window.__app.speed = 8; });
  await page.waitForFunction(() => window.__world.time > 4);
  const b = await page.evaluate(() => window.__app.runId);
  await page.evaluate(() => window.__app.ui.runs.openRuns());
  await page.evaluate(() => window.__app.ui.runs.openRuns());
  await page.click(`#runs li[data-id="${a}"] [data-act="resume"]`);
  await page.waitForFunction((a) => window.__app.runId === a, a);
  const metaB = await page.evaluate(async (b) => (await (await import('/src/storage.js')).listRuns()).value.find((r) => r.id === b), b);
  assert.ok(metaB && metaB.time > 4, `B saved at ${metaB && metaB.time}`);
  // Reseed from settings also saves the run being replaced.
  await page.evaluate(() => { window.__app.speed = 8; });
  const tA = await page.evaluate(async () => { await new Promise((r) => setTimeout(r, 1500)); return window.__world.time; });
  await page.click('#btn-settings');
  await page.click('#settings button.primary');
  await page.waitForFunction((a) => window.__app.runId !== a, a);
  const metaA = await page.evaluate(async (a) => (await (await import('/src/storage.js')).listRuns()).value.find((r) => r.id === a), a);
  assert.ok(metaA.time >= tA - 0.5, `A saved at ${metaA.time}, was ${tA}`);
};

checks['world renders biomes'] = async ({ page, base, assert, errors }) => {
  await boot(page, base);
  const r = await page.evaluate(() => {
    const s = window.__view.scene;
    return { water: !!s.getObjectByName('water'), trees: s.getObjectByName('trees')?.count || 0, rocks: s.getObjectByName('rocks')?.count || 0 };
  });
  assert.ok(r.water, 'water plane');
  assert.ok(r.trees > 100, `trees ${r.trees}`);
  assert.ok(r.rocks > 10, `rocks ${r.rocks}`);
  assert.deepEqual(errors, []);
};

checks['biomes tab draws'] = async ({ page, base, assert }) => {
  await boot(page, base);
  await page.evaluate(() => { window.__app.speed = 8; });
  await page.waitForFunction(() => window.__world.stats.series.length > 3, null, { timeout: 20000 });
  await page.click('#charts [data-tab="biomes"]');
  await page.waitForTimeout(1200);
  const legend = await page.textContent('#charts .legend');
  for (const k of ['Plains', 'Forest', 'Wetland', 'Lake', 'Mountain', 'Desert']) assert.ok(legend.includes(k), k);
};

checks['world settings exist'] = async ({ page, base, assert }) => {
  await boot(page, base);
  await page.click('#btn-settings');
  assert.equal(await page.getAttribute('#settings input[name="worldSize"]', 'max'), '300');
  assert.ok(await page.$('#settings input[name="waterLevel"]'));
};

checks['brain graph draws the evolved network'] = async ({ page, base, assert, errors }) => {
  await boot(page, base);
  const id = await page.evaluate(() => { window.__app.paused = true; const c = window.__world.creatures[0]; window.__app.ui.inspector.open(c.id); return c.id; });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const cv = document.querySelector('#inspector canvas.brain'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 150) lit++;
    return { lit, labels: window.__app.ui.inspector.brainLabels?.() || [] };
  });
  assert.ok(r.lit > 500, `lit ${r.lit}`);
  assert.ok(r.labels.includes('throttle') && r.labels.includes('turn'), r.labels.join(','));
  assert.deepEqual(errors, []);
  void id;
};

checks['memory overlay toggles from the inspector'] = async ({ page, base, assert, errors }) => {
  await boot(page, base);
  await page.waitForFunction(() => window.__world.time > 2);
  await page.evaluate(() => { window.__app.paused = true; window.__app.ui.inspector.open(window.__world.creatures[0].id); });
  await page.click('#inspector [data-act="memory"]');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => { const m = window.__view.scene.getObjectByName('memoryOverlay'); return m ? { visible: m.visible, count: m.count } : null; });
  assert.ok(r && r.visible && r.count > 0, JSON.stringify(r));
  await page.click('#inspector [data-act="memory"]');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__view.scene.getObjectByName('memoryOverlay').visible), false);
  assert.deepEqual(errors, []);
};

checks['signals tab and intelligence trait draw'] = async ({ page, base, assert }) => {
  await boot(page, base);
  await page.evaluate(() => { window.__app.speed = 8; });
  await page.waitForFunction(() => window.__world.stats.series.length > 3, null, { timeout: 20000 });
  await page.click('#charts [data-tab="signals"]');
  await page.waitForTimeout(1200);
  const legend = await page.textContent('#charts .legend');
  for (const k of ['ka', 'ru', 'mi', 'to']) assert.ok(legend.includes(k), k);
  await page.click('#charts [data-tab="traits"]');
  await page.waitForTimeout(1200);
  assert.ok((await page.textContent('#charts .legend')).includes('Intelligence'));
};
