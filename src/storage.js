// IndexedDB persistence. Every call resolves to { ok: true, value } or { ok: false, error }; never throws.
const DB = 'natsel', VERSION = 1;
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('runs', { keyPath: 'id' });
        db.createObjectStore('runData');
        db.createObjectStore('settings');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('database blocked'));
    }).catch((e) => { dbPromise = null; throw e; });
  }
  return dbPromise;
}

async function tx(stores, mode, fn) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let value;
      Promise.resolve(fn(t)).then((v) => { value = v; }, reject);
      t.oncomplete = () => resolve({ ok: true, value });
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
    });
  } catch (error) {
    return { ok: false, error: String(error && error.message || error) };
  }
}

const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const saveRun = (id, name, data) => tx(['runs', 'runData'], 'readwrite', (t) => {
  t.objectStore('runs').put({ id, name, updatedAt: Date.now(), time: data.time ?? 0, pop: data.creatures ? data.creatures.length : 0 });
  t.objectStore('runData').put(data, id);
});
export const loadRun = (id) => tx(['runData'], 'readonly', (t) => req(t.objectStore('runData').get(id)));
export const listRuns = () => tx(['runs'], 'readonly', async (t) => (await req(t.objectStore('runs').getAll())).sort((a, b) => b.updatedAt - a.updatedAt));
export const renameRun = (id, name) => tx(['runs'], 'readwrite', async (t) => {
  const s = t.objectStore('runs'), meta = await req(s.get(id));
  if (meta) s.put({ ...meta, name });
});
export const deleteRun = (id) => tx(['runs', 'runData'], 'readwrite', (t) => {
  t.objectStore('runs').delete(id);
  t.objectStore('runData').delete(id);
});
export const saveSettings = (obj) => tx(['settings'], 'readwrite', (t) => { t.objectStore('settings').put(obj, 'settings'); });
export const loadSettings = () => tx(['settings'], 'readonly', (t) => req(t.objectStore('settings').get('settings')));
