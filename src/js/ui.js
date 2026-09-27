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

/* ---------- the Quire mark ----------

   Four shapes on black: a quire is a set of folded pages bound together, and
   this is that set seen edge-on. The colours are fixed — the profit and loss
   colours elsewhere in the app are yours to change, but a mark that changes
   colour is not a mark. Drawn from one 220-unit grid so the icon, the tab and
   the sidebar are the same artwork at different sizes rather than three
   drawings that nearly agree. */
export const MARK_SHAPES = [
  ['18', '60', '70', '140', '35', '#0988F0'],
  ['98', '18', '60', '60', '18', '#F4624A'],
  ['98', '88', '60', '112', '30', '#E9E9E9'],
  ['168', '40', '36', '80', '18', '#6C6C6C'],
];

export function brandMark(size = 26, radius = 49.5) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 220 220'); s.setAttribute('fill', 'none');
  s.innerHTML =
    `<rect width="220" height="220" rx="${radius}" fill="#000000"/>`
    + `<g transform="translate(110,110) scale(0.8) translate(-110,-110)">`
    + MARK_SHAPES.map(([x, y, w, h, r, fill]) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`).join('')
    + `</g>`;
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
