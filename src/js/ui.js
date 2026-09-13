/* ============================================================
   ui.js — small helpers. No framework: a view is a function
   that returns an element, and re-renders when data changes.
   ============================================================ */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') setStyle(node, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/* Object.assign onto a style object silently drops custom properties — the
   setter only understands named ones — so `--dir: red` would do nothing at
   all. Anything starting with two dashes goes through setProperty instead. */
function setStyle(node, styles) {
  for (const [k, v] of Object.entries(styles)) {
    if (v == null) continue;
    if (k.startsWith('--')) node.style.setProperty(k, String(v));
    else node.style[k] = v;
  }
}

export function svg(tag, props = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(props)) if (v != null && v !== false) node.setAttribute(k, v);
  for (const c of children.flat(Infinity)) if (c != null && c !== false) node.append(c);
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/* ---------- icons (stroke, 24 grid, one style) ---------- */
const PATHS = {
  dashboard: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  trades:    '<path d="M4 7h16M4 12h16M4 17h10"/>',
  calendar:  '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  replay:    '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4.5h4.5"/>',
  playbook:  '<path d="M5 4.5h11a3 3 0 0 1 3 3V21H8a3 3 0 0 1-3-3z"/><path d="M5 17.5h14"/>',
  plus:      '<path d="M12 5v14M5 12h14"/>',
  minus:     '<path d="M5 12h14"/>',
  chevdown:  '<path d="M6 9l6 6 6-6"/>',
  chevright: '<path d="M9 6l6 6-6 6"/>',
  chevleft:  '<path d="M15 6l-6 6 6 6"/>',
  switch:    '<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>',
  check:     '<path d="M5 13l4.5 4.5L19 7"/>',
  folder:    '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2a2 2 0 0 1 1.5.7l1 1.2h7.3A2.5 2.5 0 0 1 21 9.4v8.1a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
  trash:     '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  pencil:    '<path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z"/>',
  mark:      '<path d="M4 18 L9 9 L14 15 L20 5"/>',
  download:  '<path d="M12 4v12"/><path d="M7.5 11.5 12 16l4.5-4.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
  image:     '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M3.5 17l4.6-4.2a1.6 1.6 0 0 1 2.2 0L14 16"/><path d="M13.5 14.5l2.4-2.2a1.6 1.6 0 0 1 2.2 0l2.4 2.2"/>',
  expand:    '<path d="M14 4h6v6"/><path d="M10 20H4v-6"/><path d="M20 4l-7 7"/><path d="M4 20l7-7"/>',
  close:     '<path d="M6 6l12 12M18 6L6 18"/>',
  user:      '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6"/>',
  upload:    '<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
};
export function icon(name, size = 17, stroke = 'currentColor', width = 1.6) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', stroke); s.setAttribute('stroke-width', width);
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = PATHS[name] || '';
  return s;
}

/* ---------- a line chart with an optional shaded drawdown ---------- */
export function lineChart({ points, width = 960, height = 240, pad = { l: 48, r: 12, t: 24, b: 28 },
                            color = 'var(--green)', drawdown = null, yTicks = 5, fmtY = v => v, fmtX = i => i }) {
  const g = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%',
                         style: 'display:block;height:auto', preserveAspectRatio: 'xMidYMid meet' });
  if (!points.length) return g;

  const x0 = pad.l, x1 = width - pad.r, y0 = pad.t, y1 = height - pad.b;
  const vals = points.map(p => p.v);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const span = (hi - lo) || 1;
  const X = i => points.length === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (points.length - 1);
  const Y = v => y1 - ((v - lo) / span) * (y1 - y0);

  // grid
  for (let i = 0; i < yTicks; i++) {
    const v = lo + (span * i) / (yTicks - 1);
    const y = Y(v);
    g.append(svg('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: i === 0 ? 'var(--grey-6)' : 'var(--grey-7)', 'stroke-width': 1 }));
    g.append(svg('text', { x: x0 - 8, y: y + 4, 'text-anchor': 'end', fill: 'var(--grey-5)',
                           'font-family': 'var(--mono)', 'font-size': 13 }, fmtY(v)));
  }

  // drawdown band
  if (drawdown && drawdown.fromIndex >= 0 && drawdown.toIndex > drawdown.fromIndex) {
    const xa = X(drawdown.fromIndex), xb = X(drawdown.toIndex);
    g.append(svg('rect', { x: xa, y: y0, width: Math.max(xb - xa, 2), height: y1 - y0, fill: 'rgba(var(--loss-rgb), 0.10)' }));
    g.append(svg('line', { x1: xa, y1: Y(drawdown.peak), x2: xb, y2: Y(drawdown.peak),
                           stroke: 'var(--orange)', 'stroke-width': 1.4, 'stroke-dasharray': '5 4' }));
    g.append(svg('line', { x1: xb, y1: Y(drawdown.peak), x2: xb, y2: Y(points[drawdown.toIndex].v),
                           stroke: 'var(--orange)', 'stroke-width': 1.4 }));
  }

  // area + line
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const id = 'grad_' + Math.random().toString(36).slice(2, 8);
  const defs = svg('defs');
  const lg = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  lg.append(svg('stop', { offset: '0%', 'stop-color': 'var(--profit)', 'stop-opacity': .30 }));
  lg.append(svg('stop', { offset: '100%', 'stop-color': 'var(--profit)', 'stop-opacity': .02 }));
  defs.append(lg); g.append(defs);
  g.append(svg('path', { class: 'line-area',
    d: `${d} L${X(points.length - 1).toFixed(1)},${Y(lo).toFixed(1)} L${X(0).toFixed(1)},${Y(lo).toFixed(1)} Z`, fill: `url(#${id})` }));
  // pathLength="1" normalises the dash maths, so one keyframe draws any curve.
  g.append(svg('path', { class: 'line-draw', d, fill: 'none', stroke: color, 'stroke-width': 2.2,
                         'stroke-linejoin': 'round', 'stroke-linecap': 'round', pathLength: 1 }));
  const last = points.length - 1;
  g.append(svg('circle', { class: 'line-tip', cx: X(last), cy: Y(points[last].v), r: 5.5,
                           fill: color, stroke: 'var(--grey-8)', 'stroke-width': 2.5 }));

  // x labels — at most 5, evenly spaced
  const step = Math.max(1, Math.ceil(points.length / 5));
  for (let i = 0; i < points.length; i += step) {
    g.append(svg('text', { x: X(i), y: height - 8, 'text-anchor': 'middle', fill: 'var(--grey-5)',
                           'font-family': 'var(--mono)', 'font-size': 13 }, fmtX(points[i], i)));
  }
  return g;
}

/* ---------- toast ---------- */
let toastTimer;
export function toast(message, tone = 'ok') {
  let t = document.getElementById('toast');
  if (!t) {
    t = el('div', { id: 'toast', style: {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--grey-8)', color: 'var(--ink)', font: '400 12.5px var(--mono)',
      padding: '12px 20px', borderRadius: 'var(--r-btn)', zIndex: 200,
      boxShadow: '0 12px 32px rgba(0,0,0,.4)', opacity: 0, pointerEvents: 'none',
      transition: 'opacity var(--d-short) var(--e-out), transform var(--d-short) var(--e-out)',
    }});
    document.body.append(t);
  }
  t.textContent = message;
  t.style.borderLeft = `3px solid ${tone === 'bad' ? 'var(--orange)' : tone === 'warn' ? 'var(--yellow)' : 'var(--green)'}`;

  /* The toast is one reused element, so the rise has to be replayed by hand:
     put it back down, force a reflow so the browser sees the jump, then lift. */
  t.style.transition = 'none';
  t.style.opacity = '0';
  t.style.transform = 'translate(-50%, 10px)';
  void t.offsetHeight;
  t.style.transition = 'opacity var(--d-short) var(--e-out), transform var(--d-short) var(--e-out)';
  t.style.opacity = '1';
  t.style.transform = 'translate(-50%, 0)';

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translate(-50%, 6px)';
  }, 2600);
}
