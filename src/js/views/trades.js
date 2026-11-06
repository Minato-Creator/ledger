import { el, icon, ft, demoTag, isToday, todayTag } from '../ui.js';
import { pairMark } from '../flags.js';
import * as c from '../calc.js';
import { CONFIDENCE, EXIT_REASONS, EXEC_TFS, MISTAKES, NEWS } from '../questions.js';
import { newsDayOf } from '../newsday.js';
import { openShare, canShare } from './share.js';
import { oandaSyncButton } from './oandabtn.js';
import { popover } from '../sheet.js';

const filters = { side: 'all', result: 'all', setupId: 'all', mistake: 'all', exit: 'all', conf: 'all', tf: 'all', news: 'all' };
const FRESH = { ...filters };

/* The questions New trade asks, as filters. A mistake filter of 'none' is
   the clean trades — asked, and nothing went wrong; a confidence of '4+' is
   solid or better; news 'any' is every trade logged around news. A trade never asked a question never matches it. */
export function matchesQuestions(t, f, news = null) {
  if (f.mistake !== 'all') {
    if (!Array.isArray(t.mistakes)) return false;
    if (f.mistake === 'none' ? t.mistakes.length : f.mistake === 'any' ? !t.mistakes.length : !t.mistakes.includes(f.mistake)) return false;
  }
  if (f.exit !== 'all' && t.exitReason !== f.exit) return false;
  if (f.conf !== 'all') {
    if (t.confidence == null) return false;
    if (f.conf === '4+' ? t.confidence < 4 : f.conf === '2-' ? t.confidence > 2 : String(t.confidence) !== f.conf) return false;
  }
  if (f.tf !== 'all' && t.execTf !== f.tf) return false;
  /* News: a timing, any news at all (not "No news"), or a bank holiday. */
  if (f.news && f.news !== 'all') {
    if (f.news === 'holiday') { if (!newsDayOf(t, news).holiday) return false; }
    else if (f.news === 'any') { if (!t.news || t.news === 'none') return false; }
    else if (t.news !== f.news) return false;
  }
  return true;
}

export function trades(store, nav) {
  const acct = store.activeAccount;
  let rows = store.tradesFor(acct.id);

  if (filters.side !== 'all')   rows = rows.filter(t => t.side === filters.side);
  if (filters.setupId !== 'all')rows = rows.filter(t => t.setupId === filters.setupId);
  if (filters.result !== 'all') rows = rows.filter(t => c.outcome(t) === filters.result);
  rows = rows.filter(t => matchesQuestions(t, filters, store.data.news));

  const s = c.summarise(acct, rows);
  const u = store.displayUnit;
  const cols = '150px 78px 92px minmax(0,1fr) 88px 100px 100px 68px 124px';

  /* A filter: a chip saying what it is on, and a menu in the app's own look (not the system's list) */
  const chip = (label, value, key, options) => {
    const shown = (options.find(o => o.v === value) || options[0]).l;
    const b = el('button', { type: 'button', class: 'm tr-chip' + (value !== 'all' ? ' is-set' : ''), 'data-key': key, 'data-all': options[0].l,
        'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `${label}: ${shown}`,
        onClick: () => { if (b.__close) return b.__close(); menu(b, key, value, options); } },
      el('span', {}, shown), icon('chevdown', 11, 'currentColor', 2.2));
    return b;
  };
  function menu(anchor, key, value, options) {
    const pick = v => { anchor.__close?.(); if (v !== value) { filters[key] = v; nav.refresh(); } };
    const list = el('div', { class: 'pop-list' }, ...options.map((o, i) => el('button', {
        type: 'button', class: 'pop-item' + (o.v === value ? ' is-on' : ''), role: 'menuitemradio', 'aria-checked': String(o.v === value),
        'data-v': o.v, style: { '--i': String(Math.min(i, 10)) }, onClick: () => pick(o.v) },
      el('span', { class: 'pop-n' }, o.l),
      o.v === value ? icon('check', 12, 'currentColor', 2.4) : el('span', { class: 'tr-menu-gap' }))));
    anchor.classList.add('is-open'); anchor.setAttribute('aria-expanded', 'true');
    anchor.__close = popover(anchor, list, { cls: 'pop-filter', align: 'left',
      onClose: () => { anchor.__close = null; anchor.classList.remove('is-open'); anchor.setAttribute('aria-expanded', 'false'); } });
  }

  const open = store.openFor(acct.id);

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Trades'),
    open.length
      ? el('span', { class: 'm', style: { display: 'inline-flex', alignItems: 'center', gap: '7px',
            fontSize: '11px', borderRadius: 'var(--r-pill)', padding: '5px 11px',
            background: 'rgba(255,184,0,.14)', color: 'var(--yellow)' } },
          el('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--yellow)' } }),
          `${open.length} still open`)
      : null,
    el('div', { class: 'spacer' }),
    oandaSyncButton(store, nav),
    el('button', { class: 'btn btn-ghost', onClick: () => nav.go('#/settings/vault') }, 'Export'),
    el('button', { class: 'btn btn-primary', onClick: () => nav.go('#/new') }, icon('plus', 15, 'currentColor', 2), 'New trade'),
  );

  const bar = el('section', { class: 'card tr-bar', style: { minHeight: '64px', flex: 'none', padding: '12px 24px', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: '8px' } },
    chip('Side', filters.side, 'side', [{ v: 'all', l: 'Side · all' }, { v: 'buy', l: 'Long' }, { v: 'sell', l: 'Short' }]),
    chip('Result', filters.result, 'result', [{ v: 'all', l: 'Result · all' }, { v: 'win', l: 'Wins' }, { v: 'loss', l: 'Losses' }, { v: 'breakeven', l: 'Break-even' }]),
    chip('Setup', filters.setupId, 'setupId', [{ v: 'all', l: 'Setup · all' }, ...store.playbook.setups.map(x => ({ v: x.id, l: x.name }))]),
    chip('Mistake', filters.mistake, 'mistake', [{ v: 'all', l: 'Mistakes · all' }, { v: 'none', l: 'Clean — none' }, { v: 'any', l: 'Any mistake' },
      ...MISTAKES.map(([k, n]) => ({ v: k, l: n }))]),
    chip('Exit', filters.exit, 'exit', [{ v: 'all', l: 'Exit · all' }, ...EXIT_REASONS.map(([k, n]) => ({ v: k, l: n }))]),
    chip('Confidence', filters.conf, 'conf', [{ v: 'all', l: 'Confidence · all' }, { v: '4+', l: '4+ · Solid or better' }, { v: '2-', l: '2 or less' },
      ...CONFIDENCE.map(([k, n]) => ({ v: String(k), l: `${k} · ${n}` }))]),
    chip('Timeframe', filters.tf, 'tf', [{ v: 'all', l: 'TF · all' }, ...EXEC_TFS.map(v => ({ v, l: v }))]),
    chip('News', filters.news, 'news', [{ v: 'all', l: 'News · all' }, { v: 'any', l: 'Around news' }, ...NEWS.map(([k, n]) => ({ v: k, l: n })),
      { v: 'holiday', l: 'Bank holiday' }]),
    Object.keys(FRESH).some(k => filters[k] !== FRESH[k])
      ? el('button', { class: 'm tr-clear', onClick: () => { Object.assign(filters, FRESH); nav.refresh(); } }, 'Clear')
      : null,
    el('span', { style: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'baseline', gap: '8px', whiteSpace: 'nowrap' } },
      el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-5)' } }, 'Filtered net'),
      el('span', { class: 'm', style: { fontSize: '15px', color: s.net > 0 ? 'var(--green)' : s.net < 0 ? 'var(--orange)' : 'var(--grey-2)' } },
        c.fig(u, acct, s.net, s.netR))),
  );

  const body = rows.length
    ? el('div', { class: 'tbl-body' }, ...rows.map(t => fullRow(t, acct, store, cols, nav)))
    : el('div', { class: 'empty' }, el('p', {}, store.tradesFor(acct.id).length
        ? 'No trades match these filters.'
        : 'Nothing logged on this account yet.'));

  /* ---------- the ones still running ----------
     Above the log rather than inside it, because they are not part of it yet:
     no result, no R, nothing to sort by. They sit at the top as a short list
     of things to finish, oldest first, since the trade you opened longest ago
     is the one you have most likely forgotten. */
  const openCard = open.length
    ? el('section', { class: 'card', style: { flex: 'none', padding: '18px 26px 14px' } },
        el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '9px', marginBottom: '10px' } },
          el('div', { class: 'eyebrow', style: { margin: 0, color: 'var(--yellow)' } }, 'Still open')),
        el('div', { class: 'tbl' },
          el('div', { class: 'tbl-head', style: { gridTemplateColumns: OPEN_COLS } },
            el('span', {}, 'Instrument'), el('span', {}, 'Side'), el('span', {}, 'Opened'),
            el('span', {}, 'Setup & tags'),
            el('span', { style: { textAlign: 'right' } }, 'Entry'),
            el('span', { style: { textAlign: 'right' } }, 'Stop'),
            el('span', { style: { textAlign: 'right' } }, 'Target'),
            el('span', { style: { textAlign: 'right' } }, 'Risk'),
            el('span', { style: { textAlign: 'right' } }, '')),
          el('div', {}, ...open.map(t => openRow(t, acct, store, nav)))))
    : null;

  const table = el('section', { class: 'card', style: { flex: '1', padding: '22px 26px 18px' } },
    el('div', { class: 'tbl', style: { flex: '1' } },
      el('div', { class: 'tbl-head', style: { gridTemplateColumns: cols } },
        el('span', {}, 'Instrument'), el('span', {}, 'Side'), el('span', {}, 'Closed'), el('span', {}, 'Setup & tags'),
        el('span', { style: { textAlign: 'right' } }, 'Size'), el('span', { style: { textAlign: 'right' } }, 'Entry'),
        el('span', { style: { textAlign: 'right' } }, 'Exit'), el('span', { style: { textAlign: 'right' } }, 'R'),
        el('span', { style: { textAlign: 'right' } }, u === 'R' ? 'Result' : u === '%' ? 'Return' : 'Net P&L')),
      body),
    el('div', { style: { marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid var(--grey-7)', display: 'flex', alignItems: 'center' } },
      el('span', { class: 'm', style: { fontSize: '11px', color: 'var(--grey-5)' } },
        `Showing ${rows.length} · ${s.wins} W · ${s.losses} L · ${s.breakevens} BE` +
        (s.winRate == null ? '' : ` · ${c.pct(s.winRate)}`))),
  );

  return el('div', { class: 'view' }, head, bar, openCard, table);
}

function fullRow(t, acct, store, cols, nav) {
  const o = c.outcome(t);
  const fwd = c.isForward(t);
  const r = c.rMultiple(acct, t);
  const setup = store.playbook.setups.find(s => s.id === t.setupId);
  const long = t.side === 'buy';
  const allTags = store.playbook.tagGroups.flatMap(g => g.tags);
  const tags = (t.tagIds || []).map(id => allTags.find(x => x.id === id)).filter(Boolean);

  return el('div', { class: 'tbl-row', style: { gridTemplateColumns: cols, cursor: 'pointer' },
                     onClick: () => nav.go('#/trade/' + t.id) },
    el('span', { style: { display: 'flex', alignItems: 'center', gap: '9px' } },
      el('span', { class: 'ins has-mark' }, pairMark(t.pair, 20), t.pair),
      canShare(t) ? el('button', { class: 'row-share', title: 'Share this trade', 'aria-label': 'Share this trade',
        onClick: e => { e.stopPropagation(); openShare(store, nav, t.id); } }, icon('share', 13, 'currentColor', 1.9)) : null),
    el('span', { class: 'td', style: { color: long ? 'var(--green)' : 'var(--orange)' } }, long ? '▲ Long' : '▼ Short'),
    el('span', { class: 'td' }, isToday(t) ? todayTag() : c.shortDate(t.date)),
    el('span', { class: 'tr-setup' },
      el('span', { style: { fontSize: '12px', color: 'var(--grey-3)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0 } },
        setup ? setup.name : '—',
        ...tags.slice(0, 2).map(tag => el('span', { class: 'm', style: {
          marginLeft: '6px', padding: '1px 7px', borderRadius: 'var(--r-pill)',
          background: 'var(--grey-7)', color: 'var(--grey-2)', fontSize: '10px' } }, tag.name))),
      /* a demo trade says so at the end of the row's words, just before the numbers */
      demoTag(t)),
    el('span', { class: 'num' }, fwd ? ft() : (t.size ?? '—')),
    el('span', { class: 'num' }, t.entryPrice ?? '—'),
    el('span', { class: 'num' }, t.exitPrice ?? '—'),
    el('span', { class: 'num', style: { color: 'var(--grey-1)' } }, r == null ? '—' : (r < 0 ? '−' : '+') + Math.abs(r).toFixed(2)),
    fwd
      ? el('span', { class: 'pl' }, ft())
      : el('span', { class: 'pl', style: { color: o === 'win' ? 'var(--green)' : o === 'loss' ? 'var(--orange)' : 'var(--grey-2)' } },
          c.tradeFig(store.displayUnit, acct, t)),
  );
}

const OPEN_COLS = '150px 78px 116px minmax(0,1fr) 92px 92px 92px 84px 96px';

/* A running trade, and the one button it needs: the way to finish it. */
function openRow(t, acct, store, nav) {
  const long = t.side === 'buy';
  const setup = store.playbook.setups.find(s => s.id === t.setupId);
  const allTags = store.playbook.tagGroups.flatMap(g => g.tags);
  const tags = (t.tagIds || []).map(id => allTags.find(x => x.id === id)).filter(Boolean);
  const oneR = c.oneR(acct, t);

  return el('div', { class: 'tbl-row', style: { gridTemplateColumns: OPEN_COLS, cursor: 'pointer' },
                     onClick: () => nav.go('#/trade/' + t.id) },
    el('span', { style: { display: 'flex', alignItems: 'center', gap: '9px' } },
      el('span', { style: { width: '3px', height: '17px', borderRadius: '2px', background: 'var(--yellow)' } }),
      el('span', { class: 'ins has-mark' }, pairMark(t.pair, 20), t.pair)),
    el('span', { class: 'm', style: { fontSize: '11.5px', color: long ? 'var(--profit)' : 'var(--loss)' } },
      long ? '▲ Long' : '▼ Short'),
    el('span', { class: 'td' }, isToday(t) ? todayTag() : c.shortDate(t.date), t.timeOpen ? '  ' + t.timeOpen : ''),
    el('span', { style: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' } },
      setup ? el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--ink-2)' } }, setup.name) : null,
      ...tags.slice(0, 2).map(tag => el('span', { class: 'tag' }, tag.name)),
      demoTag(t)),
    el('span', { class: 'num' }, t.entryPrice ?? '—'),
    el('span', { class: 'num', style: { color: t.stopLoss == null ? 'var(--grey-5)' : 'var(--loss)' } }, t.stopLoss ?? '—'),
    el('span', { class: 'num', style: { color: t.takeProfit == null ? 'var(--grey-5)' : 'var(--profit)' } }, t.takeProfit ?? '—'),
    el('span', { class: 'num', title: oneR ? `1R = ${c.money(oneR, { sign: false, currency: acct.currency })}` : '' },
      t.riskPercent == null ? '—' : Number(t.riskPercent).toFixed(2) + '%'),
    el('span', { style: { textAlign: 'right' } },
      el('button', { class: 'm', style: { fontSize: '10.5px', borderRadius: 'var(--r-pill)', padding: '5px 12px',
            background: 'rgba(255,184,0,.16)', color: 'var(--yellow)' },
          onClick: e => { e.stopPropagation(); nav.go('#/edit/' + t.id); } }, 'Close it')));
}
