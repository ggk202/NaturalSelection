// Placeholder until the full graph view (Task 5): summary of the evolved brain.
export function drawBrainGraph(canvas, brain) {
  const dpr = Math.min(devicePixelRatio || 1, 2), W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#c3c2b7'; ctx.font = '12px sans-serif';
  const hid = brain.nodes.filter((n) => n.type === 'hid').length, on = brain.conns.filter((c) => c.on).length;
  ctx.fillText(`${hid} hidden neurons · ${on} connections`, 10, 20);
}
