import { el, icon, toast, confirmButton, lightbox } from '../ui.js';
import * as c from '../calc.js';
import { todayISO, tradeShotsOf, newShotId } from '../store.js';
import { prepare, imageOnClipboard, imageOnDrop, readableSize } from '../shots.js';
import { CONFIDENCE, EMOTION_AFTER, EXEC_TFS, MISTAKES, DELIVERY, EXIT_REASONS, NEWS, HOLIDAYS, holidayFromCurrency, heldAsked, heldOf } from '../questions.js';
import { heldEditor } from './held.js';
import { guessAssetClass } from '../broker.js';

/** The category, from the instrument as typed — no picker to forget. */
export const classOf = pair => { const p = String(pair || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return p ? guessAssetClass(p) : null; };

const ASSET_CLASSES = ['Forex', 'Futures', 'Commodities', 'Indices'];

/* The questions about a trade beyond its numbers live in questions.js, so
   the CSV and the importer can read them without the form. */
export { CONFIDENCE, EMOTION_AFTER, EXEC_TFS, MISTAKES, DELIVERY, EXIT_REASONS, NEWS, HOLIDAYS };

const pad2 = n => String(n).padStart(2, '0');
const localDay = iso => { const d = new Date(iso); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const localTime = iso => { const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

/**
 * What the prices say about how a trade ended, or null when there is no
 * entry and exit to read. `sign` is the result switch ('win' | 'loss' |
 * 'breakeven'); `reason` the exit reason it implies, or null when the exit
 * was somewhere in between. A stop moved to entry reads as break-even.
 */
export function fromPricesOf(f) {
  const num = v => { const n = c.parseNumberOrNull(v); return n != null && isFinite(n) ? n : null; };
  const e = num(f.entryPrice), x = num(f.exitPrice), sl = num(f.stopLoss), tp = num(f.takeProfit);
  if (e == null || x == null) return null;
  const same = (a, b) => a != null && Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1) * 1e-9;
  if (same(e, x)) return { sign: 'breakeven', reason: 'be' };
  if (same(tp, x)) return { sign: 'win', reason: 'tp' };
  if (same(sl, x)) return { sign: 'loss', reason: 'sl' };
  const up = (x - e) * (f.side === 'sell' ? -1 : 1) > 0;
  return { sign: up ? 'win' : 'loss', reason: null };
}

export function addTrade(store, nav, existingId = null) {
  const acct = store.activeAccount;
  const pb = store.playbook;
  const editing = existingId ? store.trades.find(t => t.id === existingId) : null;

  /* Fields loaded off disk are numbers; the form's inputs are text, and the
     forgiving reader takes strings. Normalise once here so nothing downstream
     has to guess which it is holding. */
  const asText = v => (v == null ? '' : String(v));
  /* A trade with no result yet is not a break-even trade, and the form must
     not open as though it were. An empty result box stays empty, and the
     win/loss switch starts on win rather than on break-even — otherwise
     typing 1400 into the box and pressing save would store a zero, because
     break-even means exactly that. */
  /* A forward test keeps its result as an R, not money, so "no result yet"
     means neither. Reading only the money opened every forward-test loss
     and break-even as a profit. */
  const noResultYet = editing && editing.netResult == null && (editing.rMultiple == null || !isFinite(Number(editing.rMultiple)));
  const f = editing ? {
    ...editing,
    resultSign: noResultYet ? 'win' : c.outcome(editing),
    entryPrice: asText(editing.entryPrice), stopLoss: asText(editing.stopLoss),
    takeProfit: asText(editing.takeProfit), exitPrice: asText(editing.exitPrice),
    size: asText(editing.size), riskPercent: asText(editing.riskPercent),
    /* A break-even keeps its sign in the box, since that is where it lives
       for this one outcome; a win or a loss is unsigned and takes its sign
       from the switch. */
    netResult: noResultYet ? ''
      : c.outcome(editing) === 'breakeven'
        ? asText(Number(editing.netResult) || 0)
        : asText(Math.abs(Number(editing.netResult) || 0)),
    status: editing.status === 'open' ? 'open' : 'closed',
    mode: editing.mode === 'forward' ? 'forward' : 'live',
    rText: editing.rMultiple == null ? '' : asText(Math.abs(Number(editing.rMultiple))),
    confidence: CONFIDENCE.some(([v]) => v === editing.confidence) ? editing.confidence : null,
    exitReason: EXIT_REASONS.some(([v]) => v === editing.exitReason) ? editing.exitReason : null,
    emotionAfter: EMOTION_AFTER.some(([v]) => v === editing.emotionAfter) ? editing.emotionAfter : null,
    execTf: EXEC_TFS.includes(editing.execTf) ? editing.execTf : null,
    mistakes: Array.isArray(editing.mistakes) ? editing.mistakes.filter(k => MISTAKES.some(([m]) => m === k)) : [],
    delivery: DELIVERY.some(([v]) => v === editing.delivery) ? editing.delivery : null,
    held: heldOf(editing),
    news: NEWS.some(([v]) => v === editing.news) ? editing.news : null,
    holidays: Array.isArray(editing.holidays) ? editing.holidays.filter(k => HOLIDAYS.some(([h]) => h === k)) : [],
  } : {
    assetClass: 'Forex', pair: '', side: 'buy', setupId: pb.setups[0]?.id || null,
    sessionId: null, sessionAuto: true,
    date: todayISO(), timeOpen: '', timeClose: '',
    entryPrice: '', stopLoss: '', takeProfit: '', exitPrice: '',
    size: '', sizeUnit: 'lots',
    riskPercent: acct.defaultRiskPercent, netResult: '', resultSign: 'win', rText: '',
    tagIds: [], grade: '', notes: '', status: 'closed', mode: 'live',
    confidence: null, exitReason: null, emotionAfter: null, execTf: null, mistakes: [], delivery: null, held: null, news: null, holidays: [],
  };
  if (editing) f.sessionAuto = false;

  /* ---------- live maths ---------- */
  const out = {};
  out.resultNote = el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '10.5px', color: 'var(--yellow)' } });
  /* Profit and loss take the sign from the switch, so the amount is typed
     once and unsigned. Break-even takes whatever you typed, sign and all: a
     trade that scratched for minus a dollar is still a break-even trade, and
     that dollar still left the account. */
  function signedResult() {
    if (f.resultSign === 'breakeven') return c.parseNumber(f.netResult) ?? 0;
    const raw = Math.abs(c.parseNumber(f.netResult) ?? 0);
    return f.resultSign === 'loss' ? -raw : raw;
  }
  const isOpen = () => f.status === 'open';
  /* A forward test is a decision taken on a demo. It has an R because you
     risked a unit and made or lost multiples of it; it has no money, because
     none was ever at stake. So the result is typed as R and the money side of
     this form — the amount, the dollar 1R — is not asked for. */
  const isForward = () => f.mode === 'forward';

  /** The R a forward test states, with its sign from the same switch. */
  function signedR() {
    const raw = c.parseNumberOrNull(f.rText);
    if (raw == null) return null;
    if (f.resultSign === 'breakeven') return raw;
    return f.resultSign === 'loss' ? -Math.abs(raw) : Math.abs(raw);
  }

  function recompute() {
    const open = isOpen();
    const fwd = isForward();
    const risk = c.parseNumber(f.riskPercent) ?? 0;
    const oneR = acct.startingBalance * risk / 100;
    const typedResult = open ? null : fwd ? signedR() : c.parseNumberOrNull(f.netResult);
    const typedRaw = fwd ? f.rText : f.netResult;
    const unreadable = !open && String(typedRaw ?? '').trim() !== '' && typedResult == null;
    const net = open || fwd ? 0 : signedResult();
    const r = open ? null : fwd ? signedR() : (!oneR ? null : net / oneR);
    const planned = c.plannedR({ entryPrice: f.entryPrice, stopLoss: f.stopLoss, takeProfit: f.takeProfit });
    const dur = c.durationMins(f.timeOpen, f.timeClose);

    const flat = f.resultSign === 'breakeven';
    out.result.textContent = open ? 'Open'
      : typedResult == null ? '—'
      : fwd ? c.rFmt(r)
      : c.money(net, { currency: acct.currency });
    /* A break-even is shown in its real amount but not in a colour: it moved
       the account without being a win or a loss, and colouring it either way
       would say otherwise. */
    const sign = fwd ? (r ?? 0) : net;
    out.result.className = 'kpi-val ' + (open || flat || sign === 0 ? '' : sign > 0 ? 'pos' : 'neg');
    out.result.style.color = open ? 'var(--yellow)' : '';
    out.rShown.textContent = open ? '—' : c.rFmt(r);
    out.rShown.style.color = open || flat || sign === 0 ? 'var(--ink)'
      : sign > 0 ? 'var(--profit)' : 'var(--loss)';
    /* 1R in money means nothing on a forward test — there was no money. */
    out.oneR.textContent = oneR ? c.money(oneR, { sign: false, currency: acct.currency }) : '—';
    if (out.moneyCells) out.moneyCells.forEach(n => { n.hidden = fwd; });
    out.planned.textContent = planned == null ? '—' : `1 : ${planned.toFixed(2)}`;
    out.duration.textContent = c.durationFmt(dur);
    /* An open trade is asked for less: what you are in, and what you have put
       at risk. The result is the one thing it cannot have yet. */
    /* A forward test needs an instrument and an R; it is not asked for a risk
       percentage, because a percentage of nothing is nothing. */
    out.save.disabled = open ? !(f.pair && (fwd || risk > 0))
                       : fwd ? !(f.pair && typedResult != null)
                       : !(f.pair && typedResult != null && risk > 0);
    out.save.textContent = open ? (editing ? 'Save changes' : 'Save as open')
                                : (editing ? 'Save changes' : 'Save trade');
    // A forgiving reader has to say what it could not read, or a typo just
    // greys the save button out with no reason given.
    out.resultNote.textContent = unreadable ? (fwd ? 'Cannot read that as an R' : 'Cannot read that as an amount') : '';

    // Labels are exact: the entry time decides, with no tolerance anywhere near it.
    // Once you have picked a session by hand we stop touching it.
    if (f.sessionAuto && f.timeOpen) {
      const s = c.sessionFor(pb, f.timeOpen);
      f.sessionId = s ? s.id : null;
    }
    paintSessions();
  }

  /* ---------- small builders ---------- */
  const field = (props) => el('input', { class: 'field', ...props });
  const labelled = (label, node) => el('div', { style: { minWidth: 0 } },
    el('span', { class: 'lbl' }, label), node);

  const bind = (key, opts = {}) => ({
    value: f[key] ?? '',
    onInput: e => { f[key] = e.target.value; if (opts.onSet) opts.onSet(); recompute(); },
  });

  /* ============================================================
     Open or closed

     Half the time a trade is logged the moment it is entered, and the exit
     does not exist yet. Rather than make you invent a result — which would be
     a lie sitting in your win rate — the trade can be saved as still running
     and finished later. Until it is, it appears on the Trades page and in no
     statistic anywhere.
     ============================================================ */
  const statusWrap = el('div', { class: 'seg' },
    ...[['closed', 'Closed'], ['open', 'Still open']].map(([v, label]) =>
      el('button', { type: 'button', class: f.status === v ? 'is-on' : '',
        onClick: () => { if (f.status === v) return; f.status = v; paintStatus(); recompute(); } }, label)));

  /* ============================================================
     Live, or a forward test

     A test taken on a demo is a real decision worth keeping, and a worthless
     line in a funded account's P&L. Both are true, so the trade says which it
     was and the sidebar decides whether to count it. It defaults to Live: a
     real trade mislabelled as a test would quietly vanish from your figures,
     which is the worse mistake of the two.
     ============================================================ */
  const modeWrap = el('div', { class: 'seg' },
    ...[['live', 'Live'], ['forward', 'Forward test']].map(([v, label]) =>
      el('button', { type: 'button', class: f.mode === v ? 'is-on' : '',
        onClick: () => { if (f.mode === v) return; f.mode = v; paintMode(); } }, label)));

  function paintMode() {
    [...modeWrap.children].forEach((b, i) => b.classList.toggle('is-on', (i === 0) === (f.mode === 'live')));
    if (out.riskRow) { paintResultRow(); recompute(); }
    /* A forward test has no size: nothing was traded. */
    if (out.sizeCell) {
      out.sizeCell.hidden = isForward();
      out.timingGrid.style.gridTemplateColumns = isForward() ? 'repeat(3,minmax(0,1fr))' : 'repeat(4,minmax(0,1fr))';
    }
  }

  function paintStatus() {
    const open = isOpen();
    [...statusWrap.children].forEach((b, i) => b.classList.toggle('is-on', (i === 0) === !open));
    /* A running trade has no result, so the field is not there. Nothing has
       to say why: the figure at the top already reads Open. */
    paintResultRow();
    /* An exit price and a closing time are things a running trade has not got.
       Greyed rather than removed, so it is obvious where they will go. */
    for (const node of [out.exitField, out.closeField]) {
      if (!node) continue;
      node.disabled = open;
      node.style.opacity = open ? '.38' : '';
    }
    /* Mistakes and how price was delivered are questions about a finished
       trade; a running one does not get asked them yet. */
    if (out.execSec) { out.execSec.hidden = open; renumber(); }
  }
  /* The sections count 01, 02… down the page; one put away closes the gap. */
  function renumber() {
    if (!out.wrapEl) return;
    let n = 0;
    for (const i of out.wrapEl.querySelectorAll('.sec:not([hidden]) > .sec-h > i')) i.textContent = String(++n).padStart(2, '0');
  }


  /* ============================================================
     The two charts

     Nothing is written while you are typing. A screenshot is compressed the
     moment it is dropped — so you see the real size straight away — and held
     until the trade is saved, because a trade with no id has nothing to name
     its files after. Editing an existing trade follows the same rule: the old
     picture stays on disk until you press save.
     ============================================================ */
  /* A chart is staged, never written, until the trade has an id to name its
     file after. An existing one stays on disk until save, so leaving the form
     costs you nothing. */
  const staged = [];                       // { id, out } waiting to be written
  const dropped = new Set();               // existing names to remove on save
  const shotWrap = el('div', { class: 'shot-box' });

  const keptShots = () => tradeShotsOf(editing).filter(n => !dropped.has(n));
  const shotCount = () => keptShots().length + staged.length;

  async function take(file) {
    if (!file) return;
    try {
      const out = await prepare(file);
      staged.push({ id: newShotId(), out });
      paintShots();
      /* Re-encoding a screenshot almost always shrinks it, but a tiny flat
         image can come out bigger, and claiming otherwise would be a lie. */
      toast(out.to < out.from
        ? `Chart added — ${readableSize(out.from)} down to ${readableSize(out.to)}`
        : `Chart added — ${readableSize(out.to)}`);
    } catch (e) { toast(e.message, 'bad'); }
  }
  const takeMany = async (files) => { for (const f of files) await take(f); };

  function dropKept(name) { dropped.add(name); paintShots(); }
  function dropStaged(id) {
    const at = staged.findIndex(x => x.id === id);
    if (at >= 0) staged.splice(at, 1);
    paintShots();
  }

  const picker = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true,
    onChange: e => { const files = [...e.target.files]; e.target.value = ''; takeMany(files); } });

  function tile(url, onRemove, badge) {
    const t = el('button', { type: 'button', class: 'shot-thumb', title: 'View full size',
      onClick: () => { if (t.dataset.url) lightbox({
        items: tiles.map(x => ({ label: f.pair || 'Chart', name: x })),
        urlFor: n => n, at: tiles.indexOf(t.dataset.url) }); } },
      confirmButton({ label: icon('close', 11, 'currentColor', 2.2), armedLabel: 'delete?',
        title: 'Remove this chart', className: 'shot-thumb-x', armedClassName: 'shot-thumb-x is-armed-text',
        onConfirm: onRemove }),
      badge ? el('span', { class: 'shot-thumb-tag' }, badge) : null);
    if (url) { t.dataset.url = url; t.style.backgroundImage = `url("${url}")`; }
    else t.classList.add('is-loading');
    return t;
  }

  /* Every url on the box right now, so the viewer can walk them. */
  let tiles = [];

  function paintShots() {
    tiles = [];
    const kept = keptShots();
    const nodes = [];

    for (const name of kept) {
      const t = tile(null, () => dropKept(name));
      store.shotUrl(name).then(url => {
        t.classList.remove('is-loading');
        if (url) { t.dataset.url = url; t.style.backgroundImage = `url("${url}")`; tiles.push(url); }
        else t.append(el('span', { class: 'm', style: { fontSize: '9.5px', color: 'var(--yellow)' } }, 'missing'));
      });
      nodes.push(t);
    }
    for (const x of staged) {
      const url = URL.createObjectURL(x.out.blob);
      tiles.push(url);
      nodes.push(tile(url, () => dropStaged(x.id), `${x.out.width}×${x.out.height}`));
    }

    /* With nothing on it the box is the drop area it always was; with charts
       on it, it is the charts and a small square on the end for the next. */
    if (out.shotCount) out.shotCount.textContent = nodes.length ? String(nodes.length) : '';
    /* The charts fill the column rather than sitting in it: one is as big as
       the space allows, and each one after makes them all a step smaller
       without leaving any of the width unused. Four go two-by-two rather than
       three-then-one — four equal squares beat three and an orphan. */
    const n = nodes.length;
    const cols = n <= 3 ? Math.max(1, n) : n === 4 ? 2 : n <= 6 ? 3 : 4;
    shotWrap.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    shotWrap.replaceChildren(
      ...nodes,
      /* The button to add the next one is a slim bar under them, not a tile
         among them — a tile would take a chart's place and make one chart
         half the size it could be. */
      el('button', { type: 'button', class: nodes.length ? 'shot-add' : 'shot-zone shot-empty',
        onClick: () => picker.click(),
        onDragOver: e => { e.preventDefault(); shotWrap.classList.add('is-over'); },
        onDragLeave: () => shotWrap.classList.remove('is-over'),
        onDrop: e => { e.preventDefault(); shotWrap.classList.remove('is-over'); takeMany(imagesOnDrop(e)); } },
        icon(nodes.length ? 'plus' : 'image', nodes.length ? 14 : 19, 'var(--grey-5)', nodes.length ? 2 : 1.6),
        nodes.length ? null
          : el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } }, 'Drop, paste or click')));
  }
  const imagesOnDrop = (e) => {
    const one = imageOnDrop(e);
    const all = [...(e.dataTransfer?.files || [])].filter(x => /^image\//.test(x.type));
    return all.length ? all : (one ? [one] : []);
  };
  paintShots();

  /* Ctrl+V is how a screenshot actually arrives — nobody saves it to disk
     first. It goes straight onto the end of the list, so three pastes in a
     row give you three charts in the order you took them. */
  function onPaste(e) {
    const file = imageOnClipboard(e);
    if (!file) return;
    e.preventDefault();
    take(file);
  }

  /* ---------- session ----------
     One is chosen in the end, so one control chooses it. Set from the open
     time, overridden by picking. */
  const sessionWrap = el('div', {});
  function paintSessions() {
    const sel = el('select', { class: 'field',
      onChange: e => { f.sessionId = e.target.value || null; f.sessionAuto = false; paintSessions(); } },
      ...pb.sessions.map(x => el('option', { value: x.id, selected: f.sessionId === x.id, style: { background: '#363636' } }, x.name)),
      el('option', { value: '', selected: f.sessionId == null, style: { background: '#363636' } }, c.OUTSIDE));
    sessionWrap.replaceChildren(sel);
  }
  paintSessions();

  /* ---------- setups ---------- */
  const setupWrap = el('div', {});
  function paintSetups() {
    const sel = el('select', { class: 'field', style: { cursor: 'pointer' },
      onChange: e => {
        if (e.target.value === '__new') { addSetup(); return; }
        f.setupId = e.target.value || null;
      } },
      el('option', { value: '', selected: !f.setupId, style: { background: '#363636' } }, 'No setup'),
      ...pb.setups.map(s => el('option', { value: s.id, selected: f.setupId === s.id, style: { background: '#363636' } }, s.name)),
      el('option', { value: '__new', style: { background: '#363636' } }, '＋ New setup…'));
    setupWrap.replaceChildren(sel);
  }
  async function addSetup() {
    const name = await inlinePrompt(setupWrap, 'Name this setup');
    paintSetups();
    if (!name) return;
    const s = { id: 's_' + crypto.randomUUID().slice(0, 6), name, color: '#0988F0', rules: [] };
    pb.setups.push(s); await store.save('playbook');
    f.setupId = s.id; paintSetups();
  }
  paintSetups();

  /* ============================================================
     Tags, by group

     Every tag in the journal laid out in one row was fine with nine of them
     and unusable with forty. The group is the question — what went wrong,
     what the market was doing, how it was executed — so the group is what you
     see, and its tags live inside it.

     The panel ticks rather than chooses. A trade can carry two mistakes; a
     dropdown that allowed one would quietly throw the second away, and the
     tag you did not record is the one you never fix.
     ============================================================ */
  const tagWrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '9px' } });
  let openGroup = null;

  /* Clicking anywhere else puts the panel away. The listener exists only
     while one is open, and takes itself off once the form is gone. */
  function awayFromTags(e) {
    if (!tagWrap.isConnected) return closeTags();
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'pointerdown' && tagWrap.contains(e.target)) return;
    openGroup = null; paintTags();
  }
  function closeTags() {
    document.removeEventListener('pointerdown', awayFromTags, true);
    document.removeEventListener('keydown', awayFromTags, true);
  }

  const chosen = id => f.tagIds.includes(id);
  function toggleTag(id) {
    f.tagIds = chosen(id) ? f.tagIds.filter(x => x !== id) : [...f.tagIds, id];
    paintTags();
  }

  function paintTags() {
    const groups = pb.tagGroups || [];

    const drops = groups.map(g => {
      const n = g.tags.filter(t => chosen(t.id)).length;
      const open = openGroup === g.id;
      return el('div', { class: 'tag-drop' + (open ? ' is-open' : '') },
        el('button', { type: 'button', class: 'b',
          onClick: () => { openGroup = open ? null : g.id; paintTags(); } },
          el('span', {}, g.name),
          n ? el('span', { class: 'n' }, String(n)) : null,
          el('span', { class: 'c' }, '▾')),
        el('div', { class: 'tag-menu', hidden: !open },
          ...g.tags.map(t => el('button', { type: 'button', class: 'tag-opt' + (chosen(t.id) ? ' is-on' : ''),
            onClick: () => toggleTag(t.id) },
            /* The same box the import table ticks with — one checkbox in the
               app, not two that nearly match. */
            el('span', { class: 'tick' + (chosen(t.id) ? ' is-on' : '') }, chosen(t.id) ? icon('check', 11, '#fff', 3) : null),
            t.name)),
          el('button', { type: 'button', class: 'tag-opt is-add', onClick: () => addTag(g) },
            el('span', { class: 'tick is-add' }, '＋'), 'new tag')));
    });

    /* What is on the trade, in one line, whichever group it came from —
       so you can see the answer without opening anything. */
    const picked = groups.flatMap(g => g.tags.filter(t => chosen(t.id)));
    const chips = picked.map(t => el('button', { type: 'button', class: 'tag-chip',
      onClick: () => toggleTag(t.id) }, t.name, el('span', { class: 'x' }, '×')));

    /* replaceChildren is not el(): a null here becomes the word "null" on the
       page, so the empty row is left out rather than passed in. */
    tagWrap.replaceChildren(...[
      el('div', { class: 'tag-groups' }, ...drops,
        groups.length ? null : el('button', { type: 'button', class: 'tag-add', onClick: () => addTag(null) }, '+ new tag')),
      chips.length ? el('div', { class: 'tag-chips' }, ...chips) : null,
    ].filter(Boolean));

    closeTags();
    if (openGroup) {
      document.addEventListener('pointerdown', awayFromTags, true);
      document.addEventListener('keydown', awayFromTags, true);
      /* A group near the bottom of the card would drop its menu into the
         edge of it, so that one opens upward instead. It is measured rather
         than assumed: the card scrolls, and which groups are near the bottom
         depends on where you have scrolled to. */
      requestAnimationFrame(() => {
        const menu = tagWrap.querySelector('.tag-menu:not([hidden])');
        const box = menu && menu.closest('.trade-form');
        if (!box) return;
        menu.classList.remove('is-up');
        const m = menu.getBoundingClientRect(), b = box.getBoundingClientRect();
        if (m.bottom > b.bottom - 8 && m.top - m.height > b.top + 8) menu.classList.add('is-up');
        /* And if the group sits below the fold of a short window, the form
           scrolls just enough to show the menu it opened. */
        menu.scrollIntoView({ block: 'nearest' });
      });
    }
  }

  /* A tag made here joins the group it was made in, rather than whichever
     group happened to be first. */
  async function addTag(group) {
    openGroup = null; paintTags();
    const name = await inlinePrompt(tagWrap, 'Name this tag');
    if (!name) { paintTags(); return; }
    let g = group || pb.tagGroups[0];
    if (!g) { g = { id: 'g_' + crypto.randomUUID().slice(0, 6), name: 'Tags', tags: [] }; pb.tagGroups.push(g); }
    const t = { id: 'tg_' + crypto.randomUUID().slice(0, 6), name };
    g.tags.push(t); await store.save('playbook');
    f.tagIds = [...f.tagIds, t.id]; paintTags();
  }
  paintTags();

  /* ---------- result sign ---------- */
  const signWrap = el('span', { style: { display: 'flex', gap: '4px' } });
  function paintSign() {
    const opts = [['win', 'Profit', 'var(--green)'], ['loss', 'Loss', 'var(--orange)'], ['breakeven', 'Break-even', 'var(--grey-4)']];
    signWrap.replaceChildren(...opts.map(([v, label, col]) =>
      el('button', { type: 'button', class: 'm', style: {
          fontSize: '11px', borderRadius: '12px', padding: '4px 10px',
          background: f.resultSign === v ? col : 'var(--grey-7)',
          color: f.resultSign === v ? (v === 'breakeven' ? '#fff' : '#202020') : 'var(--grey-3)' },
        onClick: () => { f.resultSign = v; paintSign(); recompute(); } }, label)));
  }
  paintSign();

  /* ---------- panels ---------- */
  /* The live maths reads across the top of the page now rather than down the
     side of it, so every figure is one line high and the form gets the room.
     The step-by-step version was a nice explanation the first week and a
     column of wasted space every week after. */
  const figure = (extra = {}) => el('div', { class: 'm', style: {
    fontSize: '21px', letterSpacing: '-.02em', lineHeight: 1, color: 'var(--ink)', ...extra } }, '—');

  out.result = el('div', { class: 'kpi-val', style: { fontSize: '21px' } }, '—');
  out.rShown = figure();
  out.oneR = figure();
  out.planned = figure();
  out.duration = figure();

  out.save = el('button', { class: 'btn btn-primary', disabled: true, onClick: save }, editing ? 'Save changes' : 'Save trade');

  async function save() {
    const payload = {
      accountId: acct.id, assetClass: classOf(f.pair) || f.assetClass || null, pair: f.pair.trim().toUpperCase(), side: f.side,
      setupId: f.setupId || null, sessionId: f.sessionId || null, sessionAuto: !!f.sessionAuto,
      date: f.date, timeOpen: f.timeOpen || null, timeClose: f.timeClose || null,
      entryPrice: numOrNull(f.entryPrice), stopLoss: numOrNull(f.stopLoss),
      takeProfit: numOrNull(f.takeProfit), exitPrice: numOrNull(f.exitPrice),
      size: numOrNull(f.size), sizeUnit: f.sizeUnit,
      riskPercent: c.parseNumber(f.riskPercent),
      tagIds: f.tagIds, grade: f.grade || null, notes: f.notes || '',
      status: isOpen() ? 'open' : 'closed',
      mode: f.mode === 'forward' ? 'forward' : 'live',
      confidence: f.confidence ?? null,
      exitReason: f.exitReason ?? null,
      emotionAfter: f.emotionAfter ?? null,
      execTf: f.execTf ?? null,
      mistakes: isOpen() ? null : MISTAKES.map(([k]) => k).filter(k => f.mistakes.includes(k)),
      delivery: isOpen() ? null : f.delivery ?? null,
      /* What it would have made if held — only kept while the question
         stands: change the exit or the mistakes so it no longer applies and
         the answer goes with it. */
      heldOutcome: null, heldR: null,
      news: f.news ?? null,
      holidays: HOLIDAYS.map(([k]) => k).filter(k => f.holidays.includes(k)),
    };
    if (!isOpen() && heldAsked({ ...f, status: 'closed' }) && f.held && f.held.r != null) {
      payload.heldOutcome = f.held.outcome;
      payload.heldR = f.held.r;
      /* still the chart's answer if you left it as the chart read it */
      payload.heldAuto = !!(editing?.heldAuto && editing.heldOutcome === f.held.outcome && editing.heldR === f.held.r);
    }
    /* A running trade carries no result, no exit and no closing time — not a
       zero, not an empty string. Anything that reads this trade later has to
       be able to tell "nothing yet" from "nothing gained". */
    if (isOpen()) {
      payload.exitReason = null;            // it has not ended, so it has no way it ended
      payload.emotionAfter = null;          // nor any feeling about how it went
      payload.netResult = null;
      payload.rMultiple = null;
      payload.exitPrice = null;
      payload.timeClose = null;
    } else if (isForward()) {
      /* No money was at stake, so none is recorded. The R is the result, and
         it is stored rather than derived — there is nothing to derive it
         from. */
      payload.netResult = null;
      payload.exitPrice = numOrNull(f.exitPrice);
      payload.rMultiple = signedR();
      payload.riskPercent = null;
      payload.outcome = f.resultSign === 'breakeven' ? 'breakeven' : null;
    } else {
      payload.netResult = signedResult();
      payload.rMultiple = null;
      /* Stored only when it is a break-even, because that is the only label
         the amount cannot be read back from. */
      payload.outcome = f.resultSign === 'breakeven' ? 'breakeven' : null;
    }
    let saved;
    if (editing) { await store.updateTrade(editing.id, payload); saved = editing; }
    else { saved = await store.addTrade(payload); }

    /* Now the trade has an id, so its charts can be named after it. Removals
       are applied before additions, so swapping one chart for another never
       leaves the old file behind. */
    for (const name of dropped) await store.clearShot(saved, name);
    for (const x of staged) await store.putShot(saved.id, x.out.blob, x.id);

    toast(editing ? 'Trade updated' : 'Trade saved to ' + store.folderName);
    nav.go('#/trades');
  }

  /* Only on a trade that is still running, and only when editing one — a new
     trade has nothing to close. */
  out.closeNow = (editing && isOpen())
    ? el('button', { class: 'btn btn-close-now', title: 'Mark it closed and fill in how it went',
        onClick: () => {
          if (!isOpen()) return;
          f.status = 'closed';
          paintStatus();
          recompute();
          out.closeNow.remove();
          out.closeNow = null;
          /* Straight into the first box it just turned on, because that is
             the next thing you were going to do anyway. */
          out.exitField?.focus();
        } },
        icon('check', 13, 'currentColor', 2.2), 'Close this trade')
    : null;

  const head = el('header', { class: 'head' },
    el('h1', {}, editing ? 'Edit trade' : 'New trade'),
    el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'var(--grey-8)', borderRadius: 'var(--r-btn)', padding: '7px 13px' } },
      el('span', { style: { width: '7px', height: '7px', borderRadius: '2px', background: acct.color } }),
      el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-2)' } }, 'Saving to ', el('span', { style: { color: '#fff' } }, acct.name))),
    el('div', { class: 'spacer' }),
    /* Opening a running trade, the one thing you came to do is finish it.
       Rather than make you find the Closed switch further down the form, the
       page offers it where your eye already is and puts the cursor in the
       first box it just turned on. */
    out.closeNow,
    editing ? null : el('button', { class: 'btn btn-ghost', onClick: () => nav.go('#/import') },
      icon('upload', 14, 'var(--grey-3)', 1.8), 'Import CSV'),
    el('button', { class: 'btn btn-ghost', onClick: () => history.back() }, 'Cancel'),
    out.save,
  );

  /* The form is taller than it used to be — two charts is real estate — so it
     scrolls rather than clipping whatever falls past the bottom. */
  /* ============================================================
     One card, two columns.

     Everything you type is the page now. What the numbers come to reads along
     the top in a single line, where it can be glanced at, instead of down a
     column beside the form, where it was taking a third of the width to
     restate arithmetic you can already see happening.

     The split is by how the fields are used, not by how many there are: the
     left column is the trade as it happened, in the order you would recall it;
     the right is what you make of it afterwards. Nothing scrolls.
     ============================================================ */
  /* ============================================================
     The layout

     One line of figures along the top, then the trade itself. No sentence on
     the page explains a field — a label and a number are the whole design, and
     anything that needed a caption to be understood has been replaced by
     something that does not.

     The left column is the trade, in five bands separated by a hairline: what
     it was, where it went, what it risked, what it came from, what it was.
     The right column is what it looked like and what you thought.
     ============================================================ */
  const cell = (label, value) => el('div', { class: 'ts-cell' },
    el('div', { class: 'ts-lbl' }, label),
    el('div', { class: 'ts-val' }, value));
  const rule = () => el('i', {});

  /* On a forward test the result IS the R, and 1R in money never existed. The
     two cells that would repeat it, and the rules beside them, come out rather
     than standing there holding a dash. */
  out.moneyCells = [rule(), cell('R', out.rShown), rule(), cell('1R', out.oneR)];
  const strip = el('section', { class: 'card trade-strip' },
    cell('Result', out.result), ...out.moneyCells, rule(),
    cell('Planned', out.planned), rule(),
    cell('Time', out.duration));

  const band = (...kids) => el('div', { class: 'band' }, ...kids);
  const grid = (cols, ...kids) => el('div', { style: { display: 'grid', gridTemplateColumns: cols, gap: '14px' } }, ...kids);

  const classHint = el('span', { class: 'pair-class' });
  const paintClass = () => { const k = classOf(f.pair); classHint.textContent = k || ''; classHint.hidden = !k; };
  paintClass();

  const direction = el('div', { style: { display: 'flex', gap: '5px' } },
    ...[['buy', '▲ Long', 'var(--profit)'], ['sell', '▼ Short', 'var(--loss)']].map(([v, label, col]) =>
      el('button', { type: 'button', class: 'dir' + (f.side === v ? ' is-on' : ''),
        style: { '--dir': col, '--dir-rgb': v === 'buy' ? 'var(--profit-rgb)' : 'var(--loss-rgb)' },
        onClick: e => {
          f.side = v;
          [...e.currentTarget.parentNode.children].forEach(x => x.classList.toggle('is-on', x === e.currentTarget));
          fromPrices(); recompute();
        } }, label)));

  /* The money row and the R row are the same row wearing different clothes.
     Which one you get is decided by Live or Forward test in the header, and
     nothing else on the form changes — the prices, the times and the charts
     are worth keeping whichever kind of trade it was. */
  const moneyCell = labelled('Net result', el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
    el('div', { class: 'prefix', style: { flex: '1' } },
      el('span', {}, '$'),
      field({ inputmode: 'decimal', placeholder: '0.00', ...bind('netResult') })),
    signWrap, out.resultNote));

  const rCell = labelled('Result in R', el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
    el('div', { class: 'suffix', style: { flex: '1' } },
      field({ inputmode: 'decimal', placeholder: '2.00', ...bind('rText') }),
      el('span', {}, 'R')),
    signWrap, out.resultNote));

  const riskCell = labelled('Risk %', el('div', { class: 'suffix' },
    field({ inputmode: 'decimal', ...bind('riskPercent') }),
    el('span', {}, '%')));

  out.riskRow = grid('minmax(0,200px) minmax(0,1fr)');
  out.riskBand = out.riskRow;
  out.riskRow.classList.add('result-band');
  /* One row, three shapes: risk and money for a live trade, R alone for a
     forward test, and risk alone while a live trade is still running. A
     forward test that is still running has nothing to ask for at all, so the
     band goes rather than sitting there empty. */
  function paintResultRow() {
    const fwd = isForward(), open = isOpen();
    out.riskRow.replaceChildren(...(fwd ? (open ? [] : [rCell]) : open ? [riskCell] : [riskCell, moneyCell]));
    out.riskRow.style.gridTemplateColumns = fwd ? 'minmax(0,1fr)'
      : open ? 'minmax(0,200px)' : 'minmax(0,200px) minmax(0,1fr)';
    /* signWrap and resultNote are one element each, moved between the two
       cells rather than duplicated — two sign switches would be two states
       to keep in step, and they would drift. */
    if (!open) (fwd ? rCell : moneyCell).querySelector('div').append(signWrap, out.resultNote);
    out.riskBand.hidden = fwd && open;
    if (out.exitBlock) out.exitBlock.hidden = open;
    if (out.afterBlock) out.afterBlock.hidden = open;
    paintHeld();
  }

  /* ---------- how the trade ended ----------
     Only asked once it has: a running trade has no way it ended. Picking the
     one already chosen clears it. */
  out.exitReason = el('div', { class: 'exit-reasons', role: 'group', 'aria-label': 'Exit reason' });
  function paintExitReason() {
    out.exitReason.replaceChildren(...EXIT_REASONS.map(([v, label]) =>
      el('button', { type: 'button', class: 'xr' + (f.exitReason === v ? ' is-on' : '') + ' is-' + v,
        onClick: () => { f.exitReason = f.exitReason === v ? null : v; xrAuto = false; paintExitReason(); paintHeld(); } }, label)));
  }
  paintExitReason();
  out.exitBlock = labelled('Exit reason', out.exitReason);

  /* ---------- the prices say how it ended ----------
     Once there is an entry and an exit, the exit decides: at the target it
     is a win that hit take profit, at the stop a loss that hit the stop, at
     the entry a break-even. Anywhere else it is a profit or a loss by which
     way price went for your direction. Only typing a price does this — an
     edit opens as it was saved — and an exit reason you picked yourself is
     left alone. */
  let xrAuto = false;
  function fromPrices() {
    const read = fromPricesOf(f);
    if (!read) return;
    if (read.sign !== f.resultSign) { f.resultSign = read.sign; paintSign(); }
    if (f.exitReason == null || xrAuto) {
      const next = read.reason;
      if (next !== f.exitReason) { f.exitReason = next; xrAuto = next != null; paintExitReason(); paintHeld(); }
    }
  }

  /* ---------- if you had held it ----------
     Only for a trade that stopped short: closed by hand, closed early or
     moved to break-even early. It opens beneath the exit reason the moment
     that is true. */
  out.heldBlock = el('div', { class: 'held-block' },
    el('span', { class: 'lbl' }, 'If held to target'),
    heldEditor(f.held, v => { f.held = v; }),
    el('span', { class: 'held-hint' }, 'What it would have made had you left it alone'));
  function paintHeld() {
    if (!out.heldBlock) return;
    const show = !isOpen() && heldAsked({ ...f, status: 'closed' });
    if (show && out.heldBlock.hidden) { out.heldBlock.classList.remove('is-in'); void out.heldBlock.offsetWidth; out.heldBlock.classList.add('is-in'); }
    out.heldBlock.hidden = !show;
  }

  /* ---------- how sure you were ----------
     A slide from 1 to 5. Until it is touched it is not set — a trade you never
     rated is not a 3 — and the × takes it back to unset. */
  /* A slide from 1 to 5, for a feeling. Built once and updated in place —
     redrawing it while it is being dragged would drop the drag. Until it is
     touched it is not set (a trade you never rated is not a 3), and × takes
     it back to unset. */
  function slide(key, scale, label) {
    const box = el('div', { class: 'conf' });
    const n = el('b', { class: 'conf-n' });
    const word = el('span', { class: 'conf-word' });
    const x = el('button', { type: 'button', class: 'conf-x', title: 'Clear', onClick: () => set(null) }, icon('close', 10, 'currentColor', 2.4));
    const range = el('input', { type: 'range', min: 1, max: 5, step: 1, value: f[key] ?? 3, class: 'conf-range', 'aria-label': label,
      onInput: e => set(Number(e.target.value)),
      /* A click on the thumb where it already sits fires no input, so an
         unrated slide takes the value it was released on. */
      onPointerup: e => { if (f[key] == null) set(Number(e.target.value)); } });
    const ticks = scale.map(([v, name]) => el('button', { type: 'button', onClick: () => set(v) }, el('b', {}, String(v)), el('span', {}, name)));
    box.append(el('div', { class: 'conf-head' }, n, word, x), el('div', { class: 'conf-track' }, range), el('div', { class: 'conf-ticks' }, ...ticks));
    function set(v) {
      f[key] = v;
      if (v != null && Number(range.value) !== v) range.value = v;
      box.className = 'conf' + (v == null ? ' is-unset' : ' is-' + v);
      n.textContent = v == null ? '—' : String(v);
      word.textContent = v == null ? 'Not rated' : scale[v - 1][1];
      range.setAttribute('aria-valuetext', v == null ? 'not rated' : scale[v - 1][1]);
      x.hidden = v == null;
      ticks.forEach((b, i) => b.classList.toggle('is-on', i + 1 === v));
    }
    set(f[key]);
    return labelled(label, box);
  }
  const confBlock = slide('confidence', CONFIDENCE, 'Confidence going in');
  out.afterBlock = slide('emotionAfter', EMOTION_AFTER, 'Feeling after');

  /* Single choice, as chips; picking the chosen one again clears it. */
  function pick(key, opts, cls = 'xr') {
    const wrap = el('div', { class: 'exit-reasons', role: 'group' });
    const paint = () => wrap.replaceChildren(...opts.map(([v, name]) =>
      el('button', { type: 'button', class: cls + (f[key] === v ? ' is-on' : '') + ' is-' + v,
        onClick: () => { f[key] = f[key] === v ? null : v; paint(); } }, name)));
    paint();
    return wrap;
  }
  /* Several at once, for mistakes. */
  const mistakesWrap = el('div', { class: 'exit-reasons mistakes', role: 'group', 'aria-label': 'Mistakes' });
  function paintMistakes() {
    mistakesWrap.replaceChildren(...MISTAKES.map(([k, name]) =>
      el('button', { type: 'button', class: 'xr is-mistake' + (f.mistakes.includes(k) ? ' is-on' : ''),
        onClick: () => { f.mistakes = f.mistakes.includes(k) ? f.mistakes.filter(x => x !== k) : [...f.mistakes, k]; paintMistakes(); paintHeld(); } }, name)));
  }
  paintMistakes();
  const tfWrap = pick('execTf', EXEC_TFS.map(v => [v, v]), 'xr is-tf');

  /* ---------- news ----------
     Your call, not the calendar's: which red-folder release mattered to this
     pair, and whether you were in before it, during it or after it. Bank
     holidays are ticked by country. When the calendar Quire keeps has that
     day, it is shown underneath as a reminder — it never answers for you. */
  const NEWS_HINT = { none: 'no red-folder news that mattered', before: 'the news came after you were out', during: 'the news hit while you were in',
    after: 'the news was out before you went in', between: 'news before and after your trade' };
  const newsWrap = el('div', { class: 'exit-reasons', role: 'group', 'aria-label': 'News' });
  const newsNote = el('span', { class: 'news-hint' });
  function paintNews() {
    newsWrap.replaceChildren(...NEWS.map(([v, name]) => el('button', { type: 'button', class: 'xr is-news is-' + v + (f.news === v ? ' is-on' : ''), title: NEWS_HINT[v],
      onClick: () => { f.news = f.news === v ? null : v; paintNews(); } }, name)));
    newsNote.textContent = f.news ? NEWS_HINT[f.news] : '';
  }
  paintNews();
  const holWrap = el('div', { class: 'exit-reasons hol', role: 'group', 'aria-label': 'Bank holiday' });
  function paintHol() {
    holWrap.replaceChildren(...HOLIDAYS.map(([k, name]) => el('button', { type: 'button', class: 'xr is-hol' + (f.holidays.includes(k) ? ' is-on' : ''), title: name,
      onClick: () => { f.holidays = f.holidays.includes(k) ? f.holidays.filter(x => x !== k) : [...f.holidays, k]; paintHol(); } }, k)));
  }
  paintHol();
  /* What the kept calendar has for the trade's day, if anything. */
  const dayNote = el('div', { class: 'news-day' });
  function paintDay() {
    const evs = (store.data.news?.events || []).filter(ev => localDay(ev.at) === f.date);
    dayNote.replaceChildren(...(evs.length ? [el('span', { class: 'k' }, 'On the calendar that day'),
      ...evs.map(ev => el('span', { class: 'ev' + (ev.impact === 'Holiday' ? ' is-hol' : '') },
        el('b', {}, ev.impact === 'Holiday' ? 'Holiday' : localTime(ev.at)), ev.country,
        ev.impact === 'Holiday' ? ` · ${holidayFromCurrency(ev.country) ? HOLIDAYS.find(([k]) => k === holidayFromCurrency(ev.country))[1] : ev.title}` : ` · ${ev.title}`))] : []));
    dayNote.hidden = !evs.length;
  }
  paintDay();
  out.paintDay = paintDay;
  const deliveryWrap = el('div', { class: 'delivery' }, pick('delivery', DELIVERY, 'xr is-dl'),
    el('span', { class: 'delivery-hint' }, 'smooth ↔ choppy'));

  /* A section: a small numbered heading, then its fields. Eleven of them, in
     the order a trade is remembered — what it was, where, when, how it
     ended, why; then what you felt, what went wrong, the news around it, how
     you labelled it, what it looked like and what you thought. */
  let secN = 0;
  const sec = (title, ...kids) => el('div', { class: 'band sec' },
    el('div', { class: 'sec-h' }, el('i', {}, String(++secN).padStart(2, '0')), el('span', {}, title)), ...kids);

  const colLeft = el('div', { class: 'col' },
    sec('The trade', grid('minmax(0,1.5fr) minmax(0,1.3fr)',
      labelled('Instrument', el('div', { class: 'pair-wrap' }, field({ placeholder: 'XAUUSD', ...bind('pair', { onSet: paintClass }) }), classHint)),
      labelled('Direction', direction))),

    sec('Prices', grid('repeat(4,minmax(0,1fr))',
      labelled('Entry', field({ inputmode: 'decimal', ...bind('entryPrice', { onSet: fromPrices }) })),
      labelled('Stop', field({ inputmode: 'decimal', class: 'field is-stop', ...bind('stopLoss', { onSet: fromPrices }) })),
      labelled('Target', field({ inputmode: 'decimal', ...bind('takeProfit', { onSet: fromPrices }) })),
      labelled('Exit', out.exitField = field({ inputmode: 'decimal', ...bind('exitPrice', { onSet: fromPrices }) })))),

    sec('Timing & size', out.timingGrid = grid('repeat(4,minmax(0,1fr))',
      labelled('Date', field({ type: 'date', ...bind('date', { onSet: () => out.paintDay?.() }) })),
      labelled('Opened', field({ type: 'time', ...bind('timeOpen') })),
      labelled('Closed', out.closeField = field({ type: 'time', ...bind('timeClose') })),
      out.sizeCell = labelled('Size', field({ inputmode: 'decimal', ...bind('size') })))),

    /* Whether it is finished and whether it was real are two questions about
       the same trade, and both decide what the row underneath asks for — so
       they sit with it, and with how it ended. */
    sec('Outcome',
      grid('minmax(0,1fr) minmax(0,1fr)',
        labelled('Status', statusWrap),
        labelled('Trade type', modeWrap)),
      out.riskRow,
      out.exitBlock,
      out.heldBlock),

    sec('Context',
      grid('1fr 1fr', labelled('Setup', setupWrap), labelled('Session', sessionWrap)),
      labelled('Execution timeframe', tfWrap)),
  );

  /* The right is what it was like: how you felt going in and coming out, what
     went wrong, how price behaved, and the labels you give it. */
  const colRight = el('div', { class: 'col' },
    sec('Mindset', confBlock, out.afterBlock),
    out.execSec = sec('Execution', labelled('Mistakes', mistakesWrap), labelled('Price delivery', deliveryWrap)),
    sec('News', labelled('Timing', el('div', { class: 'news-row' }, newsWrap, newsNote)),
      labelled('Bank holiday', holWrap), dayNote),
    sec('Tags', tagWrap),
  );

  /* Across the foot, at full width: the pictures, and what you wrote. Wide is
     the shape a chart is, and the notes get room to run. */
  const chartsSec = sec('Charts', shotWrap, picker);
  chartsSec.querySelector('.sec-h').append(el('span', { class: 'sec-count' }, out.shotCount = el('span', {}, '')));
  const wide = el('div', { class: 'tf-wide' },
    chartsSec,
    el('div', { class: 'band sec is-notes' },
      el('div', { class: 'sec-h' }, el('i', {}, String(++secN).padStart(2, '0')), el('span', {}, 'Notes')),
      el('textarea', { class: 'field', placeholder: 'What you saw, what you felt, what you would do again',
        oninput: e => { f.notes = e.target.value; } }, f.notes || '')));

  const form = el('section', { class: 'card roomy trade-form' }, colLeft, colRight, wide);
  paintShots();                     // again, now the count beside the heading exists

  /* Settle the open/closed state and fill the strip in before the page is
     handed over, so an edit opens showing what the trade already came to
     rather than a row of dashes. */
  paintStatus();
  paintMode();
  recompute();

  /* The paste is listened for on the whole document, not on this view. Adding
     a chart repaints the box, and the button that had focus goes with it —
     focus falls back to the page body, which sits above this view, so a
     paste from there never reached a listener down here. That was the third
     Ctrl+V that did nothing. The listener retires itself once this view has
     been replaced, so a paste on another page is never taken here. */
  const view = el('div', { class: 'view' }, head, strip, form);
  out.wrapEl = form; renumber();
  const onDocPaste = e => {
    if (!view.isConnected) { document.removeEventListener('paste', onDocPaste); return; }
    onPaste(e);
  };
  document.addEventListener('paste', onDocPaste);
  return view;
}

/* Prices, sizes and the dollar result all go through the same forgiving
   reader as the account form: 1 234.56, $1,234.56 and (750) are all fine. */
function numOrNull(v) { return c.parseNumberOrNull(v); }

/* A tiny inline prompt so we never use window.prompt(). */
function inlinePrompt(host, placeholder) {
  return new Promise(resolve => {
    const input = el('input', { class: 'field', placeholder, style: { height: '34px', fontSize: '12px', marginTop: '6px' } });
    host.append(input); input.focus();
    const done = v => { input.remove(); resolve(v); };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') done(input.value.trim() || null);
      if (e.key === 'Escape') done(null);
    });
    input.addEventListener('blur', () => setTimeout(() => done(input.value.trim() || null), 120));
  });
}
