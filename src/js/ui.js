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
  outlook:   '<path d="M12 3.6a8.4 8.4 0 1 0 8.4 8.4"/><path d="M12 8.6v3.9l2.7 1.6"/><path d="M17.4 3.4v4.2h4.2"/>',
  plus:      '<path d="M12 5v14M5 12h14"/>',
  minus:     '<path d="M5 12h14"/>',
  chevdown:  '<path d="M6 9l6 6 6-6"/>',
  chevright: '<path d="M9 6l6 6-6 6"/>',
  chevleft:  '<path d="M15 6l-6 6 6 6"/>',
  switch:    '<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>',
  check:     '<path d="M5 13l4.5 4.5L19 7"/>',
  folder:    '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2a2 2 0 0 1 1.5.7l1 1.2h7.3A2.5 2.5 0 0 1 21 9.4v8.1a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
  /* Forex Factory marks an event's weight with a coloured folder, so that is
     what this is — filled rather than drawn in outline, because at 13px a
     filled shape is the only one whose colour actually reads. */
  refresh:   '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 3.6v4.2h-4.2"/>',
  wire:      '<path d="M4 5.5h16v13H7a3 3 0 0 1-3-3z"/><path d="M20 8.5h1.5a1.5 1.5 0 0 1 1.5 1.5v6a2.5 2.5 0 0 1-5 0"/><path d="M7 9h7M7 12.5h7M7 16h4"/>',
  trash:     '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  pencil:    '<path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z"/>',
  download:  '<path d="M12 4v12"/><path d="M7.5 11.5 12 16l4.5-4.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
  image:     '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M3.5 17l4.6-4.2a1.6 1.6 0 0 1 2.2 0L14 16"/><path d="M13.5 14.5l2.4-2.2a1.6 1.6 0 0 1 2.2 0l2.4 2.2"/>',
  expand:    '<path d="M14 4h6v6"/><path d="M10 20H4v-6"/><path d="M20 4l-7 7"/><path d="M4 20l7-7"/>',
  close:     '<path d="M6 6l12 12M18 6L6 18"/>',
  user:      '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6"/>',
  upload:    '<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  /* A clipboard with a tick on it: the week, gone back over. */
  review:    '<rect x="5" y="4.5" width="14" height="17" rx="2.5"/><path d="M9 4.5V3.5h6v1"/><path d="M8.8 13l2.3 2.3 4.3-4.6"/>',
  /* A building with columns: a firm. */
  firms:     '<path d="M3.5 9 12 4.5 20.5 9"/><path d="M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5"/><path d="M3.5 20h17"/>',
  lab:       '<path d="M9 3.5h6"/><path d="M10 3.5v5.8L4.6 18.6A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.4L14 9.3V3.5"/><path d="M7.3 15h9.4"/>',
  /* Six dots. Stroke-linecap is round, so a line of no length draws one. */
  grip:      '<path d="M9.5 6h.01M14.5 6h.01M9.5 12h.01M14.5 12h.01M9.5 18h.01M14.5 18h.01"/>',
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

/** Forex Factory's folder, filled. The colour is the whole message. */
export function folderMark(fill, size = 13) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  n.setAttribute('width', size); n.setAttribute('height', size);
  n.setAttribute('viewBox', '0 0 24 24'); n.setAttribute('fill', fill);
  n.innerHTML = '<path d="M3 6.6A2.1 2.1 0 0 1 5.1 4.5h3.3a1.8 1.8 0 0 1 1.3.6l1.2 1.3h8A2.1 2.1 0 0 1 21 8.5v9A2.1 2.1 0 0 1 18.9 19.6H5.1A2.1 2.1 0 0 1 3 17.5z"/>';
  return n;
}

/* ---------- the Laminar mark and wordmark ----------

   The icon: his L in black, on the red-to-black glow, in the soft square —
   the same picture as the app icon (src-tauri/icons) and the tab; embedded
   as one 128-px PNG so the one-file build keeps it.
   The wordmark: the L and LAMINAR (Montserrat, outlined, so no font is
   needed) in the sidebar's ink — currentColor, so it follows the theme. */
export const MARK_PNG = 'data:image/png;base64,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';
const WORDMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 925.7 155.0" fill="currentColor" role="img" aria-label="Laminar"><g transform="scale(0.30754) translate(-212,-101)" stroke="currentColor" stroke-width="14" stroke-linejoin="round"><path d="M226.0,190.1 L354.0,119.8 L354.0,432.8 L226.0,501.3Z"/><path d="M282.3,533.3 L504.9,403.1 L595.3,457.9 L368.2,589.8Z"/></g><g transform="translate(186.2,127.5) scale(0.142857,-0.142857)"><path transform="translate(0,0)" d="M114 0V700H188V64H580V0Z"/><path transform="translate(649,0)" d="M2 0 322 700H395L715 0H637L343 657H373L79 0ZM128 187 150 247H557L579 187Z"/><path transform="translate(1426,0)" d="M114 0V700H175L495 154H463L780 700H841V0H770V589H787L495 89H460L166 589H185V0Z"/><path transform="translate(2441,0)" d="M114 0V700H188V0Z"/><path transform="translate(2803,0)" d="M114 0V700H175L658 92H626V700H699V0H638L156 608H188V0Z"/><path transform="translate(3676,0)" d="M2 0 322 700H395L715 0H637L343 657H373L79 0ZM128 187 150 247H557L579 187Z"/><path transform="translate(4453,0)" d="M114 0V700H376Q465 700 529.0 671.5Q593 643 627.5 589.5Q662 536 662 460Q662 386 627.5 332.5Q593 279 529.0 250.5Q465 222 376 222H155L188 256V0ZM592 0 412 254H492L673 0ZM188 250 155 285H374Q479 285 533.5 331.0Q588 377 588 460Q588 544 533.5 590.0Q479 636 374 636H155L188 671Z"/></g></svg>`;

export function brandMark(size = 26) {
  const img = document.createElement('img');
  img.src = MARK_PNG; img.width = size; img.height = size; img.alt = 'Laminar'; img.draggable = false;
  img.className = 'brand-img';
  return img;
}

/** The L and the name, `height` px tall. */
export function brandWordmark(height = 22) {
  const box = document.createElement('span');
  box.className = 'brand-word';
  box.innerHTML = WORDMARK_SVG;
  const s = box.firstChild;
  s.setAttribute('height', height); s.style.width = 'auto'; s.style.display = 'block';
  return box;
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

/* The mark a forward test carries where its size and its money would be.
   Quiet — it is a label, not a figure, and the row it sits in already has a
   result of its own in the R column. */
export const ft = () => el('span', { class: 'ft-mark' }, 'FT');

/* ============================================================
   Nothing deletes on one click

   Every destructive button in Quire arms itself first. The first click turns
   it orange and makes it say what it is about to do; the second does it. It
   disarms on its own after a few seconds, and the moment you click anywhere
   else — so a stray click costs you nothing, and a deliberate one costs you
   a second click.

   A modal was the other option and it is worse here: it takes the whole
   window away from you to ask a question you can answer in place, and it
   would need its own focus handling on every page. This asks where the thing
   you are deleting still is.
   ============================================================ */
export const ARM_MS = 4000;

export function confirmButton({
  label,                       // what it reads normally: text, or a node (an icon)
  armedLabel = 'Confirm',      // what it reads once armed
  title = '',
  armedTitle = 'Click again, or click away to cancel',
  className = '',
  armedClassName = null,       // defaults to className
  style = {},
  armedStyle = null,           // defaults to an orange version of style
  onConfirm,
  onArm = null,
} = {}) {
  let armed = false, timer = null;

  const away = (e) => {
    if (!btn.isConnected) return stand();
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'pointerdown' && btn.contains(e.target)) return;
    disarm();
  };
  /* Take the listeners off and stop the clock, without touching how the
     button looks — used both when disarming and when the page has gone. */
  function stand() {
    clearTimeout(timer); timer = null;
    document.removeEventListener('pointerdown', away, true);
    document.removeEventListener('keydown', away, true);
  }
  function disarm() { armed = false; stand(); paint(); }
  function arm() {
    armed = true;
    stand();
    timer = setTimeout(disarm, ARM_MS);
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', away, true);
    paint();
    if (onArm) onArm();
  }

  const btn = el('button', { type: 'button' });
  function paint() {
    btn.className = (armed ? (armedClassName ?? className) : className) || '';
    btn.setAttribute('title', armed ? armedTitle : title);
    btn.removeAttribute('style');
    const s = armed
      ? (armedStyle ?? { ...style, color: 'var(--orange)', background: 'transparent' })
      : style;
    for (const [k, v] of Object.entries(s)) {
      if (v == null) continue;
      if (k.startsWith('--')) btn.style.setProperty(k, String(v));
      else btn.style[k] = v;
    }
    btn.replaceChildren(...[armed ? armedLabel : label].flat(Infinity)
      .filter(x => x != null && x !== false)
      .map(x => x instanceof Node ? x : document.createTextNode(String(x))));
  }
  btn.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!armed) return arm();
    disarm();
    await onConfirm(e);
  });
  paint();
  return btn;
}

/* ============================================================
   A picture, full size

   Over everything, with the others an arrow key away. Escape closes it; so
   does clicking the backdrop, because that is what everyone tries first.

   It takes names and a way to turn a name into a URL rather than a store, so
   the trade page and the outlook page share one viewer instead of each
   growing their own.
   ============================================================ */
export function lightbox({ items, urlFor, at = 0 }) {
  if (!items || !items.length) return null;
  let i = Math.max(0, Math.min(at, items.length - 1));

  const img = el('img', { alt: '' });
  const label = el('span', { class: 't' });
  const count = el('span', { class: 'n' });
  const box = el('div', { class: 'lightbox' },
    el('div', { class: 'bar' }, label, count,
      el('div', { class: 'spacer', style: { flex: 1 } }),
      el('button', { class: 'x', onClick: close }, icon('close', 14, 'var(--grey-1)', 2))),
    el('div', { class: 'stage', onClick: e => { if (e.target !== img) close(); } }, img));

  async function show(n) {
    i = (n + items.length) % items.length;
    label.textContent = items[i].label || '';
    count.textContent = items.length > 1 ? `${i + 1} / ${items.length}` : '';
    const url = await urlFor(items[i].name);
    if (url) img.src = url;
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') show(i + 1);
    else if (e.key === 'ArrowLeft') show(i - 1);
  }
  function close() {
    document.removeEventListener('keydown', onKey);
    box.remove();
  }
  document.addEventListener('keydown', onKey);
  document.body.append(box);
  show(i);
  return box;
}

/* ============================================================
   Putting a list in your own order

   Some orders cannot be worked out. Nothing in the data says that how you
   read structure comes before how you read timing — only that you think
   about them in that order, and a list that keeps re-sorting itself will
   not hold your thinking. So this one drags.

   The element itself moves as the pointer crosses its neighbours' middles.
   That matters: what you are looking at while you drag is what you get when
   you let go, so there is no ghost trailing the cursor and no rearranging
   afterwards to find out what you meant.

   It is built on pointer events rather than HTML5 drag-and-drop, which
   cannot be styled, has no idea what a handle is, and behaves differently
   in each of the webviews this app ships inside.

   The same handle takes the arrow keys, because moving a group from
   fifteenth to first is a long drag across a card that scrolls, and
   fourteen taps of a key is not a drag at all.

   The container is the items' own parent, and only children carrying a sort
   id take part — an "add another" button can sit in the same list without
   ever becoming something you can drag or drop onto.
   ============================================================ */
export function sortable(container, { onDrop, item = '[data-sortid]', grip = '[data-grip]' } = {}) {
  if (!container) return container;
  const kids = () => [...container.children].filter(n => n.matches(item));
  const ids = () => kids().map(n => n.dataset.sortid);

  /* Nothing is saved unless the order actually changed: a drag that ends
     where it started, or a click on a tag, must not write to the journal. */
  const commit = (before, id) => {
    const now = ids();
    if (now.join('\u0000') === before.join('\u0000')) return;
    onDrop(now, id);
  };

  /* Which sibling the pointer is over, or the nearest one to it — dragging
     past the end of the list has to mean the end of the list. */
  const nearest = (x, y, self) => {
    let best = null, bestD = Infinity;
    for (const k of kids()) {
      if (k === self) continue;
      const r = k.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  };

  /* A chip sits beside its neighbours, a group sits above them, and which
     half of the target you are on depends on which. It is read off the
     layout rather than configured: if anything else shares that line, the
     list is flowing across. */
  const acrossFrom = (over) => {
    const r = over.getBoundingClientRect();
    return kids().some(k => {
      if (k === over) return false;
      const o = k.getBoundingClientRect();
      const overlap = Math.min(o.bottom, r.bottom) - Math.max(o.top, r.top);
      return overlap > Math.min(o.height, r.height) * 0.5;
    });
  };

  container.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    const handle = e.target.closest(grip);
    if (!handle || !container.contains(handle)) return;
    const node = handle.closest(item);
    if (!node || node.parentElement !== container) return;
    /* When the thing is its own handle — a tag you pick up by the tag — it
       still has a delete button and a name field inside it, and those are
       not for dragging. Anything that can be clicked in its own right, and
       is not the handle, is left alone. */
    const hit = e.target.closest('button, input, textarea, select, a');
    if (hit && hit !== handle) return;

    const before = ids();
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;

    const move = (ev) => {
      if (!moved) {
        /* A few pixels of slop, so a click stays a click. */
        if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 4) return;
        moved = true;
        node.classList.add('is-dragging');
        container.classList.add('is-sorting');
      }
      const over = nearest(ev.clientX, ev.clientY, node);
      if (!over) return;
      const r = over.getBoundingClientRect();
      const after = acrossFrom(over)
        ? ev.clientX > r.left + r.width / 2
        : ev.clientY > r.top + r.height / 2;
      if (after) { if (over.nextElementSibling !== node) over.after(node); }
      else { if (over.previousElementSibling !== node) over.before(node); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      node.classList.remove('is-dragging');
      container.classList.remove('is-sorting');
      if (moved) commit(before, node.dataset.sortid);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    e.preventDefault();
    handle.focus?.();
  });

  container.addEventListener('keydown', (e) => {
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    const on = back || e.key === 'ArrowDown' || e.key === 'ArrowRight';
    if (!on || e.metaKey || e.ctrlKey || e.altKey) return;
    const handle = e.target.closest?.(grip);
    if (!handle) return;
    const node = handle.closest(item);
    if (!node || node.parentElement !== container) return;
    const list = kids();
    const to = list.indexOf(node) + (back ? -1 : 1);
    if (to < 0 || to >= list.length) return;
    e.preventDefault();
    const before = ids();
    if (back) list[to].before(node); else list[to].after(node);
    commit(before, node.dataset.sortid);
  });

  return container;
}

/* Draw to the space you actually have. Shared by the Year chart and The
   Lab's charts.

   An SVG with a fixed viewBox stretched to the card's width is scaled, which
   shrinks its type along with everything else and leaves whatever height it
   does not want as dead space. Measuring first and drawing in real pixels
   means the chart fills the card and 11px stays 11px. */
export function fitted(draw, minHeight = 240) {
  const box = el('div', { style: { flex: '1', minHeight: minHeight + 'px', minWidth: 0 } });
  let last = '';
  const paint = () => {
    const w = Math.round(box.clientWidth), h = Math.round(box.clientHeight);
    if (!w || !h) return;
    const key = w + 'x' + h;
    if (key === last) return;
    last = key;
    box.replaceChildren(draw(w, h));
  };
  requestAnimationFrame(paint);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => { box.isConnected ? paint() : ro.disconnect(); });
    ro.observe(box);
  }
  return box;
}
