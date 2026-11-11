/* ============================================================
   Journal → Notes (11 Nov)

   The things worth keeping that are not a trade: what he learned, what to
   watch out for, what to pay attention to. The page lists them by title with
   the start of what each says; opening one shows the whole note.

   Two ways to lay the list out, to choose between: cards (a grid, the first
   few lines of each) or a list (one row each, a line of it). A kind on each
   note — Lesson, Watch out, Focus — filters the list; search reads titles and
   what they say. A note itself is views/noteedit.js.
   ============================================================ */
import { el, icon } from '../ui.js';
import { noteEditor, leaveNote, NOTE_KINDS } from './noteedit.js';

export { NOTE_KINDS };

let layout = 'cards', kindOn = 'all', query = '';

const when = iso => {
  const d = new Date(iso);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400e3);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
};
const kindName = k => (NOTE_KINDS.find(([v]) => v === k) || [])[1] || '';

export function notes(store, nav, arg) {
  if (arg) return noteEditor(store, nav, decodeURIComponent(arg));
  leaveNote();
  const all = store.notes
    .slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const q = query.trim().toLowerCase();
  const shown = all.filter(n => (kindOn === 'all' || n.kind === kindOn) && (!q || ((n.title || '') + ' ' + (n.text || '')).toLowerCase().includes(q)));

  const search = el('label', { class: 'field nt-search' }, icon('search', 15),
    el('input', { type: 'search', placeholder: 'Search notes', value: query,
      onInput: e => { query = e.target.value; const at = e.target.selectionStart; nav.refresh(); requestAnimationFrame(() => { const i = document.querySelector('.nt-search input'); if (i) { i.focus(); i.setSelectionRange(at, at); } }); } }));
  const layoutSeg = el('div', { class: 'seg nt-layout' },
    ...[['cards', 'Cards'], ['list', 'List']].map(([v, l]) => el('button', { class: layout === v ? 'is-on' : '', onClick: () => { layout = v; nav.refresh(); } }, l)));

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Notes'),
    el('span', { class: 'nt-count' }, `${all.length} note${all.length === 1 ? '' : 's'}`),
    el('div', { class: 'spacer' }),
    search,
    layoutSeg,
    el('button', { class: 'btn btn-primary nt-new', onClick: async () => { const n = await store.addNote(); nav.go('#/notes/' + encodeURIComponent(n.id)); } },
      icon('plus', 15, 'currentColor', 2), 'New note'));

  const kinds = el('div', { class: 'nt-kinds' },
    ...[['all', 'All'], ...NOTE_KINDS].map(([v, l]) => {
      const n = v === 'all' ? all.length : all.filter(x => x.kind === v).length;
      return el('button', { class: 'nt-kind' + (kindOn === v ? ' is-on' : '') + (v !== 'all' ? ` k-${v}` : ''), onClick: () => { kindOn = v; nav.refresh(); } },
        v !== 'all' ? el('i') : null, l, el('span', {}, String(n)));
    }));

  const tag = n => (n.kind ? el('span', { class: `nt-tag k-${n.kind}` }, el('i'), kindName(n.kind)) : null);
  const pin = n => (n.pinned ? el('span', { class: 'nt-pin', title: 'Pinned' }, icon('bookmark', 13)) : null);

  const openIt = n => () => nav.go('#/notes/' + encodeURIComponent(n.id));
  const name = n => n.title || 'Untitled';
  const card = n => el('button', { class: 'card nt-card', 'data-id': n.id, onClick: openIt(n) },
    el('div', { class: 'nt-top' }, tag(n), el('div', { class: 'spacer' }), n.images?.length ? el('span', { class: 'nt-pics', title: 'Pictures' }, icon('image', 13), String(n.images.length)) : null, pin(n)),
    el('h3', { class: 'nt-title' + (n.title ? '' : ' is-untitled') }, name(n)),
    el('p', { class: 'nt-body' }, n.text || ''),
    el('div', { class: 'nt-when' }, when(n.updatedAt)));

  const row = n => el('button', { class: 'nt-row', 'data-id': n.id, onClick: openIt(n) },
    el('div', { class: 'nt-row-main' },
      el('div', { class: 'nt-row-title' + (n.title ? '' : ' is-untitled') }, pin(n), el('span', {}, name(n))),
      el('div', { class: 'nt-row-body' }, n.text || '')),
    tag(n),
    el('div', { class: 'nt-when' }, when(n.updatedAt)));

  const body = !shown.length
    ? el('section', { class: 'card nt-empty' }, el('strong', {}, q || kindOn !== 'all' ? 'Nothing matches' : 'No notes yet'),
        el('span', {}, q || kindOn !== 'all' ? 'Try another word, or show all.' : 'Write down what you learn, what to watch out for and what to pay attention to.'))
    : layout === 'cards'
      ? el('div', { class: 'nt-grid' }, ...shown.map(card))
      : el('section', { class: 'card nt-list' }, ...shown.map(row));

  return el('div', { class: 'view nt-view' }, head, kinds, body);
}
