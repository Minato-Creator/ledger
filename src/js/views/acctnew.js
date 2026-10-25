/* ============================================================
   acctnew.js — adding an account, one question at a time.

   The way LiquidJournal asks it: first what kind of account it is, then
   only what that kind needs.

     Prop firm   Futures or CFD?  →  the firm (logos, with a search)
                 →  the plan: evaluation or funded, and the size
                 →  its name (and its balance today, if it is not new)
                 →  a last look, then Create account.
     Live        the broker  →  name, starting balance, the day it starts
                 →  a last look, then Create account.

   A rail down the left shows the steps; one already done says what was
   picked and goes back to it. Picking a card moves on by itself; a step
   with something to type has Continue. Currency, risk and colour are
   tucked under "More" — the defaults are right for most accounts.

   Editing an account later is still the one sheet in acctboard.js.
   ============================================================ */
import { el, icon, toast } from '../ui.js';
import * as c from '../calc.js';
import { todayISO } from '../store.js';
import { sheet } from '../sheet.js';
import { ACCOUNT_COLOURS, COMMON_SIZES, CURRENCIES, MARKETS, findFirm, firmOf, firmsIn, sizeShort } from '../acctfirms.js';
import { logoTile, logoRow } from './acctlogo.js';

const PROP_STEPS = [['firm', 'Firm'], ['plan', 'Plan'], ['name', 'Name'], ['confirm', 'Confirm']];
const LIVE_STEPS = [['broker', 'Broker'], ['details', 'Details'], ['confirm', 'Confirm']];
const KIND_LABEL = { eval: 'Evaluation', funded: 'Funded', live: 'Live' };
const KIND_WORD = { eval: 'Eval', funded: 'Funded', live: 'Live' };
const BADGE = { eval: 'EVAL', funded: 'FUNDED', live: 'LIVE' };

const unique = (base, taken) => {
  const has = new Set(taken.map(x => x.toLowerCase()));
  if (!has.has(base.toLowerCase())) return base;
  for (let i = 2; i < 200; i++) if (!has.has(`${base} #${i}`.toLowerCase())) return `${base} #${i}`;
  return base;
};
const range = f => (f.sizes?.length ? `$${sizeShort(Math.min(...f.sizes))} to $${sizeShort(Math.max(...f.sizes))}` : '');

/** Opens the Add account steps. `path` ('prop' | 'live') skips the first question. */
export function newAccount(store, nav, { path = null } = {}) {
  const w = {
    path, step: path === 'live' ? 'broker' : path === 'prop' ? 'market' : 'start',
    market: null, firm: '', firmName: '', kind: 'eval', size: '', name: '', named: false, balance: '',
    currency: store.activeAccount?.currency || 'USD', risk: '1.00', opened: todayISO(), color: ACCOUNT_COLOURS[0], q: '',
  };

  /* ---------- what has been picked so far ---------- */
  const firm = () => (w.firm && w.firm !== 'other' ? findFirm(w.firm) : null);
  const firmLike = () => firm() || (w.firm === 'other' && w.firmName.trim() ? { name: w.firmName.trim(), short: w.firmName.trim() } : null);
  const kindNow = () => (w.path === 'live' ? 'live' : w.kind);
  const sizeN = () => c.parseNumber(w.size);
  const balN = () => c.parseNumberOrNull(w.balance);
  const pseudo = () => ({ firm: w.firm || undefined, firmName: w.firmName, name: w.name || 'Account', color: w.color });
  const cash = v => c.money(v, { sign: false, currency: w.currency, decimals: Math.abs(v % 1) > 0.004 ? 2 : 0 });
  const taken = () => store.allAccounts.map(a => a.name);
  const suggestions = () => {
    const f = firmLike();
    if (!f) return [];
    const short = f.short || f.name, sz = sizeN() > 0 ? sizeShort(sizeN()) : '', kw = KIND_WORD[kindNow()];
    const bases = w.path === 'live'
      ? [`${short} Live`, short, sz && `${short} ${sz}`]
      : [sz ? `${short} ${sz}` : short, `${short} ${kw}`, sz && `${short} ${sz} ${kw}`];
    return [...new Set(bases.filter(Boolean).map(b => unique(b, taken())))];
  };
  const guessName = () => { if (!w.named) w.name = suggestions()[0] || ''; };

  /* ---------- the sheet: a rail of steps, and the step itself ---------- */
  const rail = el('nav', { class: 'aw-rail', 'aria-label': 'Steps' });
  const panel = el('div', { class: 'aw-panel' });
  const s = sheet({ cls: 'is-ab is-wiz', title: 'Add account', body: el('div', { class: 'aw' }, rail, panel) });
  const title = s.panel.querySelector('.sheet-title h2');

  const go = step => { w.step = step; paint(); };
  const steps = () => (w.path === 'live' ? LIVE_STEPS : PROP_STEPS);
  const at = () => { const st = w.step === 'market' ? 'firm' : w.step; return steps().findIndex(x => x[0] === st); };

  function paint() {
    const start = w.step === 'start';
    s.panel.classList.toggle('is-start', start);
    s.panel.dataset.step = w.step;
    title.textContent = start ? 'Add account' : w.path === 'live' ? 'Add a live account' : 'Add a prop firm account';
    rail.hidden = start;
    if (!start) paintRail();
    const v = STEPS[w.step]();
    const head = start ? null : el('div', { class: 'aw-head' },
      v.back ? el('button', { class: 'aw-back', 'aria-label': 'Back', title: 'Back', onClick: v.back }, icon('chevleft', 15, 'currentColor', 2.2)) : null,
      v.titleEl || el('b', { class: 'aw-title' }, v.title),
      v.chip || null,
      el('span', { class: 'aw-count' }, `${at() + 1} of ${steps().length}`));
    const body = el('div', { class: 'aw-body' }, ...v.body.filter(Boolean));
    let foot = null;
    if (v.foot) {
      const missing = el('div', { class: 'missing-note' });
      const btn = el('button', { class: 'btn btn-primary ab-go' + (v.foot.ready() ? '' : ' is-wait') }, v.foot.label);
      btn.addEventListener('click', async () => {
        const why = v.foot.ready() ? '' : v.foot.need();
        if (why) { missing.textContent = why; v.foot.where?.(); return; }
        missing.textContent = '';
        btn.disabled = true;
        try { await v.foot.go(); } finally { btn.disabled = false; }
      });
      /* the button wakes up as the step is filled in */
      body.addEventListener('input', () => { btn.classList.toggle('is-wait', !v.foot.ready()); if (v.foot.ready()) missing.textContent = ''; });
      body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input:not([type="date"])')) { e.preventDefault(); btn.click(); } });
      foot = el('div', { class: 'aw-foot' }, missing, btn);
    }
    panel.replaceChildren(...[head, body, foot].filter(Boolean));
    if (v.focus) setTimeout(() => panel.querySelector(v.focus)?.focus({ preventScroll: true }), 40);
  }

  function paintRail() {
    const i0 = at(), f = firmLike();
    const said = {
      firm: f ? `${f.name}${w.market ? ' · ' + MARKETS.find(m => m.id === w.market).name : ''}` : '',
      plan: sizeN() > 0 ? `${KIND_WORD[w.kind]} · $${sizeShort(sizeN())}` : '',
      name: w.name,
      broker: f ? f.name : '',
      details: sizeN() > 0 ? cash(sizeN()) : '',
    };
    rail.replaceChildren(
      el('ol', { class: 'aw-steps' }, ...steps().map(([id, label], i) => {
        const done = i < i0, on = i === i0;
        return el('li', { class: 'aw-step' + (done ? ' is-done' : '') + (on ? ' is-on' : ''), 'data-step': id },
          el('button', { disabled: !done, onClick: () => go(id) },
            el('i', { class: 'aw-dot' }, done ? icon('check', 9, 'currentColor', 3.2) : null),
            el('span', { class: 'aw-sl' }, label, done && said[id] ? el('small', {}, said[id]) : null)));
      })),
      el('p', { class: 'aw-note' }, w.path === 'live'
        ? 'Its balance moves with the trades you log on it, the withdrawals you take and any correction you make.'
        : 'Its balance, P&L and payouts come from the trades you log on it. You can change any of this later.'));
  }

  /* ---------- pieces the steps share ---------- */
  const lbl = (k, control, hint) => el('label', { class: 'ab-l' }, el('span', { class: 'ab-lk' }, k), control, hint ? el('span', { class: 'aw-hint' }, hint) : null);

  function nameField(onChange) {
    const sugg = el('div', { class: 'aw-sugg' });
    const input = el('input', { class: 'field ab-namein aw-bigname', value: w.name, maxLength: 40, placeholder: suggestions()[0] || 'Account name',
      'aria-label': 'Account name', autocomplete: 'off',
      onInput: e => { w.name = e.target.value; w.named = !!e.target.value.trim(); paintSugg(); onChange?.(); } });
    const paintSugg = () => sugg.replaceChildren(...suggestions().map(n => el('button', { class: 'aw-schip' + (n === w.name.trim() ? ' is-on' : ''), type: 'button',
      onClick: () => { w.name = n; w.named = true; input.value = n; paintSugg(); onChange?.(); input.dispatchEvent(new Event('input', { bubbles: true })); } }, n)));
    paintSugg();
    return { input, sugg, refresh: () => { if (!w.named) { guessName(); input.value = w.name; } input.placeholder = suggestions()[0] || 'Account name'; paintSugg(); } };
  }

  function otherField(kind, after) {
    return el('input', { class: 'field ab-othername', value: w.firmName, maxLength: 40, autocomplete: 'off',
      placeholder: kind === 'broker' ? 'Broker name' : 'Firm name', 'aria-label': kind === 'broker' ? 'Broker name' : 'Firm name',
      onInput: e => { w.firmName = e.target.value; guessName(); after?.(); } });
  }

  /* how the card will look on the Accounts page */
  function preview() {
    const box = el('div', { class: 'aw-preview' });
    const paintIt = () => {
      const f = firmOf(pseudo()), k = kindNow(), size = sizeN() > 0 ? sizeN() : 0, bal = balN();
      box.style.setProperty('--tint', f.tint);
      box.replaceChildren(el('div', { class: 'ab-top' },
        logoTile(store, pseudo(), 44),
        el('div', { class: 'ab-id' },
          el('div', { class: 'ab-firm' }, el('b', {}, f.name), el('span', { class: 'ab-badge is-' + k },
            k === 'funded' ? icon('shield', 11, 'currentColor', 2) : k === 'live' ? el('i', { class: 'ab-dot' }) : null, BADGE[k])),
          el('div', { class: 'ab-size' }, size ? `${cash(size)} account` : w.path === 'live' ? 'Starting balance to come' : 'Size to come'),
          el('span', { class: 'ab-chip' }, logoTile(store, pseudo(), 15, 'is-mini'), el('span', { class: 'ab-name' }, w.name.trim() || 'Account'))),
        el('div', { class: 'aw-pbal' }, el('span', { class: 'ab-k' }, 'Balance'), el('b', {}, size || bal ? cash(bal != null && bal > 0 ? bal : size) : '—'))));
    };
    paintIt();
    return { box: el('div', { class: 'aw-pv' }, el('span', { class: 'ab-lk' }, 'How it will look'), box), refresh: paintIt };
  }

  /* currency, risk, colour — and the day it opened, for a prop account */
  function more(withOpened) {
    const cur = el('select', { class: 'field', 'aria-label': 'Currency', onChange: e => { w.currency = e.target.value; } },
      ...CURRENCIES.map(x => el('option', { value: x, selected: x === w.currency }, x)));
    const risk = el('input', { class: 'field', inputmode: 'decimal', value: w.risk, 'aria-label': 'Risk a trade %', onInput: e => { w.risk = e.target.value; } });
    const opened = el('input', { class: 'field', type: 'date', value: w.opened, 'aria-label': 'Opened', onInput: e => { w.opened = e.target.value; } });
    const colours = el('div', { class: 'ab-colours' });
    const paintCol = () => colours.replaceChildren(...ACCOUNT_COLOURS.map(col => el('button', { type: 'button', class: 'ab-col' + (w.color === col ? ' is-on' : ''),
      style: { background: col }, 'aria-label': 'Colour', onClick: () => { w.color = col; paintCol(); } })));
    paintCol();
    return el('details', { class: 'aw-more' },
      el('summary', {}, icon('chevright', 11, 'currentColor', 2.4), 'More', el('span', {}, ` · ${w.currency}, ${w.risk}% a trade`)),
      el('div', { class: 'ab-3' }, lbl('Currency', cur), lbl('Risk a trade %', risk), withOpened ? lbl('Opened', opened) : null),
      lbl('Colour', colours));
  }

  /* ---------- the steps ---------- */
  const STEPS = {
    /* 1 · what kind of account */
    start: () => {
      const pick = (p, ic, name, blurb, firms) => el('button', { class: 'aw-pick', 'data-path': p, onClick: () => {
          if (w.path !== p) { w.firm = ''; w.firmName = ''; w.size = ''; w.market = null; w.named = false; w.name = ''; w.kind = 'eval'; }
          w.path = p; go(p === 'live' ? 'broker' : 'market');
        } },
        el('span', { class: 'aw-ico' }, icon(ic, 19, 'currentColor', 1.8)),
        el('b', {}, name), el('span', { class: 'aw-pblurb' }, blurb),
        el('span', { class: 'aw-stack' }, ...firms.map(f => logoTile(store, { firm: f.id }, 20, 'is-mini'))));
      return {
        body: [el('div', { class: 'aw-start' },
          pick('prop', 'building', 'Prop firm', 'An evaluation or a funded account — futures or CFD.', [...firmsIn('futures'), ...firmsIn('forex')]),
          pick('live', 'firms', 'Live', 'Your own money at a broker: its balance, withdrawals and growth.', firmsIn('broker')))],
        focus: '.aw-pick',
      };
    },

    /* prop · futures or CFD */
    market: () => ({
      title: 'Futures or CFD?', back: path ? null : () => go('start'),
      body: [
        el('div', { class: 'aw-q' }, el('b', {}, 'What does this account trade?'), el('span', {}, 'Pick the one it trades — the firms, and their rules, are different.')),
        el('div', { class: 'aw-markets' }, ...MARKETS.map(m => {
          const fs = firmsIn(m.id);
          return el('button', { class: 'aw-market' + (w.market === m.id ? ' is-on' : ''), 'data-market': m.id, onClick: () => {
              if (w.market !== m.id) { if (firm()) { w.firm = ''; w.size = ''; } w.q = ''; }
              w.market = m.id; guessName(); go('firm');
            } },
            el('span', { class: 'aw-stack' }, ...fs.map(f => logoTile(store, { firm: f.id }, 24, 'is-mini'))),
            el('b', { class: 'aw-mname' }, m.name),
            el('span', { class: 'aw-mblurb' }, m.blurb),
            el('span', { class: 'aw-mcount' }, `${fs.length} firm${fs.length === 1 ? '' : 's'}`));
        })),
      ],
      focus: '.aw-market.is-on, .aw-market',
    }),

    /* prop · which firm */
    firm: () => {
      const m = MARKETS.find(x => x.id === w.market) || MARKETS[0];
      const grid = el('div', { class: 'aw-firms' });
      const choose = (id, name = '') => {
        if (id !== w.firm) {
          const f = findFirm(id);
          if (f?.sizes && !f.sizes.includes(sizeN())) w.size = '';
          w.firm = id;
        }
        if (id === 'other' && name) w.firmName = name;
        if (id !== 'other') w.firmName = '';
        guessName(); go('plan');
      };
      const paintGrid = () => {
        const q = w.q.trim().toLowerCase();
        const list = firmsIn(m.id).filter(f => !q || `${f.name} ${f.full} ${f.short || ''}`.toLowerCase().includes(q));
        grid.replaceChildren(
          ...list.map(f => el('button', { class: 'aw-ftile' + (w.firm === f.id ? ' is-on' : ''), 'data-firm': f.id, style: { '--tint': f.tint }, onClick: () => choose(f.id) },
            logoTile(store, { firm: f.id }, 50), el('b', {}, f.name), el('span', {}, range(f)))),
          el('button', { class: 'aw-ftile is-other' + (w.firm === 'other' ? ' is-on' : ''), 'data-firm': 'other', onClick: () => choose('other', list.length ? '' : w.q.trim()) },
            el('span', { class: 'aw-plus' }, icon('plus', 18, 'currentColor', 2)),
            el('b', {}, list.length || !q ? 'Another firm' : `Add “${w.q.trim()}”`),
            el('span', {}, 'Type its name')));
      };
      paintGrid();
      const search = el('label', { class: 'aw-search' }, icon('search', 14, 'currentColor', 2),
        el('input', { value: w.q, placeholder: 'Search firms…', 'aria-label': 'Search firms', autocomplete: 'off',
          onInput: e => { w.q = e.target.value; paintGrid(); },
          onKeydown: e => { if (e.key === 'Enter') { const only = grid.querySelectorAll('.aw-ftile:not(.is-other)'); if (only.length === 1) only[0].click(); } } }));
      return {
        title: 'Choose a firm', back: () => go('market'),
        chip: el('span', { class: 'aw-chip' }, el('b', {}, m.name), el('button', { class: 'aw-change', onClick: () => go('market') }, 'Change')),
        body: [search, grid],
        focus: '.aw-ftile.is-on, .aw-search input',
      };
    },

    /* prop · evaluation or funded, and the size */
    plan: () => {
      const f = firm(), other = w.firm === 'other';
      const sizes = f?.sizes || COMMON_SIZES;
      const titleEl = el('b', { class: 'aw-title' });
      const setTitle = () => { titleEl.textContent = `${firmLike()?.name || 'Another firm'} · Pick a plan`; };
      setTitle();
      const ownIn = el('input', { class: 'field ab-sizein', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Account size', placeholder: '75 000',
        value: sizeN() > 0 && !sizes.includes(sizeN()) ? sizeN().toLocaleString('en-US') : '',
        onInput: e => { w.size = e.target.value.trim() === '' ? '' : String(c.parseNumber(e.target.value) ?? ''); guessName(); paintSizes(); } });
      const grid = el('div', { class: 'aw-sizes', style: { '--tint': (f || firmOf(pseudo())).tint } });
      const own = el('label', { class: 'aw-size is-own' }, el('i'), el('span', { class: 'aw-own-k' }, 'Another size'), ownIn);
      const paintSizes = () => {
        grid.querySelectorAll('.aw-size[data-size]').forEach(b => b.classList.toggle('is-on', Number(b.dataset.size) === sizeN()));
        own.classList.toggle('is-on', sizeN() > 0 && !sizes.includes(sizeN()));
      };
      grid.append(...sizes.map(n => el('button', { class: 'aw-size', 'data-size': n, onClick: () => { w.size = String(n); ownIn.value = ''; guessName(); go('name'); } },
        el('i'), el('b', {}, '$' + sizeShort(n)), el('span', {}, KIND_LABEL[w.kind]))), own);
      paintSizes();
      const kinds = el('div', { class: 'seg ab-kinds' }, ...[['eval', 'Evaluation'], ['funded', 'Funded']].map(([k, l]) =>
        el('button', { class: w.kind === k ? 'is-on' : '', 'data-kind': k, onClick: () => { if (w.kind !== k) { w.kind = k; guessName(); paint(); } } }, l)));
      const ready = () => sizeN() > 0 && (!other || !!w.firmName.trim());
      return {
        titleEl, back: () => go('firm'),
        body: [
          other ? lbl('Firm name', otherField('firm', setTitle)) : null,
          el('div', { class: 'aw-stage' }, el('span', { class: 'ab-lk' }, 'Stage'), kinds,
            el('span', { class: 'aw-hint' }, w.kind === 'eval' ? 'Still passing it.' : 'Passed, and paying out.')),
          el('span', { class: 'ab-lk' }, 'Account size'),
          grid,
        ],
        foot: { label: 'Continue', ready, go: () => go('name'),
          need: () => (other && !w.firmName.trim() ? 'Needs the firm’s name' : 'Pick a size, or type one'),
          where: () => (other && !w.firmName.trim() ? panel.querySelector('.ab-othername') : ownIn)?.focus() },
        focus: other && !w.firmName.trim() ? '.ab-othername' : '.aw-size.is-on, .aw-size',
      };
    },

    /* prop · its name, and its balance today */
    name: () => {
      const pv = preview();
      const nf = nameField(pv.refresh);
      guessName(); nf.refresh();
      const bal = el('input', { class: 'field aw-balin', inputmode: 'decimal', value: w.balance, autocomplete: 'off', 'aria-label': 'Current balance',
        placeholder: sizeN() > 0 ? sizeN().toLocaleString('en-US') : '', onInput: e => { w.balance = e.target.value; pv.refresh(); } });
      return {
        title: 'Name this account', back: () => go('plan'),
        body: [
          lbl('Account name', nf.input), nf.sugg,
          lbl('Current balance (optional)', bal, 'Already trading it? Type what the firm shows today — the difference is kept as a correction. Leave it empty for a new one.'),
          pv.box,
          more(true),
        ],
        foot: { label: 'Continue', ready: () => !!w.name.trim() && (w.balance.trim() === '' || balN() > 0), go: () => go('confirm'),
          need: () => (!w.name.trim() ? 'Needs a name' : 'That balance is not an amount'),
          where: () => (!w.name.trim() ? nf.input : bal).focus() },
        focus: '.ab-namein',
      };
    },

    /* live · which broker */
    broker: () => {
      const choose = id => {
        if (id !== w.firm) { w.firm = id; if (id !== 'other') w.firmName = ''; }
        guessName(); go('details');
      };
      return {
        title: 'Choose your broker', back: path ? null : () => go('start'),
        body: [el('div', { class: 'aw-brokers' },
          ...firmsIn('broker').map(f => el('button', { class: 'aw-btile' + (w.firm === f.id ? ' is-on' : ''), 'data-firm': f.id, onClick: () => choose(f.id) },
            logoTile(store, { firm: f.id }, 34), el('span', {}, el('b', {}, f.name), el('small', {}, f.trades || '')))),
          el('button', { class: 'aw-btile is-other' + (w.firm === 'other' ? ' is-on' : ''), 'data-firm': 'other', onClick: () => choose('other') },
            el('span', { class: 'aw-plus is-small' }, icon('plus', 14, 'currentColor', 2.2)), el('span', {}, el('b', {}, 'Other'), el('small', {}, 'Type your broker'))))],
        focus: '.aw-btile.is-on, .aw-btile',
      };
    },

    /* live · name, starting balance, the day it starts */
    details: () => {
      const other = w.firm === 'other';
      const pv = preview();
      const nf = nameField(pv.refresh);
      guessName(); nf.refresh();
      const size = el('input', { class: 'field ab-sizein', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Starting balance', placeholder: '5 000',
        value: sizeN() > 0 ? sizeN().toLocaleString('en-US') : '',
        onInput: e => { w.size = e.target.value.trim() === '' ? '' : String(c.parseNumber(e.target.value) ?? ''); pv.refresh(); } });
      const opened = el('input', { class: 'field', type: 'date', value: w.opened, 'aria-label': 'Journaling from', onInput: e => { w.opened = e.target.value; } });
      const ready = () => (!other || !!w.firmName.trim()) && !!w.name.trim() && sizeN() > 0;
      return {
        title: 'Account details', back: () => go('broker'),
        body: [
          other ? lbl('Broker name', otherField('broker', () => { nf.refresh(); pv.refresh(); })) : null,
          lbl('Name', nf.input), nf.sugg,
          el('div', { class: 'ab-2' }, lbl('Starting balance', size), lbl('Journaling from', opened)),
          el('span', { class: 'aw-hint' }, 'What was in the account that day. Withdrawals and balance corrections go on its card later.'),
          pv.box,
          more(false),
        ],
        foot: { label: 'Continue', ready, go: () => go('confirm'),
          need: () => (other && !w.firmName.trim() ? 'Needs the broker’s name' : !w.name.trim() ? 'Needs a name' : 'Needs a starting balance'),
          where: () => (other && !w.firmName.trim() ? panel.querySelector('.ab-othername') : !w.name.trim() ? nf.input : size).focus() },
        focus: other && !w.firmName.trim() ? '.ab-othername' : '.ab-sizein',
      };
    },

    /* a last look */
    confirm: () => {
      const f = firmLike() || firmOf(pseudo()), k = kindNow(), live = w.path === 'live', bal = balN();
      const rows = [
        ['Account type', KIND_LABEL[k]],
        [live ? 'Broker' : 'Firm', f.name],
        !live && w.market ? ['Trades', MARKETS.find(m => m.id === w.market).name] : null,
        [live ? 'Starting balance' : 'Account size', cash(sizeN())],
        !live && bal > 0 && Math.abs(bal - sizeN()) > 0.004 ? ['Balance today', `${cash(bal)} (${c.money(bal - sizeN(), { currency: w.currency, decimals: 0 })})`] : null,
        ['Currency', w.currency],
        ['Risk a trade', `${c.parseNumber(w.risk) ?? 1}%`],
        [live ? 'Journaling from' : 'Opened', c.longDate(w.opened)],
      ].filter(Boolean);
      return {
        title: 'Confirm', back: () => go(live ? 'details' : 'name'),
        body: [
          el('div', { class: 'aw-sum', style: { '--tint': firmOf(pseudo()).tint } }, logoTile(store, pseudo(), 46),
            el('div', {}, el('b', {}, w.name.trim()), el('span', {}, `${f.name} · ${KIND_LABEL[k]} · $${sizeShort(sizeN())}`))),
          el('dl', { class: 'aw-dl' }, ...rows.map(([a, b]) => el('div', {}, el('dt', {}, a), el('dd', {}, b)))),
          logoRow(store, nav, pseudo(), paint),
        ],
        foot: { label: 'Create account', ready: () => true, need: () => '', go: create },
        focus: '.ab-go',
      };
    },
  };

  async function create() {
    const made = await store.addAccount({
      kind: kindNow(), firm: w.firm || undefined, firmName: w.firm === 'other' ? w.firmName.trim() : undefined,
      name: w.name.trim(), startingBalance: sizeN(), currency: w.currency, defaultRiskPercent: c.parseNumber(w.risk) ?? 1,
      color: w.color, weeklyTargetPercent: 0, openedAt: w.opened,
    });
    const bal = balN();
    if (w.path === 'prop' && bal > 0) await store.setBalance(made.id, bal);
    s.close();
    toast('Created ' + made.name);
    nav.refresh();
  }

  paint();
  return s;
}
