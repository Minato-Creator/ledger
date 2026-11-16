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
  copy:      '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  download:  '<path d="M12 4v12"/><path d="M7.5 11.5 12 16l4.5-4.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
  camera:    '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-1.8a1.5 1.5 0 0 1 1.2-.7h2.8a1.5 1.5 0 0 1 1.2.7L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.4" r="3.4"/>',
  image:     '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M3.5 17l4.6-4.2a1.6 1.6 0 0 1 2.2 0L14 16"/><path d="M13.5 14.5l2.4-2.2a1.6 1.6 0 0 1 2.2 0l2.4 2.2"/>',
  expand:    '<path d="M14 4h6v6"/><path d="M10 20H4v-6"/><path d="M20 4l-7 7"/><path d="M4 20l7-7"/>',
  close:     '<path d="M6 6l12 12M18 6L6 18"/>',
  user:      '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6"/>',
  upload:    '<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  /* A clipboard with a tick on it: the week, gone back over. */
  review:    '<rect x="5" y="4.5" width="14" height="17" rx="2.5"/><path d="M9 4.5V3.5h6v1"/><path d="M8.8 13l2.3 2.3 4.3-4.6"/>',
  /* A building with columns: a firm. */
  firms:     '<path d="M3.5 9 12 4.5 20.5 9"/><path d="M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5"/><path d="M3.5 20h17"/>',
  /* An office block: a prop firm. */
  building:  '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 7.5h1.5M13.5 7.5H15M9 11h1.5M13.5 11H15M9 14.5h1.5M13.5 14.5H15"/><path d="M10.5 20.5V18h3v2.5"/>',
  lab:       '<path d="M9 3.5h6"/><path d="M10 3.5v5.8L4.6 18.6A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.4L14 9.3V3.5"/><path d="M7.3 15h9.4"/>',
  /* The new shell's few extra marks, drawn on the same grid. */
  gear:      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  palette:   '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10.5" cy="7" r="1.1"/><circle cx="15" cy="7.5" r="1.1"/>',
  more:      '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="3"/>',
  undo:      '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo:      '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  bookmark:  '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
  sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon:      '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  search:    '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  journal:   '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  plan:      '<path d="M8 4.5H6a1.5 1.5 0 0 0-1.5 1.5v13.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 18 4.5h-2"/><rect x="8" y="3" width="8" height="3.5" rx="1"/><path d="M8.5 11.5h7M8.5 15.5h5"/>',
  vault:     '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8v-1M12 16.2v-1M15.2 12h1M7.8 12h1"/>',
  chart:     '<path d="M4 19.5h16"/><path d="M7 15.5V10M12 15.5V6M17 15.5v-3.5"/>',
  shield:    '<path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z"/>',
  /* Six dots. Stroke-linecap is round, so a line of no length draws one. */
  share:     '<path d="M12 3.5v11.5"/><path d="M8 7.5l4-4 4 4"/><path d="M6 11.5H5.5A1.5 1.5 0 0 0 4 13v6.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V13a1.5 1.5 0 0 0-1.5-1.5H18"/>',
  film:      '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7.5 5v14M16.5 5v14M3 9.7h4.5M3 14.3h4.5M16.5 9.7H21M16.5 14.3H21"/>',
  gif:       '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10 10.1a2 2 0 1 0 0 3.8v-1.6H9"/><path d="M13 9.8v4.4"/><path d="M16 14.2V9.8h2.6M16 12h2"/>',
  volume:    '<path d="M4 9.6v4.8h3.4L12 18.4V5.6L7.4 9.6z"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  mute:      '<path d="M4 9.6v4.8h3.4L12 18.4V5.6L7.4 9.6z"/><path d="M16 9.8l4.4 4.4M20.4 9.8L16 14.2"/>',
  play:      '<path d="M8 5.5v13l10.5-6.5z"/>',
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
/* the wordmark's two halves: the L (its own units, 0–926 × 0–155 once scaled) and LAMINAR — the intro moves them apart (intro.js) */
export const MARK_G = `<g transform="scale(0.30754) translate(-212,-101)" stroke="currentColor" stroke-width="14" stroke-linejoin="round"><path d="M226.0,190.1 L354.0,119.8 L354.0,432.8 L226.0,501.3Z"/><path d="M282.3,533.3 L504.9,403.1 L595.3,457.9 L368.2,589.8Z"/></g>`;
export const LETTERS_G = `<g transform="translate(186.2,127.5) scale(0.142857,-0.142857)"><path transform="translate(0,0)" d="M114 0V700H188V64H580V0Z"/><path transform="translate(649,0)" d="M2 0 322 700H395L715 0H637L343 657H373L79 0ZM128 187 150 247H557L579 187Z"/><path transform="translate(1426,0)" d="M114 0V700H175L495 154H463L780 700H841V0H770V589H787L495 89H460L166 589H185V0Z"/><path transform="translate(2441,0)" d="M114 0V700H188V0Z"/><path transform="translate(2803,0)" d="M114 0V700H175L658 92H626V700H699V0H638L156 608H188V0Z"/><path transform="translate(3676,0)" d="M2 0 322 700H395L715 0H637L343 657H373L79 0ZM128 187 150 247H557L579 187Z"/><path transform="translate(4453,0)" d="M114 0V700H376Q465 700 529.0 671.5Q593 643 627.5 589.5Q662 536 662 460Q662 386 627.5 332.5Q593 279 529.0 250.5Q465 222 376 222H155L188 256V0ZM592 0 412 254H492L673 0ZM188 250 155 285H374Q479 285 533.5 331.0Q588 377 588 460Q588 544 533.5 590.0Q479 636 374 636H155L188 671Z"/></g>`;
const WORDMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 925.7 155.0" fill="currentColor" role="img" aria-label="Laminar">${MARK_G}${LETTERS_G}</svg>`;

export function brandMark(size = 26) {
  const img = document.createElement('img');
  img.src = MARK_PNG; img.width = size; img.height = size; img.alt = 'Laminar'; img.draggable = false;
  img.className = 'brand-img';
  return img;
}

/** The wordmark as an SVG file in one colour, for drawing on a canvas. */
export const wordmarkSvg = (colour = '#fff') =>
  WORDMARK_SVG.replace('<svg ', '<svg width="926" height="155" ').replace(/currentColor/g, colour);

/** The L and the name, `height` px tall. */
export function brandWordmark(height = 22) {
  const box = document.createElement('span');
  box.className = 'brand-word';
  box.innerHTML = WORDMARK_SVG;
  const s = box.firstChild;
  s.setAttribute('height', height); s.style.width = 'auto'; s.style.display = 'block';
  return box;
}

/* ---------- toast ---------- */
let toastTimer;
export function toast(message, tone = 'ok') {
  let t = document.getElementById('toast');
  if (!t) {
    t = el('div', { id: 'toast', role: 'status', 'aria-live': 'polite', style: {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--grey-8)', color: 'var(--ink)', font: '400 12.5px var(--mono)',
      padding: '12px 20px', borderRadius: 'var(--r-btn)', zIndex: 400,
      boxShadow: '0 12px 32px rgba(0,0,0,.4)', opacity: 0, pointerEvents: 'none',
    }});
    document.body.append(t);
  }
  t.textContent = message;
  t.style.setProperty('--tone', tone === 'bad' ? 'var(--loss)' : tone === 'warn' ? 'var(--yellow)' : 'var(--profit)');
  t.dataset.tone = tone;

  /* One reused element, so the spring is replayed by hand: drop the class,
     force a reflow so the browser sees it gone, then put it back. */
  t.classList.remove('is-in', 'is-out');
  void t.offsetHeight;
  t.style.opacity = '1';
  t.classList.add('is-in');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('is-in');
    t.classList.add('is-out');
    setTimeout(() => { if (t.classList.contains('is-out')) t.style.opacity = '0'; }, 240);
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

/** "Demo" beside a trade taken on a demo (practice) account — from the OANDA sync (oandasync.js). */
export const demoTag = t => (t && t.demo ? el('span', { class: 'demo-tag', title: 'Taken on a demo (practice) account' }, 'Demo') : null);
/* "Today" in place of the date for a trade taken today, so the newest stand out in the Journal (Minato) */
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const isToday = t => !!t && t.date === todayLocal();
export const todayTag = () => el('span', { class: 'today-tag', title: 'Taken today' }, 'Today');
