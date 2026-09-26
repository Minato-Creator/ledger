import { el, icon, toast, confirmButton } from '../ui.js';
import * as c from '../calc.js';
import { todayISO } from '../store.js';
import { SLOTS, prepare, imageOnClipboard, imageOnDrop, readableSize } from '../shots.js';

const ASSET_CLASSES = ['Forex', 'Futures', 'Commodities', 'Indices'];

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
  const noResultYet = editing && editing.netResult == null;
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
  } : {
    assetClass: 'Forex', pair: '', side: 'buy', setupId: pb.setups[0]?.id || null,
    sessionId: null, sessionAuto: true,
    date: todayISO(), timeOpen: '', timeClose: '',
    entryPrice: '', stopLoss: '', takeProfit: '', exitPrice: '',
    size: '', sizeUnit: 'lots',
    riskPercent: acct.defaultRiskPercent, netResult: '', resultSign: 'win', rText: '',
    tagIds: [], grade: '', notes: '', status: 'closed', mode: 'live',
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
  }


  /* ============================================================
     The two charts

     Nothing is written while you are typing. A screenshot is compressed the
     moment it is dropped — so you see the real size straight away — and held
     until the trade is saved, because a trade with no id has nothing to name
     its files after. Editing an existing trade follows the same rule: the old
     picture stays on disk until you press save.
     ============================================================ */
  const shots = {};        // slot -> { blob, from, to, width, height } staged
  const dropped = {};      // slot -> true when an existing one is to be removed
  const shotWrap = el('div', { class: 'shots-stack' });
  let focusedSlot = SLOTS[0].key;

  const existingShot = key => {
    const field = SLOTS.find(s => s.key === key).field;
    return !dropped[key] && editing ? (editing[field] || null) : null;
  };

  async function take(key, file) {
    if (!file) return;
    try {
      const out = await prepare(file);
      shots[key] = out;
      dropped[key] = true;                 // whatever was there is being replaced
      paintShots();
      /* Re-encoding a screenshot almost always shrinks it, but a tiny flat
         image can come out bigger, and claiming otherwise would be a lie. */
      toast(out.to < out.from
        ? `Chart added — ${readableSize(out.from)} down to ${readableSize(out.to)}`
        : `Chart added — ${readableSize(out.to)}`);
    } catch (e) { toast(e.message, 'bad'); }
  }

  function clearShot(key) {
    delete shots[key];
    dropped[key] = true;
    paintShots();
  }

  /* Which box a paste goes to is a class on an existing box, never a reason to
     rebuild the row. Redrawing here is what broke the click: focus fires
     before click, so replacing the boxes on focus destroyed the very button
     the mouse was pressing, the click never landed, and the file picker never
     opened. */
  const zones = new Map();
  function paintTargets() {
    for (const [key, node] of zones) node.classList.toggle('is-target', key === focusedSlot);
  }

  function paintShots() {
    zones.clear();
    shotWrap.replaceChildren(...SLOTS.map(slot => {
      const staged = shots[slot.key];
      const kept = existingShot(slot.key);
      const input = el('input', { type: 'file', accept: 'image/*', hidden: true,
        onChange: e => { const f = e.target.files[0]; e.target.value = ''; take(slot.key, f); } });

      const head = el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '7px', marginBottom: '7px' } },
        el('span', { class: 'lbl', style: { margin: 0 } }, slot.label),
        staged || kept
          ? confirmButton({ label: 'Remove', armedLabel: 'Confirm remove', className: 'm',
              style: { marginLeft: 'auto', fontSize: '10px', color: 'var(--grey-4)' },
              armedStyle: { marginLeft: 'auto', fontSize: '10px', color: 'var(--orange)' },
              onConfirm: () => clearShot(slot.key) })
          : null);

      const zone = el('button', { type: 'button', class: 'shot-zone' + (focusedSlot === slot.key ? ' is-target' : ''),
        onClick: () => { focusedSlot = slot.key; paintTargets(); input.click(); },
        onFocus: () => { focusedSlot = slot.key; paintTargets(); },
        onDragOver: e => { e.preventDefault(); zone.classList.add('is-over'); },
        onDragLeave: () => zone.classList.remove('is-over'),
        onDrop: e => { e.preventDefault(); zone.classList.remove('is-over'); take(slot.key, imageOnDrop(e)); } });

      if (staged) {
        zone.style.backgroundImage = `url("${URL.createObjectURL(staged.blob)}")`;
        zone.append(el('span', { class: 'shot-tag' }, `${staged.width}×${staged.height} · ${readableSize(staged.to)}`));
      } else if (kept) {
        zone.classList.add('is-loading');
        store.shotUrl(kept).then(url => {
          if (url) { zone.classList.remove('is-loading'); zone.style.backgroundImage = `url("${url}")`; }
          else zone.replaceChildren(el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--yellow)' } }, 'picture missing'));
        });
      } else {
        zone.append(
          icon('image', 19, 'var(--grey-5)', 1.6),
          el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } }, 'Drop, paste or click'));
      }
      zones.set(slot.key, zone);
      return el('div', { class: 'shot-slot' }, head, zone, input);
    }));
  }
  paintShots();

  /* Ctrl+V is how a screenshot actually arrives — nobody saves it to disk
     first. It goes to whichever slot is highlighted, which starts as the entry
     and follows whichever you last clicked, so two pastes in a row fill the
     two charts in the order you would expect. */
  function onPaste(e) {
    const file = imageOnClipboard(e);
    if (!file) return;
    e.preventDefault();
    const key = focusedSlot;
    /* Once a paste lands, point at the other one. */
    const other = SLOTS.find(s => s.key !== key);
    if (other) focusedSlot = other.key;
    paintTargets();
    take(key, file);
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
      accountId: acct.id, assetClass: f.assetClass, pair: f.pair.trim().toUpperCase(), side: f.side,
      setupId: f.setupId || null, sessionId: f.sessionId || null, sessionAuto: !!f.sessionAuto,
      date: f.date, timeOpen: f.timeOpen || null, timeClose: f.timeClose || null,
      entryPrice: numOrNull(f.entryPrice), stopLoss: numOrNull(f.stopLoss),
      takeProfit: numOrNull(f.takeProfit), exitPrice: numOrNull(f.exitPrice),
      size: numOrNull(f.size), sizeUnit: f.sizeUnit,
      riskPercent: c.parseNumber(f.riskPercent),
      tagIds: f.tagIds, grade: f.grade || null, notes: f.notes || '',
      status: isOpen() ? 'open' : 'closed',
      mode: f.mode === 'forward' ? 'forward' : 'live',
    };
    /* A running trade carries no result, no exit and no closing time — not a
       zero, not an empty string. Anything that reads this trade later has to
       be able to tell "nothing yet" from "nothing gained". */
    if (isOpen()) {
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

    /* Now the trade has an id, so its charts can be named after it. A removal
       is applied before a replacement, so swapping one chart for another never
       leaves the old file behind. */
    for (const slot of SLOTS) {
      if (dropped[slot.key]) await store.clearShot(saved, slot.key);
      const staged = shots[slot.key];
      if (staged) await store.putShot(saved.id, slot.key, staged.blob);
    }

    toast(editing ? 'Trade updated' : 'Trade saved to ' + store.folderName);
    nav.go('#/trades');
  }

  const head = el('header', { class: 'head' },
    el('h1', {}, editing ? 'Edit trade' : 'New trade'),
    el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'var(--grey-8)', borderRadius: 'var(--r-btn)', padding: '7px 13px' } },
      el('span', { style: { width: '7px', height: '7px', borderRadius: '2px', background: acct.color } }),
      el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-2)' } }, 'Saving to ', el('span', { style: { color: '#fff' } }, acct.name))),
    statusWrap,
    modeWrap,
    el('div', { class: 'spacer' }),
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

  const classSelect = el('select', { class: 'field',
    onChange: e => { f.assetClass = e.target.value; } },
    ...ASSET_CLASSES.map(a => el('option', { value: a, selected: f.assetClass === a, style: { background: '#363636' } }, a)));

  const direction = el('div', { style: { display: 'flex', gap: '5px' } },
    ...[['buy', '▲ Long', 'var(--profit)'], ['sell', '▼ Short', 'var(--loss)']].map(([v, label, col]) =>
      el('button', { type: 'button', class: 'dir' + (f.side === v ? ' is-on' : ''),
        style: { '--dir': col, '--dir-rgb': v === 'buy' ? 'var(--profit-rgb)' : 'var(--loss-rgb)' },
        onClick: e => {
          f.side = v;
          [...e.currentTarget.parentNode.children].forEach(x => x.classList.toggle('is-on', x === e.currentTarget));
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
  out.riskBand = el('div', { class: 'band result-band' }, out.riskRow);
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
  }

  const colLeft = el('div', { class: 'col' },
    band(grid('minmax(0,1.5fr) minmax(0,1fr) minmax(0,1.3fr)',
      labelled('Instrument', field({ placeholder: 'XAUUSD', ...bind('pair') })),
      labelled('Class', classSelect),
      labelled('Direction', direction))),

    band(
      grid('repeat(4,minmax(0,1fr))',
        labelled('Entry', field({ inputmode: 'decimal', ...bind('entryPrice') })),
        labelled('Stop', field({ inputmode: 'decimal', class: 'field is-stop', ...bind('stopLoss') })),
        labelled('Target', field({ inputmode: 'decimal', ...bind('takeProfit') })),
        labelled('Exit', out.exitField = field({ inputmode: 'decimal', ...bind('exitPrice') }))),
      grid('repeat(4,minmax(0,1fr))',
        labelled('Size', field({ inputmode: 'decimal', ...bind('size') })),
        labelled('Date', field({ type: 'date', ...bind('date') })),
        labelled('Opened', field({ type: 'time', ...bind('timeOpen') })),
        labelled('Closed', out.closeField = field({ type: 'time', ...bind('timeClose') })))),

    out.riskBand,

    /* Setup, session and tags are one question asked three ways — what kind of
       trade was this — so they share a band and one hairline instead of two.
       It also buys back the room the chosen tags take up underneath. */
    band(
      grid('1fr 1fr',
        labelled('Setup', setupWrap),
        labelled('Session', sessionWrap)),
      labelled('Tags', tagWrap)),

    el('div', { class: 'band', style: { flex: '1', minHeight: '120px', display: 'flex', flexDirection: 'column' } },
      el('span', { class: 'lbl' }, 'Notes'),
      el('textarea', { class: 'field', style: { flex: '1', minHeight: '90px' },
        oninput: e => { f.notes = e.target.value; } }, f.notes || '')),
  );

  /* The charts get the whole right-hand side and stack, which is the shape a
     chart actually is — wide. Two tall thin ones side by side was the worst of
     both. */
  const colRight = el('div', { class: 'col' }, band(shotWrap));

  const form = el('section', { class: 'card roomy trade-form' }, colLeft, colRight);

  /* Settle the open/closed state and fill the strip in before the page is
     handed over, so an edit opens showing what the trade already came to
     rather than a row of dashes. */
  paintStatus();
  recompute();

  return el('div', { class: 'view', onPaste }, head, strip, form);
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
