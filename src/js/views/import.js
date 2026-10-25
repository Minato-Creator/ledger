/* ============================================================
   import.js — bringing trades in from a broker or prop firm.

   Nothing is written until you have seen it. The file is read, the trades
   are reconstructed, and then they sit on screen as a list you can uncheck
   before anything touches your journal. Trades already in the account are
   spotted and unchecked for you, so importing the same export twice is
   harmless.
   ============================================================ */
import { el, icon, toast } from '../ui.js';
import { pairMark } from '../flags.js';
import * as c from '../calc.js';
import { parseBrokerCSV, instrumentsIn, moneyFor, suggestedPointValue, guessAssetClass } from '../broker.js';

export function importTrades(store, nav) {
  const acct = store.activeAccount;
  const pb = store.playbook;
  if (!pb.brokerImport) pb.brokerImport = { offsetHours: 0 };
  if (!pb.pointValues) pb.pointValues = {};

  let parsed = null;
  let fileName = '';
  let offsetHours = pb.brokerImport.offsetHours || 0;
  let lastText = '';
  const values = {};                 // instrument -> what one point is worth
  const classes = {};                // instrument -> asset class
  const excluded = new Set();        // row indexes left out by hand
  const already = new Set();         // row indexes already in this account

  const stage = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, minHeight: 0 } });

  /* ---------- reading the file ---------- */
  const fileInput = el('input', { type: 'file', accept: '.csv,text/csv,text/plain', hidden: true,
    onChange: e => { const f = e.target.files[0]; if (f) read(f); e.target.value = ''; } });

  async function read(file) {
    let text;
    try { text = await file.text(); }
    catch { return toast('Could not read that file', 'bad'); }
    fileName = file.name;
    lastText = text;
    ingest(text);
  }

  function ingest(text) {
    const res = parseBrokerCSV(text, { offsetHours });
    if (!res.ok) { parsed = null; paint(); return toast(res.reason || 'That file could not be read', 'bad'); }
    if (!res.trades.length) {
      parsed = res; paint();
      return toast(res.stillOpen.length
        ? 'Every position in that file is still open — nothing to import yet'
        : 'No completed trades in that file', 'warn');
    }

    parsed = res;
    excluded.clear(); already.clear();

    /* The same export, imported twice, should be a no-op. A trade is the same
       trade if it is the same instrument at the same price at the same minute. */
    const mine = store.tradesFor(acct.id);
    const key = t => [t.date, t.timeOpen || '', t.pair, t.entryPrice, t.exitPrice].join('|');
    const have = new Set(mine.map(key));
    res.trades.forEach((t, i) => { if (have.has(key(t))) { already.add(i); excluded.add(i); } });

    for (const { pair } of instrumentsIn(res.trades)) {
      if (values[pair] == null) {
        const remembered = pb.pointValues[pair];
        const suggested = suggestedPointValue(pair);
        values[pair] = remembered != null ? String(remembered) : suggested != null ? String(suggested) : '';
      }
      if (classes[pair] == null) classes[pair] = guessAssetClass(pair);
    }
    paint();
  }

  /* ---------- what each row is worth ---------- */
  const included = () => (parsed ? parsed.trades.map((t, i) => i).filter(i => !excluded.has(i)) : []);
  const moneyAt = i => moneyFor(parsed.trades[i], values[parsed.trades[i].pair]);
  const unpriced = () => included().filter(i => moneyAt(i) == null);

  /* ---------- the two stages ---------- */
  function paint() {
    stage.replaceChildren(parsed && parsed.trades.length ? review() : chooser());
    paintAction();
  }

  function chooser() {
    return el('section', { class: 'card', style: { padding: '52px 46px', alignItems: 'center', textAlign: 'center', gap: '16px' } },
      el('div', { style: { width: '54px', height: '54px', borderRadius: '18px', background: 'var(--inset)', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        icon('upload', 22, 'var(--grey-4)', 1.7)),
      el('h2', { style: { font: '400 19px var(--sans)', color: 'var(--ink)', letterSpacing: '-.01em' } },
        'Bring your trades across'),
      el('p', { class: 'm', style: { fontSize: '12px', color: 'var(--grey-4)', maxWidth: '430px', lineHeight: 1.6 } },
        'Export a CSV from your broker or prop firm and drop it here. Filled orders are matched into trades, first in first out. Nothing is saved until you have looked at it.'),
      el('button', { class: 'btn btn-primary', onClick: () => fileInput.click() },
        icon('upload', 15, 'currentColor', 1.8), 'Choose a CSV'),
      fileInput);
  }

  function review() {
    const list = instrumentsIn(parsed.trades);

    /* --- what a point is worth, per instrument --- */
    const priceRow = ({ pair, count }) => {
      const suggested = suggestedPointValue(pair);
      const input = el('input', { class: 'field', inputmode: 'decimal', placeholder: '0.00',
        style: { width: '112px', textAlign: 'right' },
        value: values[pair] ?? '',
        onInput: e => { values[pair] = e.target.value; repaintRows(); paintAction(); } });
      return el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 0', borderBottom: '1px solid var(--grey-9)' } },
        el('span', { class: 'ins', style: { font: '400 13px var(--mono)', color: 'var(--ink)', minWidth: '76px' } }, pair),
        el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-5)' } }, `${count} trade${count === 1 ? '' : 's'}`),
        el('div', { style: { display: 'flex', gap: '4px', marginLeft: '18px' } },
          ...['Forex', 'Futures', 'Commodities', 'Indices'].map(a =>
            el('button', { type: 'button', class: 'chip' + (classes[pair] === a ? ' is-on' : ''),
              onClick: () => { classes[pair] = a; paint(); } }, a))),
        el('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '9px' } },
          suggested != null && String(suggested) === String(values[pair] ?? '')
            ? el('span', { class: 'm', style: { fontSize: '10px', color: 'var(--grey-5)' } }, 'suggested')
            : null,
          el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-4)' } }, '$ per point'),
          input));
    };

    const prices = el('section', { class: 'card', style: { padding: '20px 26px 8px' } },
      el('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '4px' } },
        el('span', { class: 'lbl' }, 'What a point is worth'),
        el('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' } },
          el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } }, 'shift times'),
          el('div', { class: 'stepper' },
            el('button', { onClick: () => setOffset(offsetHours - 1) }, icon('minus', 11, 'var(--grey-2)', 2.6)),
            el('span', { class: 'val' }, (offsetHours > 0 ? '+' : '') + offsetHours + 'h'),
            el('button', { onClick: () => setOffset(offsetHours + 1) }, icon('plus', 11, 'var(--grey-2)', 2.6))))),
      ...list.map(priceRow),
      el('p', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)', padding: '11px 0' } },
        'Your broker decides this, not Laminar. A move of one point on one contract, in your account currency.'));

    /* --- the trades themselves --- */
    const cols = '30px 88px 104px 1fr 54px 82px 82px 76px 104px';
    const head = el('div', { class: 'tbl-head', style: { gridTemplateColumns: cols } },
      el('span', {}), el('span', {}, 'Date'), el('span', {}, 'Open → close'), el('span', {}, 'Instrument'),
      el('span', {}, 'Side'),
      el('span', { style: { textAlign: 'right' } }, 'Entry'),
      el('span', { style: { textAlign: 'right' } }, 'Exit'),
      el('span', { style: { textAlign: 'right' } }, 'Points'),
      el('span', { style: { textAlign: 'right' } }, 'Result'));

    const rowsWrap = el('div', { class: 'tbl-body' });
    function repaintRows() {
      rowsWrap.replaceChildren(...parsed.trades.map((t, i) => tradeRow(t, i)));
    }

    function tradeRow(t, i) {
      const off = excluded.has(i);
      const dup = already.has(i);
      const money = moneyAt(i);
      const box = el('button', { class: 'tick' + (off ? '' : ' is-on'), type: 'button',
        title: dup ? 'This one is already in the account' : '',
        onClick: () => { off ? excluded.delete(i) : excluded.add(i); repaintRows(); paintAction(); } },
        off ? null : icon('check', 11, '#fff', 3));
      const long = t.side === 'buy';
      return el('div', { class: 'tbl-row', style: { gridTemplateColumns: cols, opacity: off ? .42 : 1 } },
        box,
        el('span', { class: 'td' }, c.shortDate(t.date)),
        el('span', { class: 'td' }, `${t.timeOpen || '—'} → ${t.timeClose || '—'}`),
        el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 } },
          el('span', { class: 'ins has-mark' }, pairMark(t.pair, 18), t.pair),
          dup ? el('span', { class: 'm', style: { fontSize: '9.5px', color: 'var(--grey-5)', border: '1px solid var(--grey-7)', borderRadius: '5px', padding: '1px 5px' } }, 'already in') : null),
        el('span', { class: 'm', style: { fontSize: '11px', color: long ? 'var(--profit)' : 'var(--loss)' } }, long ? 'Long' : 'Short'),
        el('span', { class: 'num' }, fmt(t.entryPrice)),
        el('span', { class: 'num' }, fmt(t.exitPrice)),
        el('span', { class: 'num', style: { color: t.points > 0 ? 'var(--profit)' : t.points < 0 ? 'var(--loss)' : 'var(--grey-4)' } },
          t.points == null ? '—' : (t.points > 0 ? '+' : '') + t.points),
        el('span', { class: 'pl', style: { color: money == null ? 'var(--grey-5)' : money > 0 ? 'var(--profit)' : money < 0 ? 'var(--loss)' : 'var(--grey-4)' } },
          money == null ? 'needs a value' : c.money(money, { currency: acct.currency })));
    }
    repaintRows();

    const notes = [];
    if (parsed.stillOpen.length) notes.push(`${parsed.stillOpen.length} position${parsed.stillOpen.length === 1 ? '' : 's'} still open — left out`);
    if (parsed.skipped.length) notes.push(`${parsed.skipped.length} row${parsed.skipped.length === 1 ? '' : 's'} were not fills`);
    if (parsed.ambiguousDates) notes.push('every date in the file was ambiguous — read as day first');

    const table = el('section', { class: 'card', style: { flex: '1', minHeight: 0, padding: '20px 26px 16px' } },
      el('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '12px' } },
        el('span', { class: 'lbl', style: { margin: 0 } }, `${parsed.trades.length} trade${parsed.trades.length === 1 ? '' : 's'} in ${fileName}`),
        el('div', { style: { marginLeft: 'auto', display: 'flex', gap: '6px' } },
          el('button', { class: 'btn btn-ghost', onClick: () => { excluded.clear(); repaintRows(); paintAction(); } }, 'All'),
          el('button', { class: 'btn btn-ghost', onClick: () => { parsed.trades.forEach((_, i) => excluded.add(i)); repaintRows(); paintAction(); } }, 'None'),
          el('button', { class: 'btn btn-ghost', onClick: () => fileInput.click() }, 'Different file'))),
      el('div', { class: 'tbl', style: { flex: '1', minHeight: 0 } }, head, rowsWrap),
      notes.length
        ? el('div', { style: { marginTop: 'auto', paddingTop: '13px', borderTop: '1px solid var(--grey-7)' } },
            el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } }, notes.join(' · ')))
        : null,
      fileInput);

    function setOffset(h) {
      offsetHours = Math.max(-14, Math.min(14, h));
      pb.brokerImport.offsetHours = offsetHours;
      store.save('playbook');
      if (lastText) ingest(lastText);
    }

    return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, minHeight: 0 } }, prices, table);
  }

  const fmt = v => (v == null ? '—' : String(v));

  /* ---------- saving ---------- */
  const action = el('button', { class: 'btn btn-primary', disabled: true, onClick: commit });
  const actionNote = el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } });

  function paintAction() {
    const n = included().length;
    const need = unpriced().length;
    action.replaceChildren(document.createTextNode(
      !parsed || !parsed.trades.length ? 'Add trades' : n === 0 ? 'Nothing selected' : `Add ${n} trade${n === 1 ? '' : 's'}`));
    action.disabled = !parsed || n === 0 || need > 0;
    actionNote.textContent = need > 0
      ? `${need} need${need === 1 ? 's' : ''} a $ per point`
      : n > 0 ? `to ${acct.name}` : '';
  }

  async function commit() {
    const rows = included();
    if (!rows.length) return;
    let saved = 0;
    for (const i of rows) {
      const t = parsed.trades[i];
      const money = moneyAt(i);
      if (money == null) continue;
      const cls = classes[t.pair] || guessAssetClass(t.pair);
      const session = t.timeOpen ? c.sessionFor(pb, t.timeOpen) : null;
      await store.addTrade({
        accountId: acct.id,
        assetClass: cls,
        pair: t.pair,
        side: t.side,
        setupId: null,
        sessionId: session ? session.id : null,
        sessionAuto: true,
        date: t.date,
        timeOpen: t.timeOpen || null,
        timeClose: t.timeClose || null,
        entryPrice: t.entryPrice ?? null,
        stopLoss: null,
        takeProfit: null,
        exitPrice: t.exitPrice ?? null,
        size: t.size ?? null,
        sizeUnit: cls === 'Forex' ? 'lots' : 'contracts',
        riskPercent: acct.defaultRiskPercent,
        netResult: money,
        tagIds: [],
        grade: null,
        notes: '',
        source: fileName || 'broker CSV',
        ...(t.questions || {}),
      });
      saved++;
    }
    /* Remember what each point was worth, so the next export from the same
       platform arrives already priced. */
    for (const { pair } of instrumentsIn(parsed.trades)) {
      const v = Number(values[pair]);
      if (isFinite(v) && v > 0) pb.pointValues[pair] = v;
    }
    await store.save('playbook');
    toast(`${saved} trade${saved === 1 ? '' : 's'} added to ${acct.name}`);
    nav.go('#/trades');
  }

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Import trades'),
    el('span', { class: 'acct-pill' },
      el('span', { class: 'acct-dot', style: { background: acct.color } }),
      el('span', { class: 'm' }, 'Adding to ', el('b', {}, acct.name))),
    el('div', { class: 'spacer' }),
    actionNote,
    el('button', { class: 'btn btn-ghost', onClick: () => nav.go('#/new') }, 'Cancel'),
    action);

  paint();
  return el('div', { class: 'view' }, head, stage);
}
