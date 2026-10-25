/* ============================================================
   acctboard.js — Settings → Accounts: every account as a card.

   Three shelves: evaluations, funded accounts, live accounts (and the ones
   put away, folded at the bottom). A card says where the account is (the
   firm's logo, its name, a badge), how big it is, what it has made, what
   has been paid out of it, and what is left after — with its balance, the
   highest it has been, and a line of the balance over time.

     Log payout    takes money out of a funded account (Withdraw on a live
                   one): the balance drops by it, the P&L after payouts too.
     Update balance  makes the balance read what the firm or broker says,
                   by a dated correction (fees, a trade not logged).
     Passed        an evaluation is put away as passed and the funded
                   account it earned starts beside it.
     Select for payout  ticks several cards and logs one payout on each.

   Pressing a card makes it the account you are on. The pencil edits it:
   type, firm, size, name, risk, its payouts, and putting it away. A new
   account is added step by step (acctnew.js): a prop firm or live, then
   futures or CFD and the firm, or the broker.

   The money is calc.accountMoney (via store.moneyOf); the firms and the
   names are acctfirms.js; a firm's logo is his own image (logo.js).
   ============================================================ */
import { el, svg, icon, toast, confirmButton } from '../ui.js';
import * as c from '../calc.js';
import { todayISO } from '../store.js';
import { sheet } from '../sheet.js';
import { accountActions } from './accountActions.js';
import { ACCOUNT_FIRMS, ACCOUNT_COLOURS, CURRENCIES, FIRM_GROUPS, findFirm, firmOf, guessFirm, kindOf, sizeShort, suggestName } from '../acctfirms.js';
import { logoTile, logoRow } from './acctlogo.js';
import { newAccount } from './acctnew.js';

const KIND = {
  eval:   { label: 'EVAL',   shelf: 'Evals',   out: null },
  funded: { label: 'FUNDED', shelf: 'Funded',  out: { verb: 'Log payout', noun: 'Payouts', after: 'after payouts', done: 'Paid out' } },
  live:   { label: 'LIVE',   shelf: 'Live',    out: { verb: 'Withdraw', noun: 'Withdrawn', after: 'after withdrawals', done: 'Withdrew' } },
};
const COLOURS = ACCOUNT_COLOURS;
/* a payout just logged, so its card can count down to the new figure once */
const justPaid = new Map();

const fold = (() => {
  const KEY = 'laminar:accounts-folded';
  let m = { archived: true };
  try { m = { ...m, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* a convenience only */ }
  return { is: k => !!m[k], set(k, v) { m[k] = v; try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* fine */ } } };
})();

const quiet = () => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
/* whole dollars on the cards; cents where an exact figure is being entered or read back */
const whole = (v, cur, exact = false) => c.money(v, { sign: false, currency: cur, decimals: exact && Math.abs(v % 1) > 0.004 ? 2 : 0 });
const signed = (v, cur, exact = false) => c.money(v, { currency: cur, decimals: exact && Math.abs(v % 1) > 0.004 ? 2 : 0 });

/* ---------- the balance over time ---------- */
let sparkN = 0;
function spark(series) {
  const W = 320, H = 46, pts = series.length > 1 ? series : [series[0] || 0, series[0] || 0];
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const xy = pts.map((v, i) => [i / (pts.length - 1) * W, H - 4 - (v - lo) / span * (H - 10)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const id = 'abg' + (++sparkN);
  return svg('svg', { class: 'ab-spark', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    svg('defs', {}, svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
      svg('stop', { offset: '0', 'stop-color': 'currentColor', 'stop-opacity': '.26' }),
      svg('stop', { offset: '1', 'stop-color': 'currentColor', 'stop-opacity': '0' }))),
    svg('path', { d: `${line}L${W} ${H}L0 ${H}Z`, fill: `url(#${id})` }),
    svg('path', { d: line, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }));
}

/* ============================================================
   The page
   ============================================================ */
export function accountBoard(store, nav, { openNew = false } = {}) {
  const sel = new Set();
  let selecting = null;                       // 'funded' | 'live' while ticking cards for a payout

  const view = el('div', { class: 'view ab-view' });
  const bar = el('div', { class: 'ab-selbar', hidden: true });

  function paint() {
    const all = store.allAccounts;
    const live = all.filter(a => !a.archived);
    const by = k => live.filter(a => kindOf(a) === k);
    const away = all.filter(a => a.archived);
    const total = live.reduce((s, a) => s + store.balanceOf(a), 0);
    const paidAll = all.reduce((s, a) => s + store.moneyOf(a).paid, 0);
    const cur = store.activeAccount?.currency || 'USD';

    const head = el('header', { class: 'head st-subhead ab-head' },
      el('button', { class: 'st-back', onClick: () => nav.go('#/settings') }, icon('chevleft', 13, 'currentColor', 2.2), 'Settings'),
      el('h1', {}, 'Accounts'),
      el('span', { class: 'sub' }, `${live.length} active${away.length ? ` · ${away.length} put away` : ''}`),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-primary ab-new', onClick: () => newAccount(store, nav) }, icon('plus', 13, 'currentColor', 2.2), 'New account'));

    const sum = el('div', { class: 'ab-sum' },
      stat('Across your accounts', whole(total, cur)),
      stat('Paid out so far', paidAll ? whole(paidAll, cur) : '—'),
      stat('Evals', String(by('eval').length)), stat('Funded', String(by('funded').length)), stat('Live', String(by('live').length)));

    const add = el('button', { class: 'ab-add', onClick: () => newAccount(store, nav) }, icon('plus', 14, 'currentColor', 2), 'Add another account');

    view.replaceChildren(head, el('div', { class: 'ab-body' }, sum, add,
      ...['eval', 'funded', 'live'].map(k => shelf(k, by(k))).filter(Boolean),
      away.length ? shelf('archived', away) : null), bar);
    paintBar();
  }
  const stat = (k, v) => el('div', { class: 'ab-sum-i' }, el('span', {}, k), el('b', {}, v));

  function shelf(k, list) {
    if (!list.length && k !== 'funded') return null;
    const folded = fold.is(k);
    const name = k === 'archived' ? 'Put away' : KIND[k].shelf;
    const canSelect = (k === 'funded' || k === 'live') && list.length > 0;
    const head = el('div', { class: 'ab-shelf-h' },
      el('button', { class: 'ab-shelf-t' + (folded ? ' is-folded' : ''), 'aria-expanded': String(!folded),
        onClick: () => { fold.set(k, !folded); paint(); } },
        `${name.toUpperCase()} · ${list.length}`, icon(folded ? 'chevright' : 'chevdown', 11, 'currentColor', 2.2), folded ? el('span', { class: 'ab-hid' }, 'hidden') : null),
      canSelect && !folded ? el('button', { class: 'ab-select' + (selecting === k ? ' is-on' : ''), onClick: () => {
          selecting = selecting === k ? null : k; sel.clear(); paint();
        } }, icon('check', 12, 'currentColor', 2.2), selecting === k ? 'Done selecting' : `Select for ${k === 'live' ? 'withdrawal' : 'payout'}`) : null);
    if (folded) return el('section', { class: 'ab-shelf is-folded', 'data-shelf': k }, head);
    const grid = el('div', { class: 'ab-grid' }, ...list.map(a => card(a)));
    if (!list.length) grid.append(el('div', { class: 'ab-empty' }, 'No funded accounts yet — pass an evaluation, or add one.'));
    return el('section', { class: 'ab-shelf', 'data-shelf': k }, head, grid);
  }

  function card(a) {
    const k = kindOf(a), K = KIND[k], f = firmOf(a), cur = a.currency;
    const m = store.moneyOf(a);
    const active = !a.archived && store.activeAccount?.id === a.id;
    const ticking = selecting && !a.archived && kindOf(a) === selecting;
    const node = el('article', { class: 'card ab-card' + (active ? ' is-active' : '') + (a.archived ? ' is-away' : '') + (ticking ? ' is-ticking' : '') + (sel.has(a.id) ? ' is-sel' : ''),
        'data-account': a.id, 'data-kind': k, style: { '--tint': f.tint } });

    const badge = a.archived
      ? el('span', { class: 'ab-badge is-' + (a.status || 'away') }, a.status === 'passed' ? 'PASSED' : a.status === 'blown' ? 'BLOWN' : 'ARCHIVED')
      : el('span', { class: 'ab-badge is-' + k }, k === 'funded' ? icon('shield', 11, 'currentColor', 2) : k === 'live' ? el('i', { class: 'ab-dot' }) : null, K.label);
    node.append(el('div', { class: 'ab-top' },
      logoTile(store, a, 50),
      el('div', { class: 'ab-id' },
        el('div', { class: 'ab-firm' }, el('b', {}, f.name), badge, active ? el('span', { class: 'ab-on' }, 'On') : null),
        el('div', { class: 'ab-size' }, `${whole(a.startingBalance, cur)} account`),
        el('span', { class: 'ab-chip' }, logoTile(store, a, 15, 'is-mini'), el('span', { class: 'ab-name' }, a.name))),
      ticking ? el('span', { class: 'ab-tick' }, sel.has(a.id) ? icon('check', 12, 'currentColor', 2.6) : null)
        : el('button', { class: 'ab-edit', title: 'Edit this account', 'aria-label': `Edit ${a.name}`,
            onClick: e => { e.stopPropagation(); accountSheet(store, nav, a); } }, icon('pencil', 13, 'currentColor', 1.9))));

    const trades = store.liveClosedFor(a.id).length;
    node.append(el('div', { class: 'ab-stats' },
      cell('Account', whole(m.start, cur)),
      cell(k === 'eval' ? 'P&L' : 'Gross P&L', signed(m.gross, cur), m.gross > 0 ? 'is-up' : m.gross < 0 ? 'is-down' : ''),
      K.out ? cell(K.out.noun, m.paid ? whole(m.paid, cur) : '—') : cell('Trades', String(trades))));

    const big = el('b', { class: 'ab-big' + (m.after > 0 ? ' is-up' : m.after < 0 ? ' is-down' : '') }, signed(K.out ? m.after : m.gross, cur));
    const balLine = el('span', { class: 'ab-bal-t' }, `Balance ${whole(m.balance, cur)} · Peak ${whole(m.peak, cur)}`);
    let act = null;
    if (a.archived) act = accountActions(store, nav, a);
    else if (K.out) act = el('button', { class: 'ab-pay', onClick: e => { e.stopPropagation(); payoutSheet(store, nav, [a]); } },
      k === 'funded' ? el('span', { class: 'ab-cash' }, '$') : icon('download', 12, 'currentColor', 2), K.out.verb);
    else act = confirmButton({ label: 'Passed', armedLabel: 'Start the funded account', className: 'ab-pay ab-pass',
      armedClassName: 'ab-pay ab-pass is-armed', title: 'Passed: put it away as passed and start the funded account',
      onConfirm: async () => { const fresh = await store.passEval(a.id); toast(`Passed — ${fresh?.name || 'the funded account'} is ready`); nav.refresh(); } });
    node.append(el('div', { class: 'ab-net' },
      el('div', {}, el('span', { class: 'ab-k' }, K.out ? `Net P&L · ${K.out.after}` : `P&L · ${trades} trade${trades === 1 ? '' : 's'}`), big),
      act));
    node.append(el('div', { class: 'ab-bal' }, balLine,
      a.archived ? null : el('button', { class: 'ab-upd', onClick: e => { e.stopPropagation(); balanceSheet(store, nav, a); } }, 'Update balance')));
    node.append(spark(m.series));

    if (!a.archived) node.addEventListener('click', async e => {
      if (e.target.closest('button, a, input')) return;
      if (ticking) { if (sel.has(a.id)) sel.delete(a.id); else sel.add(a.id); paint(); return; }
      if (active) return;
      await store.setActiveAccount(a.id);
      toast('Switched to ' + a.name);
      nav.refresh();
    });

    /* a payout just logged: the figures count down to where they are now */
    const jp = justPaid.get(a.id);
    if (jp) {
      justPaid.delete(a.id);
      node.append(el('span', { class: 'ab-float' }, '−' + whole(jp.amount, cur)));
      if (!quiet()) {
        const t0 = performance.now(), D = 900;
        const step = now => {
          const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3);
          big.textContent = signed(jp.after + (m.after - jp.after) * e, cur);
          balLine.textContent = `Balance ${whole(jp.balance + (m.balance - jp.balance) * e, cur)} · Peak ${whole(m.peak, cur)}`;
          if (p < 1) requestAnimationFrame(step); else { big.textContent = signed(m.after, cur); }
        };
        requestAnimationFrame(step);
      }
    }
    return node;
  }
  const cell = (k, v, cls = '') => el('div', { class: 'ab-cell' }, el('span', { class: 'ab-k' }, k), el('b', { class: cls }, v));

  function paintBar() {
    bar.hidden = !selecting;
    if (!selecting) return;
    const n = sel.size, verb = selecting === 'live' ? 'withdrawal' : 'payout';
    bar.replaceChildren(
      el('span', {}, n ? `${n} selected` : `Tick the accounts that ${selecting === 'live' ? 'you withdrew from' : 'paid out'}`),
      el('button', { class: 'btn btn-ghost', onClick: () => { selecting = null; sel.clear(); paint(); } }, 'Cancel'),
      el('button', { class: 'btn btn-primary', disabled: !n, onClick: () => {
          const list = store.allAccounts.filter(a => sel.has(a.id));
          payoutSheet(store, nav, list, { onDone: () => { selecting = null; sel.clear(); } });
        } }, `Log ${verb}${n > 1 ? ' for each' : ''}`));
  }

  paint();
  if (openNew) setTimeout(() => newAccount(store, nav), 0);
  return view;
}

/* ============================================================
   Log payout / Withdraw — for one account, or the same on several
   ============================================================ */
export function payoutSheet(store, nav, list, { onDone } = {}) {
  const k = kindOf(list[0]), K = KIND[k] || KIND.funded, out = K.out || KIND.funded.out;
  const cur = list[0].currency;
  const amount = el('input', { class: 'field ab-amount', inputmode: 'decimal', placeholder: '1 000', 'aria-label': 'Amount' });
  const date = el('input', { class: 'field', type: 'date', value: todayISO(), 'aria-label': 'Date' });
  const note = el('input', { class: 'field', placeholder: k === 'live' ? 'Bank, card…' : 'Rise, bank, crypto…', maxLength: 80, 'aria-label': 'Note' });
  const echo = el('div', { class: 'ab-echo' });
  const go = el('button', { class: 'btn btn-primary ab-go' }, list.length > 1 ? `${out.verb} for ${list.length}` : out.verb);
  const paint = () => {
    const v = c.parseNumber(amount.value);
    if (amount.value.trim() === '') { echo.textContent = list.length > 1 ? `The same amount on each of ${list.length} accounts.` : `Balance now ${whole(store.balanceOf(list[0]), cur, true)}.`; return; }
    if (!(v > 0)) { echo.textContent = 'Not an amount yet'; return; }
    echo.textContent = list.length > 1
      ? `${whole(v, cur)} on each · ${whole(v * list.length, cur)} in all`
      : `Balance ${whole(store.balanceOf(list[0]), cur, true)} → ${whole(store.balanceOf(list[0]) - v, cur, true)}`;
  };
  amount.addEventListener('input', paint);
  const body = el('div', { class: 'ab-form' },
    list.length > 1 ? el('div', { class: 'ab-who' }, ...list.map(a => el('span', { class: 'ab-chip' }, logoTile(store, a, 15, 'is-mini'), el('span', { class: 'ab-name' }, a.name)))) : null,
    lbl('Amount', amount), echo,
    el('div', { class: 'ab-2' }, lbl('Paid on', date), lbl('Note', note)),
    go);
  const s = sheet({ cls: 'is-ab is-small', title: list.length > 1 ? `${out.verb} — ${list.length} accounts` : `${out.verb} · ${list[0].name}`, body });
  paint();
  setTimeout(() => amount.focus(), 60);
  go.addEventListener('click', async () => {
    const v = c.parseNumber(amount.value);
    if (!(v > 0)) { amount.classList.add('is-missing'); amount.focus(); return; }
    for (const a of list) {
      const before = store.moneyOf(a);
      await store.addPayout(a.id, { amount: v, date: date.value, note: note.value });
      justPaid.set(a.id, { amount: v, after: before.after, balance: before.balance });
    }
    s.close();
    onDone?.();
    toast(`${out.done} ${whole(v * list.length, cur)}${list.length > 1 ? ` across ${list.length} accounts` : ''}`);
    nav.refresh();
  });
  amount.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
}

/* ============================================================
   Update balance — match the firm's or the broker's figure
   ============================================================ */
export function balanceSheet(store, nav, a) {
  const cur = a.currency, now = store.balanceOf(a);
  const input = el('input', { class: 'field ab-amount', inputmode: 'decimal', placeholder: String(Math.round(now)), 'aria-label': 'Balance now' });
  const echo = el('div', { class: 'ab-echo' }, `Laminar has ${whole(now, cur, true)}.`);
  const go = el('button', { class: 'btn btn-primary ab-go' }, 'Update balance');
  input.addEventListener('input', () => {
    const v = c.parseNumber(input.value);
    if (input.value.trim() === '') { echo.textContent = `Laminar has ${whole(now, cur, true)}.`; return; }
    if (v == null) { echo.textContent = 'Not an amount yet'; return; }
    const d = v - now;
    echo.textContent = Math.abs(d) < 0.005 ? 'That is what Laminar has already.'
      : `${signed(d, cur, true)} from Laminar's figure — kept as a correction, dated today (fees, a trade not logged).`;
  });
  const body = el('div', { class: 'ab-form' },
    el('p', { class: 'ab-p' }, `What does ${firmOf(a).name} show for ${a.name} right now?`),
    lbl('Balance now', input), echo, go);
  const s = sheet({ cls: 'is-ab is-small', title: `Update balance · ${a.name}`, body });
  setTimeout(() => input.focus(), 60);
  go.addEventListener('click', async () => {
    const v = c.parseNumber(input.value);
    if (v == null) { input.classList.add('is-missing'); input.focus(); return; }
    const d = await store.setBalance(a.id, v);
    s.close();
    toast(Math.abs(d) < 0.005 ? 'Already right' : `Balance set to ${whole(v, cur, true)} (${signed(d, cur, true)})`);
    nav.refresh();
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go.click(); });
}

/* ============================================================
   New account, or editing one
   ============================================================ */
export function accountSheet(store, nav, a) {
  const editing = !!a;
  const d = {
    kind: editing ? kindOf(a) : 'eval',
    firm: editing ? (a.firm || (a.firmName ? 'other' : guessFirm(a.name) || '')) : '',
    firmName: a?.firmName || '',
    size: editing ? String(a.startingBalance) : '',
    name: a?.name || '', named: editing,
    currency: a?.currency || 'USD',
    risk: String(a?.defaultRiskPercent ?? '1.00'),
    target: String(a?.weeklyTargetPercent || 0),
    opened: a?.openedAt || todayISO(),
    color: a?.color || COLOURS[0],
  };
  /* the form scrolls; its button stays put at the foot */
  const body = el('div', { class: 'ab-form ab-edit-form' });
  const foot = el('div', { class: 'ab-foot' });
  const s = sheet({ cls: 'is-ab', title: editing ? `Edit ${a.name}` : 'New account', body: el('div', { class: 'ab-sheetbody' }, body, foot) });
  const taken = () => store.allAccounts.filter(x => x !== a).map(x => x.name);
  const firm = () => (d.firm && d.firm !== 'other' ? findFirm(d.firm) : null);
  const guessName = () => {
    if (d.named) return;
    const f = firm() || (d.firm === 'other' && d.firmName.trim() ? { name: d.firmName.trim() } : null);
    if (f) d.name = suggestName(f, c.parseNumber(d.size), taken());
  };
  const pseudo = () => ({ firm: d.firm || undefined, firmName: d.firmName, name: d.name || 'Account', color: d.color });

  function paint() {
    const f = firm();
    const groups = d.kind === 'live' ? ['broker'] : ['futures', 'forex'];
    const kinds = el('div', { class: 'seg ab-kinds' }, ...[['eval', 'Evaluation'], ['funded', 'Funded'], ['live', 'Live']].map(([k, l]) =>
      el('button', { class: d.kind === k ? 'is-on' : '', 'data-kind': k, onClick: () => {
        if (d.kind === k) return;
        const wasLive = d.kind === 'live';
        d.kind = k;
        if ((k === 'live') !== wasLive && d.firm && d.firm !== 'other') { d.firm = ''; }
        guessName(); paint();
      } }, l)));

    const tiles = groups.map(g => el('div', { class: 'ab-fgroup' },
      el('div', { class: 'ab-fk' }, FIRM_GROUPS.find(x => x[0] === g)[1]),
      el('div', { class: 'ab-firms' }, ...ACCOUNT_FIRMS.filter(x => x.group === g).map(x =>
        el('button', { class: 'ab-ftile' + (d.firm === x.id ? ' is-on' : ''), 'data-firm': x.id, onClick: () => {
          d.firm = x.id;
          if (x.sizes && !x.sizes.includes(c.parseNumber(d.size))) d.size = String(x.sizes.includes(50000) ? 50000 : x.sizes[0]);
          guessName(); paint();
        } }, logoTile(store, { firm: x.id }, 34), el('span', {}, x.name.length > 13 && x.short ? x.short : x.name))))));
    const other = el('button', { class: 'ab-ftile is-other' + (d.firm === 'other' ? ' is-on' : ''), 'data-firm': 'other',
      onClick: () => { d.firm = 'other'; guessName(); paint(); setTimeout(() => body.querySelector('.ab-othername')?.focus(), 0); } },
      el('span', { class: 'ab-logo', style: { width: '34px', height: '34px' } }, icon('plus', 14, 'currentColor', 2)), el('span', {}, 'Other'));
    const otherName = d.firm === 'other' ? el('input', { class: 'field ab-othername', value: d.firmName, maxLength: 40,
      placeholder: d.kind === 'live' ? 'Broker name' : 'Firm name',
      onInput: e => { d.firmName = e.target.value; guessName(); nameIn.value = d.name; logoEl.replaceWith(logoEl = logoPart()); } }) : null;

    /* the size: the firm's own sizes, or any amount */
    const sizeIn = el('input', { class: 'field ab-sizein', inputmode: 'decimal', value: d.size ? Number(d.size).toLocaleString('en-US') : '',
      placeholder: d.kind === 'live' ? '10 000' : '50 000', 'aria-label': d.kind === 'live' ? 'Starting balance' : 'Account size',
      onInput: e => { d.size = String(c.parseNumber(e.target.value) ?? ''); guessName(); nameIn.value = d.name; paintChips(); } });
    const chips = el('div', { class: 'ab-sizes' });
    const paintChips = () => chips.replaceChildren(...((d.kind !== 'live' && f?.sizes) || []).map(n =>
      el('button', { class: 'ab-szchip' + (c.parseNumber(d.size) === n ? ' is-on' : ''), onClick: () => {
        d.size = String(n); sizeIn.value = n.toLocaleString('en-US'); guessName(); nameIn.value = d.name; paintChips();
      } }, sizeShort(n))));
    paintChips();

    const nameIn = el('input', { class: 'field ab-namein', value: d.name, maxLength: 40, placeholder: 'Apex 50K', 'aria-label': 'Account name',
      onInput: e => { d.name = e.target.value; d.named = !!e.target.value.trim(); } });
    const risk = el('input', { class: 'field', inputmode: 'decimal', value: d.risk, 'aria-label': 'Default risk %', onInput: e => { d.risk = e.target.value; } });
    const target = el('input', { class: 'field', inputmode: 'decimal', value: d.target, 'aria-label': 'Weekly target %', onInput: e => { d.target = e.target.value; } });
    const curSel = el('select', { class: 'field', 'aria-label': 'Currency', onChange: e => { d.currency = e.target.value; } },
      ...CURRENCIES.map(x => el('option', { value: x, selected: x === d.currency }, x)));
    const opened = el('input', { class: 'field', type: 'date', value: d.opened, 'aria-label': 'Opened', onInput: e => { d.opened = e.target.value; } });
    const colours = el('div', { class: 'ab-colours' }, ...COLOURS.map(col => el('button', { class: 'ab-col' + (d.color === col ? ' is-on' : ''), style: { background: col },
      'aria-label': 'Colour', onClick: () => { d.color = col; paint(); } })));

    let logoEl = logoPart();
    const missing = el('div', { class: 'missing-note' });
    const go = el('button', { class: 'btn btn-primary ab-go' }, editing ? 'Save' : 'Create account');
    go.addEventListener('click', async () => {
      const size = c.parseNumber(d.size);
      const why = [];
      if (d.firm === 'other' && !d.firmName.trim()) why.push(d.kind === 'live' ? 'the broker’s name' : 'the firm’s name');
      if (!(size > 0)) why.push(d.kind === 'live' ? 'a starting balance' : 'a size');
      if (!d.name.trim()) why.push('a name');
      if (why.length) { missing.textContent = 'Needs ' + why.join(' and '); return; }
      const patch = { kind: d.kind, firm: d.firm || undefined, firmName: d.firm === 'other' ? d.firmName.trim() : undefined, name: d.name.trim(),
        startingBalance: size, currency: d.currency, defaultRiskPercent: c.parseNumber(d.risk) ?? 1, color: d.color,
        weeklyTargetPercent: c.parseNumber(d.target) || 0 };
      if (editing) {
        if (patch.firmName === undefined) patch.firmName = undefined;
        await store.updateAccount(a.id, patch);
        if (!patch.firmName) delete a.firmName;
        toast('Saved ' + patch.name);
      } else {
        const made = await store.addAccount({ ...patch, openedAt: d.opened });
        if (!store.activeAccount || store.accounts.length === 1) await store.setActiveAccount(made.id);
        toast('Created ' + made.name);
      }
      s.close();
      nav.refresh();
    });

    const top = body.scrollTop;
    body.replaceChildren(...[
      part('Type', kinds),
      part(d.kind === 'live' ? 'Broker' : 'Prop firm', ...tiles, el('div', { class: 'ab-firms is-other' }, other), otherName),
      logoEl,
      part(d.kind === 'live' ? 'Starting balance' : 'Size', chips, sizeIn),
      part('Name', nameIn),
      el('div', { class: 'ab-3' }, lbl('Currency', curSel), lbl('Risk a trade %', risk), editing ? lbl('Weekly target %', target) : lbl('Opened', opened)),
      part('Colour', colours),
      editing ? history() : null,
      editing ? away() : null,
    ].filter(Boolean));
    body.scrollTop = top;
    foot.replaceChildren(missing, go);
  }

  /* the firm's logo: his own image, squared and centred, for every account there */
  const logoPart = () => logoRow(store, nav, pseudo(), paint);

  /* what has been paid out and corrected, with a way to take a mistake back */
  function history() {
    const rows = [
      ...(a.payouts || []).map(p => ({ id: p.id, date: p.date, what: kindOf(a) === 'live' ? 'Withdrawal' : 'Payout', v: -Math.abs(p.amount), note: p.note, drop: () => store.removePayout(a.id, p.id) })),
      ...(a.adjustments || []).map(x => ({ id: x.id, date: x.date, what: 'Balance correction', v: x.amount, note: '', drop: () => store.removeAdjustment(a.id, x.id) })),
    ].sort((x, y) => String(y.date).localeCompare(String(x.date)));
    if (!rows.length) return null;
    return part('Paid out and corrected', el('div', { class: 'ab-hist' }, ...rows.map(r => el('div', { class: 'ab-hrow' },
      el('span', { class: 'ab-hd' }, c.longDate ? c.longDate(r.date) : r.date),
      el('span', { class: 'ab-hw' }, r.what, r.note ? el('i', {}, ' · ' + r.note) : null),
      el('b', { class: r.v < 0 ? 'is-down' : 'is-up' }, signed(r.v, a.currency, true)),
      el('button', { class: 'ab-hx', title: 'Take it back', 'aria-label': 'Remove', onClick: async () => { await r.drop(); paint(); nav.refresh(); } }, icon('close', 11, 'currentColor', 2.2))))));
  }

  /* blown, archived, deleted */
  function away() {
    const k = kindOf(a);
    return part('Put it away',
      el('div', { class: 'ab-away' },
        k !== 'live' && !a.archived ? confirmButton({ label: 'Blown', armedLabel: 'Mark it blown', className: 'acct-act', armedClassName: 'acct-act is-armed',
          title: 'Put it away as blown — every trade stays', onConfirm: async () => { await store.blowAccount(a.id); toast(`${a.name} marked blown`); s.close(); nav.refresh(); } }) : null,
        accountActions(store, { go: h => { s.close(); nav.go(h); }, refresh: () => { s.close(); nav.refresh(); } }, a)));
  }

  paint();
  if (!editing) setTimeout(() => body.querySelector('.ab-ftile')?.focus(), 80);
  return s;
}

const lbl = (k, control) => el('label', { class: 'ab-l' }, el('span', { class: 'ab-lk' }, k), control);
const part = (k, ...content) => el('div', { class: 'ab-part' }, el('div', { class: 'ab-lk' }, k), ...content.filter(Boolean));
