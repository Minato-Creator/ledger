/* ============================================================
   Motion for the simulations — shared by Replay's What if and The Lab.

   Played only when something new is worked out (a page opened, a new run);
   a setting that only rescales the answer glides the numbers from where they
   stood instead. Off for anyone who asks their system for less motion.
   ============================================================ */

export const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const easeInOut = t => (t = Math.min(1, Math.max(0, t)), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A number that counts to its value (from where it last stood, or zero). */
const shown = new Map();
export function countTo(node, key, to, fmt, { delay = 0, dur = 900, fresh = false } = {}) {
  const from = fresh || !shown.has(key) ? 0 : shown.get(key);
  shown.set(key, to);
  if (calm() || dur <= 0 || !Number.isFinite(to) || Math.abs(to - from) < 1e-9) { node.textContent = fmt(to); return; }
  node.textContent = fmt(from);
  const t0 = performance.now() + delay;
  const step = now => {
    if (!node.isConnected && now - t0 > 50) return;
    const k = (now - t0) / dur;
    node.textContent = fmt(k <= 0 ? from : from + (to - from) * ease(k));
    if (k < 1) requestAnimationFrame(step); else node.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

/**
 * Hold a chart's animations until it is on screen, then let them run.
 * `mo-wait` pauses every CSS animation inside (each sits on its first frame);
 * `start` is for the ones driven from script.
 */
export function whenSeen(node, start = () => {}) {
  node.classList.add('mo-wait');
  const go = () => { node.classList.remove('mo-wait'); start(); };
  if (typeof IntersectionObserver !== 'function') { requestAnimationFrame(go); return; }
  const io = new IntersectionObserver(es => {
    if (!es.some(e => e.isIntersecting)) return;
    io.disconnect();
    go();
  }, { threshold: 0.3 });
  requestAnimationFrame(() => io.observe(node));
}

/** A fitted() drawing that plays only the first time; a redraw for a new size shows itself finished. */
export function once(play, draw) {
  let first = play;
  return (w, h) => { const go = first; first = false; return draw(w, h, go); };
}

/** Where along a polyline a share p of its length falls — so a light can ride the tip of a line as it draws. */
export function along(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  return p => {
    if (pts.length < 2) return pts[0] || [0, 0];
    const want = p * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < want) i++;
    const seg = cum[i] - cum[i - 1] || 1, k = Math.max(0, Math.min(1, (want - cum[i - 1]) / seg));
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
  };
}

/** The profit colour as "r, g, b", for a canvas. */
export const tintRGB = (name = '--profit-rgb', fallback = '24, 172, 101') =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
