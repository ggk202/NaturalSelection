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
