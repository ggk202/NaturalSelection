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
    v.controls.target.set(c.x, 0, c.z); v.camera.position.set(c.x, 12, c.z + 10); v.controls.update();
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
