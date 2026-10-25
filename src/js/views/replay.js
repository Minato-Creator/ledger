/* ============================================================
   replay.js (view) — the Replay page.

   Replay is its own world: its sessions, trades, drawings and prices live
   here and never reach the journal, the review or the analytics.

   Home: the tiles, then the groups (folding) and their sessions — each with
   where it is, its progress, Analytics, Continue and ⋯ (Rename, Move to
   group, Duplicate, Delete). + New session, + New group, Settings (what a
   new session starts with), Data (the prices, on #/replay/data: two years
   of OANDA one-minute candles per pair, saved in the vault by
   replaydata.js). A session opens full screen (replaysession.js) at
   #/replay/session/<id>; analytics (replayanalytics.js) at
   #/replay/analytics/<id> and #/replay/group/<id>.
   ============================================================ */
import { el, toast, confirmButton } from '../ui.js';
import { getKey, oandaInstrument } from '../candles.js';
import * as rd from '../replaydata.js';
import * as rss from '../replaysessions.js';
import { openMenu } from '../chart/menu.js';
import { syncSession, whenText } from './replaysession.js';
import { replayAnalytics } from './replayanalytics.js';

/* The pairs Minato trades, offered first; any OANDA instrument can be added. */
const SUGGEST = ['XAU_USD', 'NAS100_USD', 'AUD_USD', 'USD_JPY', 'EUR_USD', 'NZD_USD', 'GBP_USD'];
import { pairName } from '../replaysessions.js';
export { pairName };
const money = v => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* downloads in progress survive a re-render: inst → { done, total, month, ctrl, error } */
const jobs = new Map();
let keyState = null;            // null = not asked yet, false = none, true = there
let ix = null;

const mb = b => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = m => `${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;

export function replay(store, nav) {
  if (!ix || keyState === null) {
    Promise.all([rd.readIndex(), getKey()]).then(([i, k]) => { ix = i; keyState = !!k; nav.refresh(); });
  }
  const [, , sub, arg] = (location.hash || '').split('/');
  syncSession(store, nav);
  if (sub === 'data') return dataPage(nav);
  if (sub === 'analytics' || sub === 'group') return replayAnalytics(store, nav, sub, arg);
  return home(store, nav);
}

/* ---------- Replay home ---------- */
const MON3 = MON;
const dayText = T => { const d = new Date(T * 1000); return `${d.getDate()} ${MON3[d.getMonth()]} ${d.getFullYear()}`; };
const ago = iso => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const rText = r => `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}R`;

function home(store, nav) {
  const view = el('div', { class: 'view rp' });
  const sessions = rss.sessionsOf(store), groups = rss.groupsOf(store);
  const pairs = ix ? Object.keys(ix.pairs).filter(k => Object.keys(ix.pairs[k].months || {}).length) : [];
  const bytes = ix ? pairs.reduce((a, p) => a + rd.pairStatus(ix, p).bytes, 0) : 0;
  const head = el('header', { class: 'head' },
    el('h1', {}, 'Replay'),
    el('span', { class: 'sub' }, 'practice on past prices · nothing here touches your journal'),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-quiet rp-data-btn', onClick: () => nav.go('#/replay/data') },
      `Data · ${pairs.length} pair${pairs.length === 1 ? '' : 's'}${bytes ? ' · ' + mb(bytes) : ''}`),
    el('button', { class: 'btn btn-quiet rp-settings-btn', onClick: () => settingsDialog(store, nav) }, 'Settings'),
    el('button', { class: 'btn btn-quiet rp-new-group', onClick: () => nameDialog({ title: 'New group', ok: 'Create', placeholder: 'e.g. London sweeps',
      done: async name => { await rss.createGroup(store, name); nav.refresh(); } }) }, '+ New group'),
    el('button', { class: 'btn btn-light rp-new-session', onClick: () => newSessionDialog(store, nav, pairs) }, '+ New session'));
  view.append(head);
  const body = el('div', { class: 'rp-body' });
  view.append(body);

  /* the tiles */
  const all = rss.statsOf(sessions);
  const last = [...sessions].filter(x => x.opened).sort((a, b) => Date.parse(b.opened) - Date.parse(a.opened))[0];
  const tile = (k, v, cls, small) => el('div', { class: 'card rp-tile ' + cls }, el('span', { class: 'rp-k' }, k), el('b', { class: 'rp-tv' }, v), small ? el('span', { class: 'rp-ts' }, small) : null);
  body.append(el('div', { class: 'rp-tiles' },
    tile('Sessions', String(sessions.length), 'rp-t-sessions', `${groups.length} group${groups.length === 1 ? '' : 's'}`),
    tile('Trades', String(all.trades), 'rp-t-trades'),
    tile('Total', all.trades ? rText(all.r) : '—', 'rp-t-total', !all.trades ? '' : all.sameBalance ? money(all.usd) : 'in R — balances differ'),
    tile('Win rate', all.winRate == null ? '—' : `${Math.round(all.winRate * 100)}%`, 'rp-t-win', all.trades ? `${all.won} won · ${all.lost} lost` : ''),
    tile('Last opened', last ? last.name : '—', 'rp-t-last', last ? ago(last.opened) : ''),
    el('button', { class: 'card rp-tile rp-continue', disabled: !last, onClick: () => last && nav.go('#/replay/session/' + last.id) },
      el('span', { class: 'rp-k' }, 'Continue'), el('b', { class: 'rp-tv' }, '▶'), el('span', { class: 'rp-ts' }, last ? last.name : 'no session yet'))));

  if (!sessions.length && !groups.length) {
    body.append(el('section', { class: 'card rp-emptycard' },
      el('h2', {}, 'No sessions yet'),
      el('p', { class: 'rp-empty' }, pairs.length
        ? 'A session is one pair over a period you choose. Make one and the chart opens at its start, ready to play.'
        : 'Download a pair first — a session plays only prices saved in your vault.'),
      pairs.length ? el('button', { class: 'btn btn-light rp-new-session', onClick: () => newSessionDialog(store, nav, pairs) }, '+ New session')
        : el('button', { class: 'btn btn-light', onClick: () => nav.go('#/replay/data') }, 'Open Data')));
    return view;
  }
  for (const g of groups) body.append(groupCard(store, nav, g, sessions.filter(x => x.groupId === g.id)));
  const loose = sessions.filter(x => !x.groupId);
  if (loose.length) body.append(groupCard(store, nav, null, loose));
  return view;
}

function groupCard(store, nav, g, list) {
  const st = rss.statsOf(list);
  const card = el('section', { class: 'card rp-group' + (g?.collapsed ? ' is-shut' : ''), 'data-group': g ? g.id : 'none' });
  const toggle = el('button', { class: 'rp-gtoggle', title: g?.collapsed ? 'Show' : 'Hide', disabled: !g,
    onClick: async () => { await rss.updateGroup(store, g.id, { collapsed: !g.collapsed }); nav.refresh(); } }, el('i', { class: 'rp-chev' }));
  card.append(el('div', { class: 'rp-ghead' }, toggle,
    el('h2', {}, g ? g.name : 'No group'),
    el('span', { class: 'rp-gsub' }, `${list.length} session${list.length === 1 ? '' : 's'} · ${st.trades} trade${st.trades === 1 ? '' : 's'}${st.trades ? ' · ' + rText(st.r) + (st.sameBalance ? ' · ' + money(st.usd) : ' · ' + `${st.pct >= 0 ? '+' : '−'}${Math.abs(st.pct).toFixed(2)}%`) : ''}`),
    el('div', { class: 'spacer' }),
    g ? el('button', { class: 'btn btn-quiet rp-ganalytics', onClick: () => nav.go('#/replay/group/' + g.id) }, 'Group analytics') : null,
    g ? el('button', { class: 'rp-more rp-gmore', title: 'More', onClick: e => groupMenu(store, nav, g, list, e.currentTarget) }, '⋯') : null));
  if (g?.collapsed) return card;
  if (!list.length) { card.append(el('p', { class: 'rp-empty rp-gempty' }, 'No sessions in this group yet — move one here from its ⋯ menu.')); return card; }
  card.append(el('div', { class: 'rp-srow is-head' }, ...['Session', 'Pair', 'Period', 'Progress', 'Trades', 'Win rate', 'Total', ''].map(h => el('span', {}, h))));
  for (const x of list) card.append(sessionRow(store, nav, x));
  return card;
}

function sessionRow(store, nav, x) {
  const st = rss.statsOf([x]);
  const pct = Math.round(rss.progressOf(x) * 100);
  const label = x.finished ? 'Open' : x.opened ? 'Continue' : 'Open';
  return el('div', { class: 'rp-srow', 'data-session': x.id },
    el('div', { class: 'rp-sname' }, el('b', {}, x.name), el('span', {}, x.finished ? 'finished' : x.opened ? whenText(x.at) : 'not started')),
    el('span', { class: 'rp-pair' }, pairName(x.inst)),
    el('span', { class: 'rp-period' }, `${dayText(x.from)} – ${dayText(x.to)}`),
    el('div', { class: 'rp-progress', title: `${pct}% of the period` }, el('i', {}, el('b', { style: { width: pct + '%' } })), el('span', {}, pct + '%')),
    el('span', {}, String(st.trades)),
    el('span', {}, st.winRate == null ? '—' : `${Math.round(st.winRate * 100)}%`),
    el('span', { class: st.r > 0 ? 'is-up' : st.r < 0 ? 'is-down' : '' }, st.trades ? rText(st.r) : '—'),
    el('div', { class: 'rp-sacts' },
      el('button', { class: 'btn btn-quiet rp-sanalytics', onClick: () => nav.go('#/replay/analytics/' + x.id) }, 'Analytics'),
      el('button', { class: 'btn btn-light rp-open', onClick: () => nav.go('#/replay/session/' + x.id) }, (label === 'Continue' ? '▶ ' : '') + label),
      el('button', { class: 'rp-more rp-smore', title: 'More', onClick: e => sessionMenu(store, nav, x, e.currentTarget) }, '⋯')));
}

function sessionMenu(store, nav, x, anchor) {
  const r = anchor.getBoundingClientRect();
  openMenu([
    { label: 'Rename', cls: 'rp-m-rename', act: () => nameDialog({ title: 'Rename session', ok: 'Save', value: x.name, done: async name => { await rss.updateSession(store, x.id, { name }); nav.refresh(); } }) },
    { label: 'Move to group ›', cls: 'rp-m-move', keep: true, act: () => {
      openMenu([{ head: 'Move to' }, { label: 'No group', checked: !x.groupId, cls: 'rp-m-to-none', act: async () => { await rss.updateSession(store, x.id, { groupId: null }); nav.refresh(); } },
        ...rss.groupsOf(store).map(g => ({ label: g.name, checked: x.groupId === g.id, cls: 'rp-m-to', act: async () => { await rss.updateSession(store, x.id, { groupId: g.id }); nav.refresh(); } }))], r.right - 220, r.bottom + 4);
    } },
    { label: 'Duplicate', cls: 'rp-m-dup', act: async () => { await rss.duplicateSession(store, x.id); toast(`“${x.name}” copied — starting from the beginning`); nav.refresh(); } },
    { sep: true },
    { label: 'Delete session…', cls: 'rp-m-delete', act: () => askDialog({ title: `Delete “${x.name}”?`, text: 'Its trades and drawings go with it. This cannot be undone.',
      buttons: [['Cancel', null], ['Delete session', async () => { await rss.deleteSession(store, x.id); toast('Session deleted'); nav.refresh(); }, 'is-danger']] }) },
  ], r.right - 220, r.bottom + 4);
}
function groupMenu(store, nav, g, list, anchor) {
  const r = anchor.getBoundingClientRect();
  openMenu([
    { label: 'Rename', cls: 'rp-m-grename', act: () => nameDialog({ title: 'Rename group', ok: 'Save', value: g.name, done: async name => { await rss.updateGroup(store, g.id, { name }); nav.refresh(); } }) },
    { sep: true },
    { label: 'Delete group…', cls: 'rp-m-gdelete', act: () => askDialog(list.length
      ? { title: `Delete “${g.name}”?`, text: `It has ${list.length} session${list.length === 1 ? '' : 's'} in it. Delete them too, or move them out to No group first?`,
          buttons: [['Cancel', null], ['Move the sessions out', async () => { await rss.deleteGroup(store, g.id, 'move'); toast('Group deleted — its sessions are under No group'); nav.refresh(); }, 'rp-g-move'],
            ['Delete everything inside', async () => { await rss.deleteGroup(store, g.id, 'all'); toast('Group and its sessions deleted'); nav.refresh(); }, 'is-danger rp-g-all']] }
      : { title: `Delete “${g.name}”?`, text: 'There are no sessions in it.', buttons: [['Cancel', null], ['Delete group', async () => { await rss.deleteGroup(store, g.id); nav.refresh(); }, 'is-danger rp-g-all']] }) },
  ], r.right - 220, r.bottom + 4);
}

/* ---------- small dialogs, in Quire's own design ---------- */
function modal(title, ...content) {
  const card = el('div', { class: 'card rp-modal', role: 'dialog', 'aria-label': title }, el('h2', {}, title), ...content);
  const wrap = el('div', { class: 'rp-modal-wrap', onPointerdown: e => { if (e.target === wrap) close(); } }, card);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', esc, true); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', esc, true);
  document.body.append(wrap);
  return { card, close };
}
function nameDialog({ title, ok, value = '', placeholder = '', done }) {
  const input = el('input', { class: 'field rp-name-in', value, placeholder, maxlength: 60 });
  const go = async () => { const v = input.value.trim(); if (!v) return input.focus(); m.close(); await done(v); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  const m = modal(title, input, el('div', { class: 'rp-modal-row' },
    el('button', { class: 'btn btn-quiet', onClick: () => m.close() }, 'Cancel'), el('button', { class: 'btn btn-light rp-name-ok', onClick: go }, ok)));
  input.focus(); input.select();
}
function askDialog({ title, text, buttons }) {
  const m = modal(title, el('p', { class: 'rp-empty' }, text), el('div', { class: 'rp-modal-row' },
    ...buttons.map(([label, act, cls = '']) => el('button', { class: 'btn ' + (act ? 'btn-light ' : 'btn-quiet ') + cls, onClick: async () => { m.close(); await act?.(); } }, label))));
}
const field = (label, ...control) => el('label', { class: 'rp-f' }, el('span', { class: 'lbl' }, label), ...control);
const riskSeg = (mode, set) => {
  const seg = el('div', { class: 'seg rp-mode' });
  const paint = v => seg.replaceChildren(...['%', '$'].map(k => el('button', { type: 'button', class: k === v ? 'is-on' : '', 'data-v': k, onClick: () => { set(k); paint(k); } }, k)));
  paint(mode);
  return seg;
};
function settingsDialog(store, nav) {
  const st = rss.settingsOf(store);
  let mode = st.riskMode;
  const bal = el('input', { class: 'field rp-set-balance', type: 'number', min: 1, value: st.balance });
  const risk = el('input', { class: 'field rp-set-risk', type: 'number', min: 0, step: 'any', value: st.risk });
  const m = modal('Replay settings',
    el('p', { class: 'rp-empty' }, 'What a new session starts with. Each session keeps its own once made.'),
    field('Account balance ($)', bal), field('Risk a trade', el('div', { class: 'rp-inline' }, risk, riskSeg(mode, v => { mode = v; }))),
    el('div', { class: 'rp-modal-row' }, el('button', { class: 'btn btn-quiet', onClick: () => m.close() }, 'Cancel'),
      el('button', { class: 'btn btn-light rp-set-ok', onClick: async () => {
        const b = +bal.value, r = +risk.value;
        if (!(b > 0) || !(r > 0)) return toast('A balance and a risk above nothing, please', 'bad');
        store.data.replay.settings = { balance: b, risk: r, riskMode: mode };
        await store.save('replay'); m.close(); toast('Replay settings saved'); nav.refresh();
      } }, 'Save')));
}
const dateIn = T => { const d = new Date(T * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fromDateIn = (v, end) => { const t = Date.parse(v + (end ? 'T23:59:00' : 'T00:00:00')); return Number.isFinite(t) ? t / 1000 : NaN; };
function newSessionDialog(store, nav, pairs) {
  if (!pairs.length) { toast('Download a pair first — Replay → Data'); return nav.go('#/replay/data'); }
  const st = rss.settingsOf(store);
  let mode = st.riskMode;
  const range = inst => { const s = rd.pairStatus(ix, inst); return { from: rd.monthStart(s.from), to: Math.min(rd.monthEnd(s.to), Date.now() / 1000) - 60 }; };
  const name = el('input', { class: 'field rp-ns-name', placeholder: 'e.g. London sweeps — March', maxlength: 60 });
  const pair = el('select', { class: 'field rp-ns-pair' }, ...pairs.sort().map(p => el('option', { value: p }, pairName(p))));
  const from = el('input', { class: 'field rp-ns-from', type: 'date' }), to = el('input', { class: 'field rp-ns-to', type: 'date' });
  const lastMonth = () => { const r = range(pair.value), d = new Date(r.to * 1000); const a = new Date(d.getFullYear(), d.getMonth() - 1, 1); const z = new Date(d.getFullYear(), d.getMonth(), 0);
    from.min = to.min = dateIn(r.from); from.max = to.max = dateIn(r.to);
    from.value = dateIn(Math.max(r.from, a / 1000)); to.value = dateIn(Math.min(r.to, z / 1000 + 86399)); };
  pair.addEventListener('change', lastMonth);
  lastMonth();
  const groups = rss.groupsOf(store);
  const grp = el('select', { class: 'field rp-ns-group' }, el('option', { value: '' }, 'No group'), ...groups.map(g => el('option', { value: g.id }, g.name)));
  const bal = el('input', { class: 'field rp-ns-balance', type: 'number', min: 1, value: st.balance });
  const risk = el('input', { class: 'field rp-ns-risk', type: 'number', min: 0, step: 'any', value: st.risk });
  const note = el('p', { class: 'rp-empty rp-ns-note' });
  const m = modal('New session',
    field('Name', name), el('div', { class: 'rp-2' }, field('Pair', pair), field('Group', grp)),
    el('div', { class: 'rp-2' }, field('From', from), field('To', to)),
    el('div', { class: 'rp-2' }, field('Account balance ($)', bal), field('Risk a trade', el('div', { class: 'rp-inline' }, risk, riskSeg(mode, v => { mode = v; })))),
    note,
    el('div', { class: 'rp-modal-row' }, el('button', { class: 'btn btn-quiet', onClick: () => m.close() }, 'Cancel'),
      el('button', { class: 'btn btn-light rp-ns-ok', onClick: async () => {
        const f = fromDateIn(from.value), t = fromDateIn(to.value, true), r = range(pair.value);
        if (!Number.isFinite(f) || !Number.isFinite(t) || t <= f) { note.textContent = 'The period has to end after it starts.'; return; }
        if (f < r.from || t > r.to + 86400) { note.textContent = `${pairName(pair.value)} prices are saved from ${dayText(r.from)} to ${dayText(r.to)} — pick a period inside that.`; return; }
        if (!(+bal.value > 0) || !(+risk.value > 0)) { note.textContent = 'A balance and a risk above nothing, please.'; return; }
        m.close();
        const s = await rss.createSession(store, { name: name.value.trim() || `${pairName(pair.value)} · ${dayText(f)}`, inst: pair.value, from: f, to: Math.min(t, r.to),
          groupId: grp.value || null, balance: +bal.value, risk: +risk.value, riskMode: mode });
        nav.go('#/replay/session/' + s.id);
      } }, 'Create and open')));
  name.focus();
}

/* ---------- Data ---------- */
function dataPage(nav) {
  const view = el('div', { class: 'view rp' });
  view.append(el('header', { class: 'head' },
    el('button', { class: 'btn btn-quiet rp-back', onClick: () => nav.go('#/replay') }, '‹ Replay'),
    el('h1', {}, 'Data'),
    el('span', { class: 'sub' }, 'the prices Replay plays, saved in your vault'),
    el('div', { class: 'spacer' })));
  view.append(el('div', { class: 'rp-body' }, dataCard(nav)));
  return view;
}

function dataCard(nav) {
  const card = el('section', { class: 'card rp-data' });
  const pairs = ix ? Object.keys(ix.pairs).sort((a, b) => pairName(a).localeCompare(pairName(b))) : [];
  for (const inst of jobs.keys()) if (!pairs.includes(inst)) pairs.push(inst);
  const total = ix ? pairs.reduce((a, p) => a + rd.pairStatus(ix, p).bytes, 0) : 0;

  card.append(el('div', { class: 'rp-data-h' },
    el('h2', {}, 'Price data'),
    el('span', { class: 'rp-sub' }, `${rd.historyOf(ix)} years of OANDA one-minute prices per pair · ${pairs.length ? `${pairs.length} pair${pairs.length === 1 ? '' : 's'} · ${mb(total)}` : 'none yet'}`)));

  /* how far back: two years unless more is wanted (the Lab's quant tests want more) */
  const yrs = rd.historyOf(ix);
  card.append(el('div', { class: 'rp-hist' },
    el('span', { class: 'rp-k' }, 'History'),
    el('div', { class: 'seg rp-years' }, ...rd.HISTORY.map(y => el('button', { type: 'button', class: y === yrs ? 'is-on' : '', 'data-years': y,
      onClick: async () => { if (y === yrs) return; ix = await rd.setHistory(y); nav.refresh(); } }, `${y} years`))),
    el('span', { class: 'rp-sub' }, yrs > 2 ? `older months show as missing — press Update on a pair to get them (about ${2 * yrs} MB a pair)` : 'more history: more to test a strategy on')));

  if (keyState === false) {
    card.append(el('div', { class: 'rp-nokey' },
      el('span', {}, 'Add your OANDA key in Settings — the prices come from OANDA.'),
      el('button', { class: 'btn btn-quiet', onClick: () => nav.go('#/settings/charts') }, 'Open Settings')));
  }

  if (pairs.length) {
    card.append(el('div', { class: 'rp-row is-head' },
      ...['Pair', 'Months', 'From – to', 'Size', ''].map(h => el('span', {}, h))));
    for (const inst of pairs) card.append(pairRow(inst, nav));
  }

  /* add a pair: the usual ones as chips, anything else typed */
  const have = new Set(pairs);
  const input = el('input', { class: 'field rp-add-in', placeholder: 'Any pair — e.g. GBPJPY', 'aria-label': 'Add a pair',
    onKeydown: e => { if (e.key === 'Enter') add(input.value); } });
  function add(text) {
    const inst = /^[A-Z0-9]+_[A-Z0-9]+$/.test(text) ? text : oandaInstrument(text);   // a chip hands over OANDA's own name
    if (!inst) return toast('OANDA has no instrument by that name', 'bad');
    if (have.has(inst) && !jobs.get(inst)?.error) return toast(`${pairName(inst)} is already here`);
    start(inst, nav);
  }
  card.append(el('div', { class: 'rp-add' },
    el('span', { class: 'rp-k' }, 'Add'),
    ...SUGGEST.filter(s => !have.has(s)).map(s => el('button', { class: 'chip rp-chip', 'data-inst': s, disabled: keyState === false, onClick: () => add(s) }, pairName(s))),
    input,
    el('button', { class: 'btn btn-quiet', disabled: keyState === false, onClick: () => add(input.value) }, 'Download')));
  card.append(el('p', { class: 'rp-foot' }, 'Kept in your vault under replay/prices — about 2 MB a pair a year. A month is saved once; this month is brought up to date when you ask.'));
  return card;
}

function pairRow(inst, nav) {
  const st = rd.pairStatus(ix || { pairs: {} }, inst);
  const job = jobs.get(inst);
  const busy = job && !job.error && !job.finished;
  const cells = [
    el('span', { class: 'rp-pair' }, pairName(inst)),
    el('span', { class: 'rp-months' }, `${st.done} of ${st.want.length}`),
    el('span', {}, st.from ? `${monthName(st.from)} – ${monthName(st.to)}` : '—'),
    el('span', {}, st.bytes ? mb(st.bytes) : '—'),
  ];
  let right;
  if (busy) {
    right = el('div', { class: 'rp-prog' },
      el('i', {}, el('b', { style: { width: (job.total ? job.done / job.total * 100 : 0) + '%' } })),
      el('span', {}, job.total ? `${job.done} of ${job.total} months` : 'starting…'),
      el('button', { class: 'btn btn-quiet', onClick: () => job.ctrl.abort() }, 'Stop'));
  } else {
    const upToDate = !st.missing.length && !st.stale && st.done === st.want.length;
    right = el('div', { class: 'rp-acts' },
      job?.error ? el('span', { class: 'rp-err' }, job.error) : el('span', { class: 'rp-ok' + (upToDate ? ' is-done' : '') },
        upToDate ? 'Up to date' : st.missing.length ? `${st.missing.length} month${st.missing.length === 1 ? '' : 's'} to get` : 'This month to update'),
      upToDate ? null : el('button', { class: 'btn btn-quiet rp-get', disabled: keyState === false, onClick: () => start(inst, nav) }, st.done ? 'Update' : 'Download'),
      confirmButton({ label: 'Remove', armedLabel: 'Remove prices', className: 'btn btn-quiet rp-del',
        onConfirm: async () => { await rd.removePair(inst); jobs.delete(inst); ix = await rd.readIndex(); toast(`${pairName(inst)} prices removed`); nav.refresh(); } }));
  }
  return el('div', { class: 'rp-row', 'data-inst': inst }, ...cells, right);
}

/* A download runs on while you look at other pages: only the Data page is drawn again as it goes —
   redrawing whatever page is open after every month would replay its animations and stall it. */
const onData = () => /^#\/replay\/data/.test(location.hash);
const refreshData = nav => { if (onData()) nav.refresh(); };

async function start(inst, nav) {
  const cred = await getKey();
  if (!cred) { keyState = false; return nav.refresh(); }
  const prev = jobs.get(inst);
  if (prev && !prev.error && !prev.finished) return;
  const job = { done: 0, total: 0, ctrl: new AbortController() };
  jobs.set(inst, job);
  nav.refresh();
  try {
    const n = await rd.downloadPair(inst, cred, { signal: job.ctrl.signal,
      onProgress: p => { job.done = p.done; job.total = p.total; job.month = p.month; rd.readIndex().then(i => { ix = i; refreshData(nav); }); } });
    job.finished = true;
    toast(n ? `${pairName(inst)} — ${n} month${n === 1 ? '' : 's'} saved` : `${pairName(inst)} is up to date`);
  } catch (e) {
    if (e?.name === 'AbortError') { job.finished = true; toast(`${pairName(inst)} stopped — what was saved is kept`); }
    else job.error = rd.explain(e);
  }
  ix = await rd.readIndex();
  refreshData(nav);
}
