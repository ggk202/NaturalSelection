import { h } from './dom.js';
import { World } from '../sim/world.js';
import { serializeWorld } from '../sim/serialize.js';
import { listRuns, deleteRun, renameRun } from '../storage.js';
import { createPreview } from '../render/preview.js';
import { fmtTime } from './charts.js';

const KIND_ICON = { 'new-species': '🌱', 'body-shift': '🦴', 'behavior-shift': '🧠', first: '⭐' };

export function showSheet(el) {
  for (const s of document.querySelectorAll('.sheet')) if (s !== el) s.hidden = true;
  el.hidden = !el.hidden;
}

export function mountRuns(root, app) {
  // --- Runs sheet ---
  const list = h('ul', { class: 'list' });
  const runs = h('div', { id: 'runs', class: 'panel sheet', hidden: true },
    h('div', { class: 'sheet-head' }, h('strong', {}, 'Runs'), h('button', { onclick: () => (runs.hidden = true) }, 'Close')),
    h('div', { class: 'row buttons' },
      h('button', { id: 'btn-new-run', onclick: newRun }, 'New run'),
      h('button', { id: 'btn-save-now', class: 'primary', onclick: async () => { await app.save(); refresh(); } }, 'Save now'),
      h('button', { onclick: download }, 'Download JSON')),
    list);

  async function refresh() {
    const r = await listRuns();
    if (!r.ok) { list.replaceChildren(h('li', {}, 'Saving unavailable in this browser.')); return; }
    list.replaceChildren(...r.value.map((m) => h('li', { 'data-id': m.id, class: m.id === app.runId ? 'current' : '' },
      h('div', { class: 'txt' }, h('strong', {}, m.name), h('small', {}, `${new Date(m.updatedAt).toLocaleString()} · sim ${fmtTime(m.time)} · ${m.pop} alive`)),
      h('div', { class: 'acts' },
        m.id === app.runId ? h('span', { class: 'tag' }, 'current') : h('button', { 'data-act': 'resume', onclick: () => resume(m) }, 'Resume'),
        h('button', { 'data-act': 'rename', onclick: async () => {
          const name = prompt('Run name', m.name);
          if (!name) return;
          await renameRun(m.id, name);
          if (m.id === app.runId) app.runName = name;
          refresh();
        } }, 'Rename'),
        h('button', { 'data-act': 'delete', onclick: async () => {
          if (!confirm(`Delete "${m.name}"? This cannot be undone.`)) return;
          await deleteRun(m.id);
          if (m.id === app.runId) newRun();
          refresh();
        } }, 'Delete')))));
  }

  async function resume(meta) {
    const err = await app.loadRun(meta.id, meta.name);
    if (err) toast(`Could not load run: ${err}`);
    refresh();
  }
  async function newRun() {
    await app.save();
    app.setWorld(new World(structuredClone(app.ui.controls.draft)));
    refresh();
  }
  function download() {
    const blob = new Blob([JSON.stringify({ name: app.runName, ...serializeWorld(app.world) })], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${app.runName.replace(/[^\w-]+/g, '_')}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // --- Checkpoint timeline ---
  const cpList = h('ul', { class: 'list' });
  const detailCanvas = h('canvas', { class: 'preview' });
  const detailTable = h('table', { class: 'kv' });
  const detailTitle = h('strong');
  const detail = h('div', { class: 'detail', hidden: true }, detailTitle, detailCanvas, detailTable);
  const timeline = h('div', { id: 'checkpoints', class: 'panel sheet', hidden: true },
    h('div', { class: 'sheet-head' }, h('strong', {}, 'Evolution timeline'), h('button', { onclick: () => { timeline.hidden = true; pv.dispose(); } }, 'Close')),
    detail, cpList);
  const pv = createPreview(detailCanvas);
  let shownCount = -1;

  function renderTimeline() {
    const cps = app.world.checkpoints;
    if (cps.length === shownCount) return;
    shownCount = cps.length;
    cpList.replaceChildren(...(cps.length ? [...cps].reverse().map((cp) => h('li', { class: 'cp', onclick: () => showCheckpoint(cp) },
      h('span', { class: 'icon' }, KIND_ICON[cp.kind] || '•'), h('div', { class: 'txt' }, h('strong', {}, cp.title), h('small', {}, fmtTime(cp.time)))))
      : [h('li', {}, h('small', {}, 'No checkpoints yet. They appear when a species’ body or behaviour changes.'))]));
  }
  function showCheckpoint(cp) {
    detail.hidden = false;
    detailTitle.textContent = `${cp.title} · ${fmtTime(cp.time)}`;
    pv.show(cp.genome);
    detailTable.replaceChildren(...Object.entries(cp.avgBody).filter(([k]) => k !== 'hue').map(([k, v]) => h('tr', {}, h('th', {}, `avg ${k}`), h('td', {}, v.toFixed(2)))));
  }

  // --- Toast + storage warning ---
  const toastEl = h('div', { id: 'toast', class: 'panel toast', hidden: true });
  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (toastEl.hidden = true), 4000);
  }
  const warning = h('div', { id: 'storage-warning', class: 'panel warn', hidden: true }, 'Saving unavailable – progress won’t persist');
  app.onStorageError = () => { warning.hidden = false; };

  app.listeners.add((evs) => {
    for (const e of evs) if (e.type === 'checkpoint') toast(`${KIND_ICON[e.checkpoint.kind] || ''} ${e.checkpoint.title}`);
    if (!timeline.hidden) renderTimeline();
  });

  root.append(runs, timeline, toastEl, warning);
  return {
    openRuns: () => { showSheet(runs); if (!runs.hidden) refresh(); },
    openTimeline: () => { shownCount = -1; showSheet(timeline); if (!timeline.hidden) renderTimeline(); else pv.dispose(); },
    toast,
  };
}
