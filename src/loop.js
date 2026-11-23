// Fixed-timestep accumulator. Caps catch-up at 8×speed steps per frame and drops the
// backlog, so a backgrounded tab or a sleeping iPad doesn't trigger a spiral of steps.
export function createStepper() {
  let acc = 0;
  return (frameDt, speed, dt) => {
    acc += frameDt * speed;
    const max = 8 * speed;
    let n = Math.floor(acc / dt + 1e-9);
    if (n > max) { n = max; acc = 0; } else acc -= n * dt;
    return n;
  };
}
