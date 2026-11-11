/* ============================================================
   Journal → Notes → one note (11 Nov)

   Laid out to be read: a narrow column in the middle of the window with room
   either side, the title large, a thin rule under it, and every Section
   heading numbered in a circle out in the left margin.

   The writing is a contenteditable page with the browser's own editing
   underneath (execCommand — old, but the one thing that gives typing,
   selection and undo for free in WebView2 and Chromium alike). Whatever it
   writes is cleaned on the way in and on the way out (clean, below), so a
   note only ever holds the handful of tags this page knows how to show.

   Colours and sizes are kept as classes (tc-red, hl-yellow, fs-l), never as
   inline styles: the browser is asked for a colour nobody would choose
   (rgb(1, 2, 5)) and that exact colour is swapped for its class straight
   after. The palette itself lives in app.css, in one place.

   Pictures sit in the text as <span class="ne-img">, so they float — left or
   right with the writing wrapping round them, or on a line of their own in
   the middle. Dragging one moves it through the text as you go, the words
   flowing round it; which third of the column you are over picks the side.
   The corner handle sizes it. The files live in screenshots/ like a trade's
   charts (store.putNoteImage) and go in the backup with everything else.

   A TradingView snapshot link pasted on its own becomes the chart.

   The app redraws a page by building it again, and a redraw can come from
   anywhere (a sync finishing, say). A note being written cannot be rebuilt
   from what was last saved without losing the caret and the last few words,
   so while a note is open its page is kept (live, below) and handed back
   as it is, with the caret put back where it was.
   ============================================================ */
import { el, icon, toast, confirmButton } from '../ui.js';
import { prepare, imageOnClipboard, snapshotOf, fetchSnapshot } from '../shots.js';

export const NOTE_KINDS = [['lesson', 'Lesson'], ['watch', 'Watch out'], ['focus', 'Focus']];

const COLOURS = ['grey', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
const COLOUR_NAME = { grey: 'Grey', red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple', pink: 'Pink' };
const SIZES = [['s', 'Small'], ['', 'Normal'], ['l', 'Large'], ['xl', 'Huge']];
const BLOCKS = [['p', 'Text'], ['h1', 'Heading'], ['h2', 'Section'], ['h3', 'Subheading'], ['blockquote', 'Quote']];
const BLOCK_OF = { P: 'p', DIV: 'p', H1: 'h1', H2: 'h2', H3: 'h3', BLOCKQUOTE: 'blockquote', LI: 'li' };
const FAMILY = { tc: COLOURS, hl: COLOURS, fs: ['s', 'l', 'xl'] };

/* the colours asked of the browser, which nobody would pick: text → rgb(1, 2, 3 + i), highlight → rgb(2, 1, 3 + i); i = 0 is "none" */
const ASK_TEXT = i => `rgb(1, 2, ${3 + i})`;
const ASK_HL = i => `rgb(2, 1, ${3 + i})`;
const TEXT_RE = /^rgb\(1, 2, (\d+)\)$/, HL_RE = /^rgb\(2, 1, (\d+)\)$/;
const colourAt = v => (+v >= 4 ? COLOURS[+v - 4] || '' : '');

const SHOT_RE = /^screenshots\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']*[^\s<>"'.,;:!?)\]}]/g;

/* ---------- small marks for the toolbar, drawn on the app's 24 grid ---------- */
const glyph = (d, size = 17) => el('span', { class: 'ne-g', html:
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>` });
const G = {
  ul: '<path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20"/><path d="M4.6 6.5h.01M4.6 12h.01M4.6 17.5h.01" stroke-width="2.8"/>',
  ol: '<path d="M10.5 6.5H20M10.5 12H20M10.5 17.5H20"/><path d="M4 5.2l1.4-.9v4.4M3.8 13.6a1.3 1.3 0 0 1 2.4.6c0 1-2.4 1.8-2.4 2.9h2.6" stroke-width="1.4"/>',
  hr: '<path d="M3.5 12h17"/><path d="M7 6.5h10M7 17.5h10" opacity=".4"/>',
  link: '<path d="M10.2 13.8a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1"/><path d="M13.8 10.2a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>',
  open: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18V7.5A1.5 1.5 0 0 1 5.5 6H10"/>',
  tv: '<rect x="3" y="4.5" width="18" height="13" rx="2.5"/><path d="M7 14l3-3.5 2.5 2 4.5-5"/><path d="M9 20.5h6"/>',
  left: '<rect x="3.5" y="5" width="8" height="7.5" rx="1.4"/><path d="M14.5 6h6M14.5 9.5h6M14.5 13h6M3.5 17h17M3.5 20h12"/>',
  center: '<rect x="7" y="4" width="10" height="8.5" rx="1.4"/><path d="M3.5 16.5h17M3.5 20h17"/>',
  right: '<rect x="12.5" y="5" width="8" height="7.5" rx="1.4"/><path d="M3.5 6h6M3.5 9.5h6M3.5 13h6M3.5 17h17M8.5 20h12"/>',
};

/* ============================================================
   What a note may hold
   ============================================================ */
const KEEP = new Set(['P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'HR', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'A', 'SPAN', 'CODE', 'SUB', 'SUP']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'APPLET', 'SVG', 'MATH', 'CANVAS', 'VIDEO', 'AUDIO',
  'IMG', 'PICTURE', 'SOURCE', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'FORM', 'LINK', 'META', 'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE']);
const markOf = (classes, fam) => [...classes].find(c => c.startsWith(fam + '-') && FAMILY[fam].includes(c.slice(fam.length + 1)));

/** A web address from what someone typed or pasted (forexfactory.com counts), or null. */
export function webLink(raw) {
  let s = String(raw || '').trim();
  if (!s || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    if (!/^[\w-]+(\.[\w-]+)+(?::\d+)?(?:[/?#]|$)/.test(s)) return null;
    s = 'https://' + s;
  }
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname ? u.href : null; } catch { return null; }
}

/** A note's html with only what this page shows: no scripts, no styles, no pictures from elsewhere. */
export function clean(html) {
  const tpl = document.createElement('template');   // inert: nothing in it runs or loads
  tpl.innerHTML = String(html || '');
  tidy(tpl.content);
  return tpl.innerHTML;
}
function tidy(parent) {
  for (const n of [...parent.childNodes]) {
    if (n.nodeType === 3) continue;
    if (n.nodeType !== 1) { n.remove(); continue; }
    const tag = n.tagName;
    if (DROP.has(tag)) { n.remove(); continue; }
    if (tag === 'SPAN' && n.classList.contains('ne-img')) { keepPicture(n); continue; }
    tidy(n);
    if (/^H[4-6]$/.test(tag)) strip(retag(n, 'h3'));
    else if (tag === 'DIV') { if (n.querySelector('p,h1,h2,h3,ul,ol,blockquote,hr,li')) unwrap(n); else strip(retag(n, 'p')); }
    /* Google Docs wraps a whole paste in a <b> that is not bold */
    else if (tag === 'B' && /font-weight:\s*(?:normal|[1-4]00)\b/.test(n.getAttribute('style') || '')) unwrap(n);
    else if (!KEEP.has(tag)) unwrap(n);
    else strip(n);
  }
}
function strip(e) {
  const tag = e.tagName;
  const href = tag === 'A' ? webLink(e.getAttribute('href')) : null;
  const marks = tag === 'SPAN' ? ['tc', 'hl', 'fs'].map(f => markOf(e.classList, f)).filter(Boolean) : [];
  for (const a of [...e.attributes]) e.removeAttribute(a.name);
  if (tag === 'A') { if (href) e.setAttribute('href', href); else return unwrap(e); }
  if (tag === 'SPAN') { if (marks.length) e.className = marks.join(' '); else return unwrap(e); }
  if (!e.firstChild && !/^(BR|HR|P|H1|H2|H3|LI|BLOCKQUOTE)$/.test(tag)) e.remove();
}
function retag(e, tag) { const n = document.createElement(tag); n.append(...e.childNodes); e.replaceWith(n); return n; }
function unwrap(e) { e.replaceWith(...e.childNodes); }
function keepPicture(e) {
  const shot = e.getAttribute('data-shot') || '', side = e.getAttribute('data-float'), w = Math.round(+e.getAttribute('data-w'));
  const link = snapshotOf(e.getAttribute('data-link') || '')?.link;
  if (!SHOT_RE.test(shot)) { e.remove(); return; }
  for (const a of [...e.attributes]) e.removeAttribute(a.name);
  e.className = 'ne-img';
  e.setAttribute('data-shot', shot);
  e.setAttribute('data-float', ['left', 'right', 'center'].includes(side) ? side : 'center');
  if (w >= 15 && w <= 100) e.setAttribute('data-w', String(w));
  if (link) e.setAttribute('data-link', link);
  e.replaceChildren();
}

/** What a note says, without the markup: one space between paragraphs (for the list and search). */
export function plainOf(node) {
  let out = '';
  const walk = n => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { out += c.data; continue; }
      if (c.nodeType !== 1 || c.classList.contains('ne-img')) continue;
      const block = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|UL|OL|HR|BR)$/.test(c.tagName);
      if (block) out += ' ';
      walk(c);
      if (block) out += ' ';
    }
  };
  walk(node);
  return out.replace(/​/g, '').replace(/\s+/g, ' ').trim();
}

const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clampW = w => Math.max(15, Math.min(100, Math.round(w) || 100));

/** A link opened in the computer's browser (main.rs open_link), or a new tab on the web. */
export async function openLink(raw) {
  const href = webLink(raw);
  if (!href) { toast('That link is not a web address', 'warn'); return; }
  const tauri = typeof window !== 'undefined' && window.__TAURI__;
  if (tauri) {
    try { await tauri.core.invoke('open_link', { url: href }); }
    catch {
      try { await navigator.clipboard.writeText(href); toast('Could not open it here — link copied, paste it into your browser'); }
      catch { toast(href); }
    }
    return;
  }
  window.open(href, '_blank', 'noopener');
}

const editedAt = iso => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400e3);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const day = days === 0 ? 'today' : days === 1 ? 'yesterday'
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  return `Edited ${day}, ${time}`;
};

/* ============================================================
   The open note
   ============================================================ */
let live = null;

/** Leaving a note: what is on the page is kept, an empty note is let go and pictures taken out are tidied away. */
export function leaveNote() { if (live) live.close(); }

export function noteEditor(store, nav, id) {
  if (live && live.id === id && live.store === store) return live.again();
  leaveNote();
  const note = store.noteById(id);
  return note ? openNote(store, nav, note) : gone(nav);
}

const backButton = nav => el('button', { class: 'ne-back', onClick: () => nav.go('#/notes') },
  icon('chevleft', 16, 'currentColor', 1.8), 'Notes');

function gone(nav) {
  return el('div', { class: 'view ne-view' },
    el('div', { class: 'ne-bar' }, backButton(nav)),
    el('section', { class: 'card nt-empty' },
      el('strong', {}, 'This note is not here any more'),
      el('span', {}, 'It may have been deleted.'),
      el('button', { class: 'btn btn-quiet', style: { marginTop: '10px' }, onClick: () => nav.go('#/notes') }, 'Back to Notes')));
}

function openNote(store, nav, note) {
  const id = note.id;
  const known = new Set(note.images || []);   // every picture the note has had while open
  let timer = null, saving = null, again = false, closed = false;
  let pendingSize = '';
  let picked = null;        // the picture chosen
  let pop = null;           // the menu that is open
  let saved = null;         // where the selection was in the text, as a live Range
  let caret = null, inTitle = null, focused = false;
  let lastColour = { tc: 0, hl: 0 };

  /* ---------- the page ---------- */
  const status = el('span', { class: 'ne-status' }, 'Saved');
  const edited = el('span', { class: 'ne-edited' }, editedAt(note.updatedAt));
  const title = el('textarea', { class: 'ne-title', rows: '1', placeholder: 'Untitled', spellcheck: 'true', 'aria-label': 'Title', maxlength: '200' });
  title.value = note.title || '';
  const body = el('div', { class: 'ne-body', contenteditable: 'true', spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true',
    'aria-label': 'Note', 'data-placeholder': 'Write what you learned, what to watch out for, what to pay attention to…' });
  body.innerHTML = clean(note.html) || '<p><br></p>';
  body.querySelectorAll('.ne-img').forEach(dress);

  const kindButtons = NOTE_KINDS.map(([v, l]) => el('button', { class: `ne-kind k-${v}`, 'data-kind': v,
    onClick: () => { store.updateNote(id, { kind: note.kind === v ? null : v }); paintKinds(); stamp(); } }, el('i'), l));
  const paintKinds = () => kindButtons.forEach(b => b.classList.toggle('is-on', b.dataset.kind === note.kind));
  paintKinds();

  const pinButton = el('button', { class: 'ne-pill ne-pin', onClick: () => { store.updateNote(id, { pinned: !note.pinned }); paintPin(); stamp(); } });
  const paintPin = () => { pinButton.classList.toggle('is-on', !!note.pinned); pinButton.replaceChildren(icon('bookmark', 14), note.pinned ? 'Pinned' : 'Pin'); };
  paintPin();

  const del = confirmButton({
    label: el('span', { class: 'ne-del-in' }, icon('trash', 14), 'Delete'), armedLabel: 'Delete this note?', title: 'Delete this note',
    className: 'ne-pill ne-del',
    onConfirm: async () => {
      const images = [...new Set([...known, ...snapshot().images])];
      closed = true; detach(); if (live === self) live = null;
      await store.deleteNote(id, images);
      toast('Note deleted');
      nav.go('#/notes');
    },
  });

  /* ---------- the toolbar ---------- */
  const keepEditing = e => e.preventDefault();   // a click on the toolbar leaves the caret where it was
  const tb = (label, content, onClick, cls = '') => el('button', { class: 'ne-tb ' + cls, title: label, 'aria-label': label, onMousedown: keepEditing, onClick: e => onClick(e.currentTarget) }, content);

  const blockLabel = el('span', { class: 'ne-tb-label' }, 'Text');
  const blockButton = tb('Paragraph style', [blockLabel, icon('chevdown', 13, 'currentColor', 1.8)], b => blockMenu(b), 'ne-tb-wide');
  const sizeButton = tb('Text size', [el('span', { class: 'ne-aa' }, 'A', el('small', {}, 'A')), icon('chevdown', 13, 'currentColor', 1.8)], b => sizeMenu(b), 'ne-tb-wide');
  const state = {
    bold: tb('Bold (Ctrl+B)', el('b', { class: 'ne-letter' }, 'B'), () => run('bold')),
    italic: tb('Italic (Ctrl+I)', el('i', { class: 'ne-letter' }, 'I'), () => run('italic')),
    underline: tb('Underline (Ctrl+U)', el('u', { class: 'ne-letter' }, 'U'), () => run('underline')),
    strikeThrough: tb('Strikethrough', el('s', { class: 'ne-letter' }, 'S'), () => run('strikeThrough')),
    insertUnorderedList: tb('Bulleted list', glyph(G.ul), () => list('insertUnorderedList')),
    insertOrderedList: tb('Numbered list', glyph(G.ol), () => list('insertOrderedList')),
  };
  const colourBar = el('i', { class: 'ne-a-bar' });
  const colourButton = tb('Text colour and highlight', [el('span', { class: 'ne-a' }, 'A', colourBar), icon('chevdown', 13, 'currentColor', 1.8)], b => colourMenu(b), 'ne-tb-wide');
  const linkButton = tb('Link (Ctrl+K)', glyph(G.link), () => linkMenu());
  const file = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onChange: () => {
    const files = [...file.files]; file.value = '';
    const r = saved && saved.cloneRange();
    files.forEach(f => addPicture(f, r));
  } });
  const imageButton = tb('Add a picture', icon('image', 17), () => { keep(); file.click(); });
  const chartButton = tb('Add a TradingView chart', glyph(G.tv), b => chartMenu(b));
  const sep = () => el('i', { class: 'ne-tb-sep' });

  const tools = el('div', { class: 'ne-tools', role: 'toolbar', 'aria-label': 'Formatting' },
    el('div', { class: 'ne-tools-in' },
      blockButton, sizeButton, sep(),
      state.bold, state.italic, state.underline, state.strikeThrough, colourButton, sep(),
      state.insertUnorderedList, state.insertOrderedList, tb('Divider', glyph(G.hr), () => divider()), sep(),
      linkButton, imageButton, chartButton, file));
  function divider() {
    back();
    exec('insertHorizontalRule');
    /* a line to carry on writing under it */
    const s = getSelection();
    const hr = [...body.querySelectorAll('hr')].find(x => !x.nextElementSibling || s.anchorNode === x.parentNode);
    if (hr && !hr.nextElementSibling) {
      const p = el('p', {}, el('br'));
      hr.after(p);
      const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
      s.removeAllRanges(); s.addRange(r);
    }
    tidyMarks(); changed(); paintTools();
  }

  const paper = el('div', { class: 'ne-paper', onMousedown: e => {
    /* a click in the empty paper round the column puts the caret at the end of the note */
    if (e.target !== paper && !e.target.classList?.contains('ne-col')) return;
    e.preventDefault();
    body.focus({ preventScroll: true });
    const r = document.createRange(); r.selectNodeContents(body); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  } },
    el('article', { class: 'ne-col' },
      title,
      el('div', { class: 'ne-meta' }, el('div', { class: 'ne-kinds' }, ...kindButtons), el('div', { class: 'spacer' }), edited),
      el('div', { class: 'ne-rule' }),
      body));

  const view = el('div', { class: 'view ne-view' },
    el('div', { class: 'ne-bar' }, backButton(nav), el('div', { class: 'spacer' }), status, del, pinButton),
    tools, paper);

  /* ============================================================
     Selection, kept
     ============================================================ */
  function keep() {
    const s = getSelection();
    if (s.rangeCount && body.contains(s.getRangeAt(0).commonAncestorContainer)) saved = s.getRangeAt(0).cloneRange();
  }
  function back() {
    if (document.activeElement !== body) body.focus({ preventScroll: true });
    if (saved && body.contains(saved.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); }
  }
  /* Run something that moves nodes about, then put the caret back on the same text if it is still there. */
  function keepSelection(fn) {
    const s = getSelection();
    const at = s.rangeCount && body.contains(s.anchorNode) ? [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset] : null;
    const n = fn();
    if (!at || !n) return n;
    const ok = (node, off) => node.isConnected && body.contains(node) && off <= (node.nodeType === 3 ? node.length : node.childNodes.length);
    if (ok(at[0], at[1]) && ok(at[2], at[3])) { try { s.setBaseAndExtent(...at); } catch { /* left where the browser put it */ } }
    return n;
  }
  const closestIn = (node, sel) => { const e = node && (node.nodeType === 1 ? node : node.parentElement); const m = e && e.closest(sel); return m && body.contains(m) ? m : null; };
  function blockEl(node = getSelection().anchorNode) {
    for (let n = node; n && n !== body; n = n.parentNode) if (n.nodeType === 1 && BLOCK_OF[n.tagName]) return n;
    return null;
  }
  const blockTag = () => { const b = blockEl(); return b ? BLOCK_OF[b.tagName] : 'p'; };

  /* ============================================================
     Formatting
     ============================================================ */
  function exec(cmd, val = null, css = false) {
    document.execCommand('styleWithCSS', false, css);
    const ok = val == null ? document.execCommand(cmd, false) : document.execCommand(cmd, false, val);
    document.execCommand('styleWithCSS', false, false);
    return ok;
  }
  function run(cmd, val = null) {
    back();
    exec(cmd, val);
    tidyMarks(); changed(); paintTools();
  }
  function list(cmd) {
    back();
    /* a heading cannot be a list item: it becomes text first */
    if (/^h[123]$|^blockquote$/.test(blockTag())) exec('formatBlock', '<p>');
    exec(cmd);
    tidyMarks(); changed(); paintTools();
  }
  function setBlock(tag) {
    back();
    const now = blockTag();
    if (now === tag && tag !== 'p') tag = 'p';     // the same style again takes it off
    if (now === 'li') exec(closestIn(getSelection().anchorNode, 'ol') ? 'insertOrderedList' : 'insertUnorderedList');
    exec('formatBlock', `<${tag}>`);
    tidyMarks(); changed(); paintTools();
  }
  function setSize(v) {
    back();
    pendingSize = v;
    exec('fontSize', '7');                         // <font size="7">, turned into span.fs-… just below
    tidyMarks(); changed(); paintTools();
  }
  function setColour(fam, i) {
    back();
    lastColour[fam] = i;
    exec(fam === 'tc' ? 'foreColor' : 'hiliteColor', fam === 'tc' ? ASK_TEXT(i) : ASK_HL(i), true);
    tidyMarks(); changed(); paintTools(); paintColourBar();
  }
  function paintColourBar() { colourBar.className = 'ne-a-bar' + (lastColour.tc ? ` tc-${COLOURS[lastColour.tc - 1]}` : ''); }

  /* The marks the browser just made — <font size="7"> and the made-up colours — become classes. */
  const tidyMarks = () => keepSelection(normalize);
  function normalize() {
    let n = liftLists();
    for (const f of [...body.querySelectorAll('font')]) {
      const big = f.getAttribute('size') === '7';
      const s = document.createElement('span');
      s.append(...f.childNodes); f.replaceWith(s);
      if (big) setMark(s, 'fs', pendingSize); else bare(s);
      n++;
    }
    for (const e of [...body.querySelectorAll('[style]')]) {
      if (!e.isConnected || e.closest('.ne-img')) continue;
      const t = TEXT_RE.exec(e.style.color), h = HL_RE.exec(e.style.backgroundColor);
      e.removeAttribute('style'); n++;
      if (!t && !h) { if (e.tagName === 'SPAN') bare(e); continue; }
      let s = e;
      if (e.tagName !== 'SPAN') { s = document.createElement('span'); s.append(...e.childNodes); e.append(s); }
      if (h) setMark(s, 'hl', colourAt(h[1]));
      if (t && s.isConnected) setMark(s, 'tc', colourAt(t[1]));
    }
    return n;
  }
  /* Chrome makes a list inside the paragraph it was (<p><ul>…</ul></p>), which no page can hold: the list comes out, the rest of the paragraph either side of it stays */
  function liftLists() {
    let n = 0;
    for (const list of [...body.querySelectorAll('ul, ol')]) {
      const host = list.parentElement;
      if (!host || host === body || !/^(P|DIV|H[1-6])$/.test(host.tagName)) continue;
      const r = document.createRange();
      r.setStartAfter(list); r.setEnd(host, host.childNodes.length);
      const rest = r.extractContents();
      host.after(list);
      if (rest.textContent.trim() || rest.querySelector('.ne-img')) { const h = host.cloneNode(false); h.append(rest); list.after(h); }
      if (!host.textContent.trim() && !host.querySelector('.ne-img')) host.remove();
      n++;
    }
    return n;
  }
  function setMark(node, fam, val) {
    const own = markOf(node.classList, fam); if (own) node.classList.remove(own);
    for (const d of [...node.querySelectorAll('span')]) { const m = markOf(d.classList, fam); if (m) { d.classList.remove(m); bare(d); } }
    if (val) { node.classList.add(`${fam}-${val}`); return; }
    /* none: cut it out of whatever coloured (or sized) run it sits in */
    for (let a = node.parentElement; a && a !== body; a = a.parentElement) if (markOf(a.classList, fam)) { carve(a, node, fam); break; }
    bare(node);
  }
  function carve(a, inner, fam) {
    const worth = f => f.textContent.replace(/​/g, '') || f.querySelector('.ne-img, br');
    const r = document.createRange();
    r.setStart(a, 0); r.setEndBefore(inner);
    if (!r.collapsed) { const f = r.extractContents(); if (worth(f)) { const b = a.cloneNode(false); b.append(f); a.before(b); } }
    r.setStartAfter(inner); r.setEnd(a, a.childNodes.length);
    if (!r.collapsed) { const f = r.extractContents(); if (worth(f)) { const b = a.cloneNode(false); b.append(f); a.after(b); } }
    a.classList.remove(markOf(a.classList, fam));
    bare(a);
  }
  function bare(e) {
    if (e.tagName !== 'SPAN' || e.classList.contains('ne-img')) return;
    if (!e.classList.length) e.removeAttribute('class');
    if (!e.attributes.length) unwrap(e);
  }

  /* web addresses typed or pasted become links (a word at a time: not while it is still being typed) */
  function linkify(root, trail) {
    if (!root) return 0;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: t => (t.parentElement?.closest('a, .ne-img') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const texts = []; let t, n = 0;
    while ((t = w.nextNode())) texts.push(t);
    for (let node of texts) {
      URL_RE.lastIndex = 0;
      let m;
      while ((m = URL_RE.exec(node.data))) {
        const end = m.index + m[0].length;
        if (trail && end >= node.data.length) break;
        const href = webLink(m[0]);
        if (!href) continue;
        const word = node.splitText(m.index), rest = word.splitText(m[0].length);
        const a = document.createElement('a'); a.href = href;
        word.replaceWith(a); a.append(word);
        node = rest; URL_RE.lastIndex = 0; n++;
      }
    }
    return n;
  }

  /* ---------- the menus ---------- */
  function menu(anchor, content, cls = '') {
    shut();
    const box = el('div', { class: 'popover ne-pop ' + cls, onMousedown: e => { if (!e.target.closest('input')) e.preventDefault(); } }, content);
    document.body.append(box);
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    const w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))) + 'px';
    box.style.top = Math.round(r.bottom + 8 + h > innerHeight - 8 ? Math.max(8, r.top - h - 8) : r.bottom + 8) + 'px';
    const away = e => {
      if (e.type === 'keydown') { if (e.key === 'Escape') { e.preventDefault(); shut(); back(); } return; }
      if (!box.contains(e.target) && !(anchor.contains && anchor.contains(e.target))) shut();
    };
    setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', away, true); });
    pop = { box, off: () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', away, true); box.remove(); } };
    return box;
  }
  function shut() { if (pop) { const p = pop; pop = null; p.off(); setTimeout(paintEditing); } }

  /* The toolbar is there while you are writing (11 Nov): the caret in the
     text, or one of its own menus open from there. Reading, the page is
     just the note. It fades rather than folds, so nothing below it moves. */
  let restoring = false;
  function paintEditing() {
    if (restoring || closed) return;
    const on = document.activeElement === body || (!!pop && tools.classList.contains('is-shown'));
    tools.classList.toggle('is-shown', on);
  }
  const item = (label, on, onClick, cls = '', look = '') => el('button', { class: 'pop-item ne-item ' + cls + (on ? ' is-on' : ''), onClick: () => { shut(); onClick(); } },
    el('span', { class: 'pop-n ' + look }, label), on ? icon('check', 13, 'currentColor', 2.2) : null);

  function blockMenu(anchor) {
    keep();
    const now = blockTag();
    menu(anchor, el('div', { class: 'pop-list' },
      ...BLOCKS.map(([v, l]) => item(l, now === v, () => setBlock(v), `ne-item-${v}`))), 'ne-pop-block');
  }
  function sizeMenu(anchor) {
    keep();
    menu(anchor, el('div', { class: 'pop-list' },
      ...SIZES.map(([v, l]) => item(l, false, () => setSize(v), `ne-item-fs`, v ? 'fs-' + v : 'fs-n'))), 'ne-pop-size');
  }
  function colourMenu(anchor) {
    keep();
    const row = fam => el('div', { class: 'ne-swatches' },
      ...[''].concat(COLOURS).map((c, i) => el('button', {
        class: `ne-sw ne-sw-${fam}` + (c ? (fam === 'tc' ? ` tc-${c}` : ` hl-${c}`) : ' is-none'),
        title: c ? COLOUR_NAME[c] : fam === 'tc' ? 'Default' : 'No highlight', 'aria-label': (c ? COLOUR_NAME[c] : fam === 'tc' ? 'Default colour' : 'No highlight'),
        'data-c': c || 'none',
        onClick: () => { shut(); setColour(fam, i); } }, 'A')));
    menu(anchor, el('div', { class: 'ne-colours' },
      el('div', { class: 'pop-k' }, 'Text colour'), row('tc'),
      el('div', { class: 'pop-k' }, 'Highlight'), row('hl')), 'ne-pop-colour');
  }

  function linkMenu(existing = null) {
    keep();
    const a = existing || (saved && closestIn(saved.startContainer, 'a'));
    const chosen = saved && !saved.collapsed ? saved.toString() : '';
    const url = el('input', { class: 'ne-in', type: 'url', placeholder: 'Paste or type a link', spellcheck: 'false',
      value: a ? a.getAttribute('href') : (webLink(chosen) || '') });
    const words = el('input', { class: 'ne-in', placeholder: 'Text to show (optional)', value: a ? a.textContent : '' });
    const askWords = !!a || !chosen;
    const apply = () => {
      const href = webLink(url.value);
      if (!href) { url.classList.add('is-bad'); url.focus(); return; }
      shut();
      if (a) {
        a.setAttribute('href', href);
        const w = words.value.trim();
        if (w && w !== a.textContent) a.textContent = w;
        back();
      } else {
        back();
        if (saved && !saved.collapsed) exec('createLink', href);
        else {
          const w = words.value.trim() || href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
          exec('insertHTML', `<a href="${escH(href)}">${escH(w)}</a>`);
        }
      }
      changed(); paintTools();
    };
    for (const i of [url, words]) i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    url.addEventListener('input', () => url.classList.remove('is-bad'));
    const box = el('div', { class: 'ne-linkbox' },
      el('label', { class: 'ne-field' }, el('span', {}, 'Link'), url),
      askWords ? el('label', { class: 'ne-field' }, el('span', {}, 'Text'), words) : null,
      el('div', { class: 'ne-linkacts' },
        a ? el('button', { class: 'btn btn-quiet', onClick: () => { shut(); unlink(a); } }, 'Remove link') : null,
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn-primary', onClick: apply }, a ? 'Save' : 'Add link')));
    const r = a ? a.getBoundingClientRect() : saved && !saved.collapsed ? saved.getBoundingClientRect() : linkButton.getBoundingClientRect();
    menu(r, box, 'ne-pop-link');
    url.focus(); url.select();
  }
  function unlink(a) {
    const r = document.createRange(); r.selectNodeContents(a);
    body.focus({ preventScroll: true });
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('unlink');
    s.collapseToEnd();
    changed(); paintTools();
  }

  function chartMenu(anchor) {
    keep();
    const input = el('input', { class: 'ne-in', type: 'url', placeholder: 'https://www.tradingview.com/x/…', spellcheck: 'false' });
    const say = el('div', { class: 'ne-hint' }, 'In TradingView, click the camera, then Copy link, and paste it here.');
    const go = () => {
      const snap = snapshotOf(input.value);
      if (!snap) {
        input.classList.add('is-bad');
        say.textContent = /tradingview\.com\/chart\//.test(input.value)
          ? 'That is a layout link, which only opens inside TradingView. Use the camera → Copy link instead.'
          : 'That is not a TradingView snapshot link. Use the camera → Copy link.';
        return;
      }
      shut();
      addChart(snap, saved && saved.cloneRange());
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    input.addEventListener('input', () => input.classList.remove('is-bad'));
    menu(anchor, el('div', { class: 'ne-linkbox' },
      el('label', { class: 'ne-field' }, el('span', {}, 'Chart'), input), say,
      el('div', { class: 'ne-linkacts' }, el('div', { class: 'spacer' }), el('button', { class: 'btn btn-primary', onClick: go }, 'Add chart'))), 'ne-pop-link');
    input.focus();
  }

  /* ---------- a link, hovered: where it goes, and what to do with it ---------- */
  let hoverTimer = null, bubble = null;
  function showBubble(a) {
    if (pop || !a.isConnected) return;
    hideBubble();
    const href = a.getAttribute('href');
    bubble = el('div', { class: 'ne-bubble', onMousedown: keepEditing,
      onMouseenter: () => clearTimeout(hoverTimer), onMouseleave: () => { hoverTimer = setTimeout(hideBubble, 250); } },
      el('span', { class: 'ne-bubble-host', title: href }, hostOf(href)),
      el('button', { onClick: () => { hideBubble(); openLink(href); } }, glyph(G.open, 13), 'Open'),
      el('button', { onClick: () => { hideBubble(); linkMenu(a); } }, 'Edit'),
      el('button', { onClick: () => { hideBubble(); unlink(a); } }, 'Remove'));
    document.body.append(bubble);
    const r = a.getBoundingClientRect(), w = bubble.offsetWidth, h = bubble.offsetHeight;
    bubble.style.left = Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.left))) + 'px';
    bubble.style.top = Math.round(r.top - h - 6 < 8 ? r.bottom + 6 : r.top - h - 6) + 'px';
  }
  function hideBubble() { clearTimeout(hoverTimer); bubble?.remove(); bubble = null; }

  /* ============================================================
     Pictures
     ============================================================ */
  function dress(s) {
    s.contentEditable = 'false';
    const side = ['left', 'right', 'center'].includes(s.dataset.float) ? s.dataset.float : 'center';
    s.dataset.float = side;
    setWidth(s, +s.dataset.w || (side === 'center' ? 100 : 45));
    if (!s.querySelector('img')) {
      const img = document.createElement('img'); img.alt = ''; img.draggable = false;
      const grip = document.createElement('i'); grip.className = 'ne-grip'; grip.title = 'Drag to resize';
      s.replaceChildren(img, grip);
      if (s.dataset.shot) store.shotUrl(s.dataset.shot).then(u => { if (u) img.src = u; else s.classList.add('is-missing'); });
    }
  }
  function setWidth(s, w) { w = clampW(w); s.dataset.w = String(w); s.style.width = w + '%'; }
  function setSide(s, side) {
    s.dataset.float = side;
    if (side !== 'center' && +s.dataset.w > 60) setWidth(s, 45);
  }
  function newPicture(attrs) {
    const s = document.createElement('span'); s.className = 'ne-img';
    for (const [k, v] of Object.entries(attrs)) if (v != null) s.setAttribute('data-' + k, String(v));
    dress(s);
    return s;
  }
  function caretAt(x, y) {
    let r = null;
    if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(x, y);
    else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); } }
    return r && body.contains(r.startContainer) && !closestIn(r.startContainer, '.ne-img') ? r : null;
  }
  /* put a picture where the caret is (or at the end), and leave the caret after it */
  function insertAt(r, node) {
    if (!r || !body.contains(r.startContainer)) {
      r = document.createRange();
      const last = body.lastElementChild;
      if (last && BLOCK_OF[last.tagName]) r.selectNodeContents(last); else r.selectNodeContents(body);
      r.collapse(false);
    } else if (!r.collapsed) r.deleteContents();
    const blk = blockEl(r.startContainer);
    r.insertNode(node);
    /* a picture on its own line at the very end gets a line under it to carry on writing */
    if (node.dataset.float === 'center' && blk && blk === body.lastElementChild && !plainOf(blk) && blk.lastChild === node) blk.after(el('p', {}, el('br')));
    const s = getSelection(), after = document.createRange();
    after.setStartAfter(node); after.collapse(true);
    if (document.activeElement === body) { s.removeAllRanges(); s.addRange(after); }
    saved = after;
  }
  async function fill(s, getFile) {
    try {
      const file = await getFile();
      const { blob } = await prepare(file);
      const name = await store.putNoteImage(id, blob);
      known.add(name);
      s.dataset.shot = name;
      s.classList.remove('is-loading');
      const url = await store.shotUrl(name);
      if (url) s.querySelector('img').src = url;
      changed();
      return true;
    } catch (e) {
      return e;
    }
  }
  async function addPicture(f, r) {
    const s = newPicture({ float: 'center', w: 100 });
    s.classList.add('is-loading');
    insertAt(r, s); placeholder();
    const ok = await fill(s, async () => f);
    if (ok !== true) { s.remove(); placeholder(); toast(ok?.message || 'That picture could not be added', 'warn'); }
  }
  async function addChart(snap, r) {
    const s = newPicture({ float: 'center', w: 100, link: snap.link });
    s.classList.add('is-loading');
    insertAt(r, s); placeholder();
    const ok = await fill(s, () => fetchSnapshot(snap));
    if (ok !== true) {
      const a = el('a', { href: snap.link }, snap.link.replace(/^https:\/\/www\./, ''));
      s.replaceWith(a);
      toast('TradingView did not send the chart — the link is there instead', 'warn');
      changed();
    }
  }
  function removePicture(s) { unpick(); s.remove(); placeholder(); changed(); }

  /* a picture chosen answers Delete and Escape wherever focus is (clicking it does not move the caret) */
  const onPickedKey = e => {
    if (!picked || e.target.closest?.('input, textarea')) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); removePicture(picked); }
    else if (e.key === 'Escape') { e.preventDefault(); unpick(); }
    else if (!/^(Shift|Control|Meta|Alt)$/.test(e.key)) unpick();
  };
  function pick(s) {
    unpick();
    picked = s;
    document.addEventListener('keydown', onPickedKey, true);
    s.classList.add('is-on');
    const side = (v, label) => el('button', { class: s.dataset.float === v ? 'is-on' : '', title: label, 'aria-label': label, 'data-side': v,
      onClick: () => { setSide(s, v); pick(s); changed(); } }, glyph(G[v], 16));
    s.append(el('span', { class: 'ne-imgbar', onMousedown: keepEditing, onPointerdown: e => e.stopPropagation() },
      side('left', 'Wrap the text on the right'), side('center', 'On its own line'), side('right', 'Wrap the text on the left'),
      el('i', { class: 'ne-tb-sep' }),
      s.dataset.link ? el('button', { title: 'Open on TradingView', 'aria-label': 'Open on TradingView', onClick: () => openLink(s.dataset.link) }, glyph(G.open, 15)) : null,
      el('button', { title: 'Remove picture', 'aria-label': 'Remove picture', 'data-act': 'remove', onClick: () => removePicture(s) }, icon('trash', 15))));
  }
  function unpick() {
    document.removeEventListener('keydown', onPickedKey, true);
    if (!picked) return;
    picked.classList.remove('is-on');
    picked.querySelector('.ne-imgbar')?.remove();
    picked = null;
  }

  /* where a picture dragged to (x, y) goes: the start of the word under the pointer, or of the paragraph when it is to sit on its own */
  function spotFor(r, side) {
    const node = r.startContainer;
    let off = r.startOffset;
    if (side === 'center') {
      let b = blockEl(node);
      if (!b && node === body) b = body.childNodes[Math.min(off, body.childNodes.length - 1)];
      if (!b || b.nodeType !== 1) return null;
      return { node: b, offset: 0 };
    }
    if (node.nodeType === 3) { const t = node.data; while (off > 0 && !/\s/.test(t[off - 1])) off--; }
    /* not inside a link: just before it */
    const a = closestIn(node, 'a');
    if (a) return { node: a.parentNode, offset: [...a.parentNode.childNodes].indexOf(a) };
    return { node, offset: off };
  }
  function dragFrom(e, s) {
    const x0 = e.clientX, y0 = e.clientY;
    let moving = false, frame = 0, roll = 0, last = null, x = x0, y = y0;
    /* held near the top or bottom of the page, the page scrolls, so a picture can go anywhere in a long note */
    const edge = () => {
      roll = 0;
      const v = view.getBoundingClientRect();
      const d = y < v.top + 70 ? y - (v.top + 70) : y > v.bottom - 70 ? y - (v.bottom - 70) : 0;
      if (!d || !moving) return;
      const before = view.scrollTop;
      view.scrollTop += Math.max(-26, Math.min(26, d / 2.5));
      if (view.scrollTop !== before) step();
      roll = requestAnimationFrame(edge);
    };
    const move = ev => {
      x = ev.clientX; y = ev.clientY;
      if (!moving && Math.hypot(x - x0, y - y0) < 5) return;
      if (!moving) { moving = true; unpick(); s.classList.add('is-dragging'); body.classList.add('is-dragging'); }
      if (!frame) frame = requestAnimationFrame(step);
      if (!roll) roll = requestAnimationFrame(edge);
    };
    const step = () => {
      frame = 0;
      const c = body.getBoundingClientRect();
      const rel = (x - c.left) / c.width;
      const side = rel < 0.34 ? 'left' : rel > 0.66 ? 'right' : 'center';
      /* read the text under the pointer as it would be without the picture, so where it lands does not move what it is aimed at */
      s.style.display = 'none';
      const r = caretAt(x, y);
      s.style.display = '';
      const spot = r && spotFor(r, side);
      if (!spot || s.contains(spot.node)) return;
      if (last && last.node === spot.node && last.offset === spot.offset && last.side === side) return;
      last = { ...spot, side };
      if (s.dataset.float !== side) setSide(s, side);
      const at = document.createRange();
      at.setStart(spot.node, Math.min(spot.offset, spot.node.nodeType === 3 ? spot.node.length : spot.node.childNodes.length));
      at.insertNode(s);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      cancelAnimationFrame(frame); cancelAnimationFrame(roll);
      s.classList.remove('is-dragging'); body.classList.remove('is-dragging');
      if (moving) { body.normalize(); changed(); }
      pick(s);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }
  function resizeFrom(e, s) {
    const x0 = e.clientX, w0 = s.getBoundingClientRect().width, full = body.getBoundingClientRect().width || 1;
    const dir = s.dataset.float === 'right' ? -1 : 1, k = s.dataset.float === 'center' ? 2 : 1;
    s.classList.add('is-sizing');
    const move = ev => setWidth(s, ((w0 + (ev.clientX - x0) * dir * k) / full) * 100);
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      s.classList.remove('is-sizing');
      changed(); pick(s);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  /* ============================================================
     Typing, pasting, dropping
     ============================================================ */
  function shortcut(e) {
    const s = getSelection();
    if (!s.isCollapsed) return false;
    const b = blockEl();
    if (!b || b.tagName === 'LI') return false;
    const r = document.createRange();
    r.setStart(b, 0); r.setEnd(s.anchorNode, s.anchorOffset);
    const before = r.toString();
    const to = { '#': 'h1', '##': 'h2', '###': 'h3', '>': 'blockquote' }[before];
    const listCmd = before === '-' || before === '*' ? 'insertUnorderedList' : /^1[.)]$/.test(before) ? 'insertOrderedList' : null;
    if (!to && !listCmd) return false;
    e.preventDefault();
    s.removeAllRanges(); s.addRange(r);
    document.execCommand('delete');
    if (to) exec('formatBlock', `<${to}>`); else exec(listCmd);
    tidyMarks(); changed(); paintTools();
    return true;
  }

  body.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && key === 'k') { e.preventDefault(); linkMenu(); return; }
    if (mod && e.shiftKey && key === 'x') { e.preventDefault(); run('strikeThrough'); return; }
    if (mod && e.altKey && /^[0-3]$/.test(e.key)) { e.preventDefault(); setBlock(['p', 'h1', 'h2', 'h3'][+e.key]); return; }
    if (e.key === 'Tab' && blockTag() === 'li') { e.preventDefault(); exec(e.shiftKey ? 'outdent' : 'indent'); changed(); return; }
    if (e.key === ' ' && !mod) shortcut(e);
  });
  body.addEventListener('input', e => {
    tidyMarks();
    if (e.inputType === 'insertText' && /\s/.test(e.data || '')) keepSelection(() => linkify(blockEl(), true));
    else if (e.inputType === 'insertParagraph') { const b = blockEl(); keepSelection(() => linkify(b?.previousElementSibling, false)); }
    changed();
  });
  body.addEventListener('paste', e => {
    keep();
    const r = saved && saved.cloneRange();
    const img = imageOnClipboard(e);
    if (img) { e.preventDefault(); addPicture(img, r); return; }
    const text = e.clipboardData?.getData('text/plain') || '';
    const one = text.trim();
    const snap = one && !/\s/.test(one) ? snapshotOf(one) : null;
    if (snap) { e.preventDefault(); addChart(snap, r); return; }
    /* a link pasted over chosen words links them */
    if (r && !r.collapsed && /^https?:\/\/\S+$/i.test(one) && webLink(one)) { e.preventDefault(); exec('createLink', webLink(one)); changed(); return; }
    const html = e.clipboardData?.getData('text/html');
    e.preventDefault();
    if (html) {
      const tidy = clean(html);
      if (tidy.trim()) exec('insertHTML', tidy); else exec('insertText', text);
      body.querySelectorAll('.ne-img').forEach(s => { if (!s.querySelector('img')) dress(s); });
    } else if (text) exec('insertText', text);
    tidyMarks();
    keepSelection(() => linkify(body, false));
    changed();
  });
  body.addEventListener('dragover', e => {
    const types = [...(e.dataTransfer?.types || [])];
    if (types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  });
  body.addEventListener('drop', e => {
    const files = [...(e.dataTransfer?.files || [])].filter(f => /^image\//.test(f.type));
    const words = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '';
    const snap = !files.length && words && !/\s/.test(words.trim()) ? snapshotOf(words) : null;
    if (!files.length && !snap) return;            // words dragged about: the browser's own
    e.preventDefault();
    const r = caretAt(e.clientX, e.clientY);
    if (snap) addChart(snap, r);
    else files.forEach(f => addPicture(f, r && r.cloneRange()));
  });
  body.addEventListener('pointerdown', e => {
    const s = e.target.closest?.('.ne-img');
    if (!s || !body.contains(s)) { if (picked) unpick(); return; }
    if (e.button !== 0 || e.target.closest('.ne-imgbar')) return;
    e.preventDefault();
    if (e.target.classList.contains('ne-grip')) resizeFrom(e, s);
    else dragFrom(e, s);
  });
  /* a link opens on a click — a press and let go in the same place, not a drag to choose its words */
  let down = null;
  body.addEventListener('mousedown', e => { down = { x: e.clientX, y: e.clientY }; });
  body.addEventListener('click', e => {
    if (e.target.closest('.ne-img')) return;
    const a = e.target.closest('a');
    const still = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4;
    if (a && body.contains(a) && still && !e.shiftKey && e.detail < 2) { e.preventDefault(); hideBubble(); openLink(a.getAttribute('href')); }
  });
  body.addEventListener('mouseover', e => {
    const a = e.target.closest?.('a');
    if (!a || !body.contains(a)) return;
    clearTimeout(hoverTimer); hoverTimer = setTimeout(() => showBubble(a), 380);
  });
  body.addEventListener('mouseout', e => {
    const a = e.target.closest?.('a');
    if (a && !a.contains(e.relatedTarget)) { clearTimeout(hoverTimer); hoverTimer = setTimeout(hideBubble, 300); }
  });
  body.addEventListener('focus', () => { focused = true; document.execCommand('defaultParagraphSeparator', false, 'p'); paintEditing(); });
  /* Whether the writing has the caret, as of the last thing done. The browser
     blurs it when a redraw takes the page off, too, which is not someone
     leaving it: only focus going somewhere (relatedTarget) or a press
     outside the note counts (onAway). */
  body.addEventListener('blur', e => { if (e.relatedTarget) focused = false; setTimeout(paintEditing); });
  title.addEventListener('focus', () => { inTitle = [title.selectionStart, title.selectionEnd]; });
  title.addEventListener('blur', e => { if (e.relatedTarget) inTitle = null; });
  title.addEventListener('select', () => { inTitle = [title.selectionStart, title.selectionEnd]; });
  title.addEventListener('keyup', () => { if (document.activeElement === title) inTitle = [title.selectionStart, title.selectionEnd]; });
  title.addEventListener('input', () => { grow(); inTitle = [title.selectionStart, title.selectionEnd]; changed(); });
  title.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && !(e.key === 'ArrowDown' && title.selectionStart === title.value.length)) return;
    e.preventDefault();
    body.focus();
    const r = document.createRange(); r.selectNodeContents(body.firstElementChild || body); r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  const grow = () => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; };

  /* ---------- the page following the caret ---------- */
  function paintTools() {
    const b = blockTag();
    blockLabel.textContent = b === 'li' ? 'List' : (BLOCKS.find(([v]) => v === b) || ['p', 'Text'])[1];
    for (const [cmd, btn] of Object.entries(state)) {
      let on = false;
      try { on = document.queryCommandState(cmd); } catch { /* not in this browser */ }
      btn.classList.toggle('is-on', on);
    }
    linkButton.classList.toggle('is-on', !!closestIn(getSelection().anchorNode, 'a'));
  }
  const onSelection = () => {
    if (closed) return;
    const s = getSelection();
    if (s.rangeCount && body.contains(s.anchorNode)) {
      keep();
      caret = [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset];
      paintTools();
    }
  };
  const onAway = e => {
    if (picked && !picked.contains(e.target)) unpick();
    if (!view.contains(e.target) && !pop?.box.contains(e.target) && !bubble?.contains(e.target)) { focused = false; inTitle = null; }
  };
  const onHash = () => { const [, seg, arg] = (location.hash || '').split('/'); if (seg !== 'notes' || decodeURIComponent(arg || '') !== id) close(); };
  const onHide = () => { if (document.visibilityState === 'hidden') save(); };
  const onLeavePage = () => save();
  document.addEventListener('selectionchange', onSelection);
  document.addEventListener('pointerdown', onAway, true);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('hashchange', onHash);
  window.addEventListener('pagehide', onLeavePage);
  function detach() {
    clearTimeout(timer);
    document.removeEventListener('selectionchange', onSelection);
    document.removeEventListener('pointerdown', onAway, true);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('hashchange', onHash);
    window.removeEventListener('pagehide', onLeavePage);
    shut(); hideBubble(); unpick();
  }

  /* ============================================================
     Saving
     ============================================================ */
  const empty = () => !plainOf(body) && !body.querySelector('.ne-img, hr');
  function placeholder() { body.classList.toggle('is-empty', empty()); }
  function snapshot() {
    const c = body.cloneNode(true);
    c.querySelectorAll('.ne-img').forEach(s => { if (!s.dataset.shot) s.remove(); });
    let html = clean(c.innerHTML).replace(/​/g, '');
    if (/^(<p>(<br>)?<\/p>)?$/.test(html)) html = '';
    const images = [...new Set([...c.querySelectorAll('.ne-img[data-shot]')].map(s => s.dataset.shot))];
    return { title: title.value.trim().slice(0, 200), html, text: plainOf(c).slice(0, 2000), images };
  }
  const keyOf = s => JSON.stringify([s.title, s.html, s.images]);
  let lastSaved = keyOf(snapshot());   // as opened: leaving without a change writes nothing

  function changed() {
    if (closed) return;
    placeholder();
    status.textContent = 'Saving…'; status.classList.add('is-busy');
    clearTimeout(timer); timer = setTimeout(save, 600);
  }
  function stamp() { edited.textContent = editedAt(note.updatedAt); }
  function idle() {
    status.textContent = 'Saved'; status.classList.remove('is-busy');
    stamp();
  }
  function save() {
    clearTimeout(timer); timer = null;
    if (saving) { again = true; return saving; }
    const snap = snapshot(), key = keyOf(snap);
    if (key === lastSaved) { if (!closed) idle(); return Promise.resolve(); }
    saving = store.updateNote(id, snap)
      .then(() => { lastSaved = key; }, err => { toast('The note could not be saved: ' + (err?.message || err), 'bad'); })
      .finally(() => { saving = null; if (again) { again = false; save(); } else if (!closed) idle(); });
    return saving;
  }

  function close() {
    if (closed) return;
    detach();
    const snap = snapshot();
    closed = true;
    if (live === self) live = null;
    if (!store.noteById(id)) return;
    if (keyOf(snap) !== lastSaved) { lastSaved = keyOf(snap); store.updateNote(id, snap); }
    if (!snap.title && !snap.text && !snap.images.length) store.deleteNote(id, [...known]);
    else {
      const out = [...known].filter(x => !snap.images.includes(x));
      if (out.length) store.dropNoteImages(out);
    }
  }

  /* the same note drawn again: the page as it is, the caret where it was */
  function handBack() {
    shut(); hideBubble();
    /* read now: the browser's own blur for the page having been taken off can arrive after this */
    const wasTitle = inTitle, wasBody = focused, at = caret;
    restoring = true;                 // the toolbar stays as it was while the caret is put back
    requestAnimationFrame(() => {
      grow();
      if (wasTitle) { title.focus({ preventScroll: true }); try { title.setSelectionRange(...wasTitle); } catch { /* fine */ } }
      else if (wasBody && at && at.every((x, i) => i % 2 || (x.isConnected && body.contains(x)))) {
        body.focus({ preventScroll: true });
        try { getSelection().setBaseAndExtent(...at); } catch { /* fine */ }
      }
      setTimeout(() => { restoring = false; paintEditing(); });
    });
    return view;
  }

  const self = { id, store, view, close, again: handBack };
  live = self;
  placeholder(); paintColourBar();
  requestAnimationFrame(() => {
    grow();
    if (!note.title && !note.text && !(note.images || []).length) title.focus();
  });
  return view;
}
