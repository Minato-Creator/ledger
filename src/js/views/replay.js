/* ============================================================
   replay.js (view) — the Replay page.

   Replay is its own world: its sessions, trades, drawings and prices live
   here and never reach the journal, the review or the analytics.

   This first part is the prices. Two years of OANDA one-minute candles per
   pair, downloaded once into the vault (replaydata.js) so a session plays
   back without going online. Sessions and groups come next.
   ============================================================ */
import { el, toast, confirmButton } from '../ui.js';
import { getKey, oandaInstrument } from '../candles.js';
import * as rd from '../replaydata.js';

/* The pairs Minato trades, offered first; any OANDA instrument can be added. */
const SUGGEST = ['XAU_USD', 'NAS100_USD', 'AUD_USD', 'USD_JPY', 'EUR_USD', 'NZD_USD', 'GBP_USD'];
export const pairName = inst => (inst === 'NAS100_USD' ? 'NAS100' : String(inst).replace('_', ''));

/* downloads in progress survive a re-render: inst → { done, total, month, ctrl, error } */
const jobs = new Map();
let keyState = null;            // null = not asked yet, false = none, true = there
let ix = null;

const mb = b => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = m => `${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;

export function replay(store, nav) {
  const view = el('div', { class: 'view rp' });
  if (!ix || keyState === null) {
    Promise.all([rd.readIndex(), getKey()]).then(([i, k]) => { ix = i; keyState = !!k; nav.refresh(); });
  }
  const head = el('header', { class: 'head' },
    el('h1', {}, 'Replay'),
    el('span', { class: 'sub' }, 'practice on past prices · nothing here touches your journal'),
    el('div', { class: 'spacer' }));
  view.append(head, el('div', { class: 'rp-body' }, dataCard(nav), sessionsCard()));
  return view;
}

function sessionsCard() {
  return el('section', { class: 'card rp-sessions' },
    el('h2', {}, 'Sessions'),
    el('p', { class: 'rp-empty' }, 'Sessions and groups arrive in the next update. Download the pairs you want to practise first — a session plays only what is saved here.'));
}

function dataCard(nav) {
  const card = el('section', { class: 'card rp-data' });
  const pairs = ix ? Object.keys(ix.pairs).sort((a, b) => pairName(a).localeCompare(pairName(b))) : [];
  for (const inst of jobs.keys()) if (!pairs.includes(inst)) pairs.push(inst);
  const total = ix ? pairs.reduce((a, p) => a + rd.pairStatus(ix, p).bytes, 0) : 0;

  card.append(el('div', { class: 'rp-data-h' },
    el('h2', {}, 'Price data'),
    el('span', { class: 'rp-sub' }, `two years of OANDA one-minute prices per pair · ${pairs.length ? `${pairs.length} pair${pairs.length === 1 ? '' : 's'} · ${mb(total)}` : 'none yet'}`)));

  if (keyState === false) {
    card.append(el('div', { class: 'rp-nokey' },
      el('span', {}, 'Add your OANDA key in Settings — the prices come from OANDA.'),
      el('button', { class: 'btn btn-quiet', onClick: () => nav.go('#/settings') }, 'Open Settings')));
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
  card.append(el('p', { class: 'rp-foot' }, 'Kept in your vault under replay/prices — about 4 MB a pair. A month is saved once; this month is brought up to date when you ask.'));
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
      onProgress: p => { job.done = p.done; job.total = p.total; job.month = p.month; rd.readIndex().then(i => { ix = i; nav.refresh(); }); } });
    job.finished = true;
    toast(n ? `${pairName(inst)} — ${n} month${n === 1 ? '' : 's'} saved` : `${pairName(inst)} is up to date`);
  } catch (e) {
    if (e?.name === 'AbortError') { job.finished = true; toast(`${pairName(inst)} stopped — what was saved is kept`); }
    else job.error = rd.explain(e);
  }
  ix = await rd.readIndex();
  nav.refresh();
}
