import { el, icon, toast } from '../ui.js';
import * as c from '../calc.js';
import { todayISO } from '../store.js';

const ASSET_CLASSES = ['Forex', 'Futures', 'Commodities', 'Indices'];

export function addTrade(store, nav, existingId = null) {
  const acct = store.activeAccount;
  const pb = store.playbook;
  const editing = existingId ? store.trades.find(t => t.id === existingId) : null;

  /* Fields loaded off disk are numbers; the form's inputs are text, and the
     forgiving reader takes strings. Normalise once here so nothing downstream
     has to guess which it is holding. */
  const asText = v => (v == null ? '' : String(v));
  const f = editing ? {
    ...editing,
    resultSign: c.outcome(editing),
    entryPrice: asText(editing.entryPrice), stopLoss: asText(editing.stopLoss),
    takeProfit: asText(editing.takeProfit), exitPrice: asText(editing.exitPrice),
    size: asText(editing.size), riskPercent: asText(editing.riskPercent),
    netResult: asText(Math.abs(Number(editing.netResult) || 0)),
  } : {
    assetClass: 'Forex', pair: '', side: 'buy', setupId: pb.setups[0]?.id || null,
    sessionId: null, sessionAuto: true,
    date: todayISO(), timeOpen: '', timeClose: '',
    entryPrice: '', stopLoss: '', takeProfit: '', exitPrice: '',
    size: '', sizeUnit: 'lots',
    riskPercent: acct.defaultRiskPercent, netResult: '', resultSign: 'win',
    tagIds: [], grade: '', notes: '',
  };
  if (editing) f.sessionAuto = false;

  /* ---------- live maths ---------- */
  const out = {};
  out.resultNote = el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '10.5px', color: 'var(--yellow)' } });
  function signedResult() {
    const raw = Math.abs(c.parseNumber(f.netResult) ?? 0);
    if (f.resultSign === 'loss') return -raw;
    if (f.resultSign === 'breakeven') return 0;
    return raw;
  }
  function recompute() {
    const risk = c.parseNumber(f.riskPercent) ?? 0;
    const oneR = acct.startingBalance * risk / 100;
    const typedResult = c.parseNumberOrNull(f.netResult);
    const unreadable = String(f.netResult ?? '').trim() !== '' && typedResult == null;
    const net = signedResult();
    const r = oneR ? net / oneR : null;
    const planned = c.plannedR({ entryPrice: f.entryPrice, stopLoss: f.stopLoss, takeProfit: f.takeProfit });
    const dur = c.durationMins(f.timeOpen, f.timeClose);

    out.result.textContent = typedResult == null ? '—' : c.money(net, { currency: acct.currency });
    out.result.className = 'kpi-val ' + (net > 0 ? 'pos' : net < 0 ? 'neg' : '');
    out.rChip.textContent = c.rFmt(r);
    out.rChip.style.background = net > 0 ? 'rgba(24,172,101,0.20)' : net < 0 ? 'rgba(244,98,74,0.20)' : 'var(--grey-1_7)';
    out.rChip.style.color = net > 0 ? '#0F6B40' : net < 0 ? '#A33A2B' : 'var(--grey-8)';
    out.ofAccount.textContent = acct.startingBalance
      ? `${(Math.abs(net) / acct.startingBalance * 100).toFixed(2)}% of account` : '';
    out.oneR.textContent = oneR ? c.money(oneR, { sign: false, currency: acct.currency }) : '—';
    out.oneRHint.textContent = oneR ? `= ${c.money(oneR, { sign: false, currency: acct.currency })} of this account's ${c.money(acct.startingBalance, { sign: false, currency: acct.currency, decimals: 0 })}` : '';
    out.riskShown.textContent = risk.toFixed(2) + '%';
    out.netShown.textContent = typedResult == null ? '—' : c.money(net, { currency: acct.currency });
    out.netShown.className = 'm';
    out.netShown.style.color = net > 0 ? 'var(--green)' : net < 0 ? 'var(--orange)' : 'var(--grey-2)';
    out.rShown.textContent = c.rFmt(r);
    out.rShown.style.color = net > 0 ? 'var(--green)' : net < 0 ? 'var(--orange)' : 'var(--grey-2)';
    out.planned.textContent = planned == null ? '—' : `1 : ${planned.toFixed(2)}`;
    out.duration.textContent = c.durationFmt(dur);
    out.save.disabled = !(f.pair && typedResult != null && risk > 0);
    // A forgiving reader has to say what it could not read, or a typo just
    // greys the save button out with no reason given.
    out.resultNote.textContent = unreadable ? 'Cannot read that as an amount' : '';

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
  const labelled = (label, node, hint) => el('div', {}, el('span', { class: 'lbl' }, label), node,
    hint ? el('div', { class: 'm', style: { marginTop: '7px', fontSize: '10.5px', color: 'var(--grey-5)' } }, hint) : null);

  const bind = (key, opts = {}) => ({
    value: f[key] ?? '',
    onInput: e => { f[key] = e.target.value; if (opts.onSet) opts.onSet(); recompute(); },
  });

  /* ---------- session chips ---------- */
  const sessionWrap = el('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' } });
  function paintSessions() {
    sessionWrap.replaceChildren(
      ...pb.sessions.map(s =>
        el('button', { class: 'chip' + (f.sessionId === s.id ? ' is-on' : ''), type: 'button',
          onClick: () => { f.sessionId = s.id; f.sessionAuto = false; paintSessions(); } }, s.name)),
      // A gap between killzones is a real answer, not a blank one.
      el('button', { class: 'chip' + (f.sessionId == null ? ' is-on' : ''), type: 'button',
        style: { opacity: f.sessionId == null ? 1 : .7 },
        onClick: () => { f.sessionId = null; f.sessionAuto = false; paintSessions(); } }, c.OUTSIDE),
      el('span', { class: 'm', style: { fontSize: '10.5px', color: f.sessionAuto ? 'var(--grey-5)' : 'var(--yellow)', marginLeft: '4px' } },
        f.timeOpen ? (f.sessionAuto ? 'from your open time' : 'set by hand') : ''));
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

  /* ---------- tags ---------- */
  const tagWrap = el('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' } });
  function paintTags() {
    const all = pb.tagGroups.flatMap(g => g.tags.map(t => ({ ...t, group: g })));
    tagWrap.replaceChildren(
      ...all.map(t => el('button', { type: 'button', class: 'tag' + (f.tagIds.includes(t.id) ? ' is-on' : ''),
        onClick: () => {
          f.tagIds = f.tagIds.includes(t.id) ? f.tagIds.filter(x => x !== t.id) : [...f.tagIds, t.id];
          paintTags();
        } }, t.name)),
      el('button', { type: 'button', class: 'tag-add', onClick: addTag }, '+ new tag'));
  }
  async function addTag() {
    const name = await inlinePrompt(tagWrap, 'Name this tag');
    paintTags();
    if (!name) return;
    const g = pb.tagGroups[0];
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
  out.result = el('div', { class: 'kpi-val', style: { marginTop: '14px', fontSize: '34px' } }, '—');
  out.rChip = el('span', { class: 'm', style: { fontSize: '11px', borderRadius: 'var(--r-pill)', padding: '4px 11px', background: 'var(--grey-1_7)', color: 'var(--grey-8)' } }, '—');
  out.ofAccount = el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-6)' } }, '');
  out.oneR = el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: 'var(--ink-2)' } }, '—');
  out.oneRHint = el('div', { class: 'm', style: { marginTop: '7px', fontSize: '10.5px', color: 'var(--grey-5)' } }, '');
  out.riskShown = el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: 'var(--ink-2)' } }, '—');
  out.netShown = el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px' } }, '—');
  out.rShown = el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px' } }, '—');
  out.planned = el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: 'var(--ink-2)' } }, '—');
  out.duration = el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: 'var(--ink-2)' } }, '—');

  const mathRow = (k, v) => el('div', { style: { display: 'flex', alignItems: 'baseline' } },
    el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, k), v);

  out.save = el('button', { class: 'btn btn-primary', disabled: true, onClick: save }, editing ? 'Save changes' : 'Save trade');

  async function save() {
    const payload = {
      accountId: acct.id, assetClass: f.assetClass, pair: f.pair.trim().toUpperCase(), side: f.side,
      setupId: f.setupId || null, sessionId: f.sessionId || null, sessionAuto: !!f.sessionAuto,
      date: f.date, timeOpen: f.timeOpen || null, timeClose: f.timeClose || null,
      entryPrice: numOrNull(f.entryPrice), stopLoss: numOrNull(f.stopLoss),
      takeProfit: numOrNull(f.takeProfit), exitPrice: numOrNull(f.exitPrice),
      size: numOrNull(f.size), sizeUnit: f.sizeUnit,
      riskPercent: c.parseNumber(f.riskPercent), netResult: signedResult(),
      tagIds: f.tagIds, grade: f.grade || null, notes: f.notes || '',
    };
    if (editing) { await store.updateTrade(editing.id, payload); toast('Trade updated'); }
    else { await store.addTrade(payload); toast('Trade saved to ' + store.folderName); }
    nav.go('#/trades');
  }

  const head = el('header', { class: 'head' },
    el('h1', {}, editing ? 'Edit trade' : 'New trade'),
    el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'var(--grey-8)', borderRadius: 'var(--r-btn)', padding: '7px 13px' } },
      el('span', { style: { width: '7px', height: '7px', borderRadius: '2px', background: acct.color } }),
      el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-2)' } }, 'Saving to ', el('span', { style: { color: '#fff' } }, acct.name))),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-ghost', onClick: () => history.back() }, 'Cancel'),
    out.save,
  );

  const form = el('section', { class: 'card', style: { width: '720px', flex: 'none', gap: '15px', overflow: 'hidden' } },
    el('div', {}, el('span', { class: 'lbl' }, 'Asset class'),
      el('div', { style: { display: 'flex', gap: '5px' } },
        ...ASSET_CLASSES.map(a => el('button', { type: 'button', class: 'chip' + (f.assetClass === a ? ' is-on' : ''),
          onClick: e => { f.assetClass = a; [...e.target.parentNode.children].forEach(x => x.classList.toggle('is-on', x === e.target)); } }, a)))),

    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' } },
      labelled('Instrument', field({ placeholder: 'XAUUSD', ...bind('pair') })),
      labelled('Direction', el('div', { style: { display: 'flex', gap: '5px', height: '42px' } },
        ...[['buy', '▲ Long', 'var(--green)'], ['sell', '▼ Short', 'var(--orange)']].map(([v, label, col]) =>
          el('button', { type: 'button', style: {
              flex: '1', borderRadius: 'var(--r-field)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '5px', font: '400 12px var(--mono)',
              background: f.side === v ? (v === 'buy' ? 'rgba(24,172,101,0.18)' : 'rgba(244,98,74,0.18)') : 'var(--grey-7)',
              boxShadow: f.side === v ? `inset 0 0 0 1px ${col}` : 'none',
              color: f.side === v ? col : 'var(--grey-3)' },
            onClick: e => { f.side = v; [...e.target.parentNode.children].forEach((x, i) => {
              const on = (i === 0 ? 'buy' : 'sell') === v; const cc = i === 0 ? 'var(--green)' : 'var(--orange)';
              x.style.background = on ? (i === 0 ? 'rgba(24,172,101,0.18)' : 'rgba(244,98,74,0.18)') : 'var(--grey-7)';
              x.style.boxShadow = on ? `inset 0 0 0 1px ${cc}` : 'none';
              x.style.color = on ? cc : 'var(--grey-3)'; }); } }, label)))),
      labelled('Setup', setupWrap)),

    el('div', {}, el('span', { class: 'lbl' }, 'Session ',
      el('span', { style: { textTransform: 'none', letterSpacing: 0, color: 'var(--grey-5)' } }, '— set from your open time, click to override')),
      sessionWrap),

    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '10px' } },
      labelled('Entry', field({ inputmode: 'decimal', ...bind('entryPrice') })),
      labelled('Stop', field({ inputmode: 'decimal', class: 'field is-stop', ...bind('stopLoss') })),
      labelled('Target', field({ inputmode: 'decimal', ...bind('takeProfit') })),
      labelled('Exit', field({ inputmode: 'decimal', ...bind('exitPrice') }))),

    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '10px' } },
      labelled('Size', field({ inputmode: 'decimal', placeholder: 'optional', ...bind('size') })),
      labelled('Date', field({ type: 'date', ...bind('date') })),
      labelled('Opened', field({ type: 'time', ...bind('timeOpen') })),
      labelled('Closed', field({ type: 'time', ...bind('timeClose') }))),

    el('div', { style: { background: 'var(--grey-9)', borderRadius: '28px', padding: '16px 18px', boxShadow: 'inset 0 0 0 1px var(--grey-6)' } },
      el('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '12px' } },
        el('span', { class: 'm', style: { fontSize: '10px', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--grey-1)' } }, 'You type these two'),
        el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '10.5px', color: 'var(--grey-5)' } }, 'everything else follows from them')),
      el('div', { style: { display: 'grid', gridTemplateColumns: '210px 1fr', gap: '10px' } },
        el('div', {}, el('span', { class: 'lbl' }, 'Risk on this trade'),
          el('div', { style: { position: 'relative' } },
            field({ inputmode: 'decimal', style: { background: 'var(--grey-6)', paddingRight: '34px' }, ...bind('riskPercent') }),
            el('span', { class: 'm', style: { position: 'absolute', right: '15px', top: '12px', fontSize: '12px', color: 'var(--grey-2)', pointerEvents: 'none' } }, '%')),
          out.oneRHint),
        el('div', {}, el('span', { class: 'lbl' }, 'Net result — as your broker reports it'),
          el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
            el('div', { style: { position: 'relative', flex: '1' } },
              field({ inputmode: 'decimal', placeholder: '0.00', style: { background: 'var(--grey-6)', boxShadow: 'inset 0 0 0 1px var(--green)', paddingLeft: '26px' }, ...bind('netResult') }),
              el('span', { class: 'm', style: { position: 'absolute', left: '15px', top: '12px', fontSize: '12px', color: 'var(--grey-3)', pointerEvents: 'none' } }, '$')),
            signWrap),
          el('div', { style: { display: 'flex', gap: '10px', marginTop: '7px' } },
            el('div', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } }, 'Commission and swap already included.'),
            out.resultNote)))),

    el('div', {}, el('span', { class: 'lbl' }, 'Tags'), tagWrap),

    el('div', { style: { flex: '1', minHeight: 0, display: 'flex', flexDirection: 'column' } },
      el('span', { class: 'lbl' }, 'Notes'),
      el('textarea', { class: 'field', style: { flex: '1' }, placeholder: 'What was the idea, and what would you change?',
        oninput: e => { f.notes = e.target.value; } }, f.notes || '')),
  );

  const side = el('aside', { style: { flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' } },
    el('div', { class: 'card light', style: { flex: 'none' } },
      el('div', { class: 'eyebrow' }, 'Result'),
      out.result,
      el('div', { style: { marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' } }, out.rChip, out.ofAccount)),
    el('div', { class: 'card', style: { flex: '1', gap: '14px' } },
      el('div', { class: 'eyebrow' }, 'How R is worked out'),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        mathRow('Account', el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: 'var(--ink-2)' } }, acct.name)),
        mathRow('Starting balance', el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: 'var(--ink-2)' } },
          c.money(acct.startingBalance, { sign: false, currency: acct.currency, decimals: 0 }))),
        mathRow('Risk you set', out.riskShown),
        mathRow('So 1R equals', out.oneR),
        el('div', { style: { height: '1px', background: 'var(--grey-7)' } }),
        mathRow('Result you typed', out.netShown),
        mathRow('R = result ÷ 1R', out.rShown),
        el('div', { style: { height: '1px', background: 'var(--grey-7)' } }),
        mathRow('Planned R:R', out.planned),
        mathRow('Time in trade', out.duration)),
      ),
  );

  recompute();
  return el('div', { class: 'view' }, head, el('div', { class: 'row', style: { flex: '1' } }, form, side));
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
