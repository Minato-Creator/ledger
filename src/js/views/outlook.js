/* ============================================================
   outlook.js — the morning's top-down, before the first trade.

   One entry per day. Inside it, a block per instrument: a bias, what you
   wrote, and one chart. Blocks are added as you need them — most mornings
   are one or two instruments, some are five.

   Two decisions worth knowing about:

   • It saves itself. Everywhere else in Quire a field commits when you leave
     it, and an outlook is the one thing in the app you write at length, with
     a chart open beside it and a session about to start. A Save button you
     can forget to press is a morning's thinking lost. Typing saves a moment
     after you stop; a chart saves the instant it lands.

   • Under each block, once the day is done, sits what you actually did on
     that instrument. Quire already knows the plan and the trades; putting
     them beside each other is the whole reason to write an outlook down. It
     appears only when there are trades to show, so a blank morning page
     stays blank.
   ============================================================ */
import { el, icon, toast, folderMark, confirmButton, lightbox } from '../ui.js';
import { pairMark, instrumentOf } from '../flags.js';
import * as c from '../calc.js';
import { cleanSymbol } from '../calc.js';
import { outlookShotsOf } from '../store.js';
import { tradeChart } from './tradechart.js';
import { isRedFolder, isBankHoliday, holidayCountry } from '../questions.js';
import * as cd from '../candles.js';
import * as oe from '../outlookedge.js';
import { outlookStrip } from './an-outlook.js';

/* The chart's height in an outlook block — half the block is chart. */
const OB_CHART_H = 470;
import { fetchFeed, parseFeed, eventsOn, localTime, whenText, minutesTo, FRESH_MINS } from '../news.js';

const BIASES = [
  { key: 'long',    label: 'Long',    col: 'var(--green)' },
  { key: 'short',   label: 'Short',   col: 'var(--orange)' },
  { key: 'neutral', label: 'Neutral', col: 'var(--grey-4)' },
];

const newId = () => 'ob_' + crypto.randomUUID().slice(0, 6);
const newShotId = () => crypto.randomUUID().slice(0, 8);
const blankInstrument = () => ({ id: newId(), pair: '', bias: 'neutral', notes: '', shots: [] });

/* ============================================================
   The day's red folders

   Only High and Holiday — the two that change how you trade. A morning page
   listing sixteen low-impact prints is a morning page nobody reads.

   It fetches when what it has is stale, never on a timer in the background.
   A journal that quietly reaches out every fifteen minutes whether or not
   anyone is looking is not what this app is.
   ============================================================ */
function newsStrip(store, date, nav) {
  const wrap = el('section', { class: 'card news-strip' });

  const paint = (state) => {
    const cached = store.news;
    const all = eventsOn(cached.events, date);
    /* the red folders, and — on their own line, because they are not red
       folders — any bank holidays */
    const events = all.filter(isRedFolder);
    const hols = all.filter(isBankHoliday);
    const age = store.newsAge();
    const now = Date.now();

    const head = el('div', { class: 'ns-head' },
      folderMark('var(--orange)', 13),
      el('span', { class: 'm t' }, 'Red folders'),
      el('span', { class: 'm n' },
        events.length ? `${events.length} today` : 'none today'),
      el('div', { class: 'spacer' }),
      el('span', { class: 'm w' },
        state === 'loading' ? 'checking…'
        : cached.lastError && !cached.fetchedAt ? 'could not reach Forex Factory'
        : cached.lastError ? `could not refresh · showing ${age == null ? 'an older copy' : ago(age)}`
        : age == null ? 'not fetched yet'
        : age < 2 ? 'just now' : ago(age)),
      el('button', { class: 'ns-refresh', title: 'Check Forex Factory now',
        disabled: state === 'loading',
        onClick: () => load(true) }, icon('refresh', 12, 'currentColor', 1.9)));

    const holLine = hols.length ? el('div', { class: 'ns-hol' },
      el('span', { class: 'm k' }, 'Bank holiday'),
      ...hols.map(h => el('span', { class: 'm h', title: h.title }, el('b', {}, h.country), holidayCountry(h.country)))) : null;
    const body = !events.length
      ? el('div', { class: 'ns-empty m' },
          cached.fetchedAt
            ? 'Nothing high-impact on this day.'
            : state === 'loading' ? 'Reading the calendar…'
            : 'No calendar yet — press refresh.')
      : el('div', { class: 'ns-row' }, ...events.map(e => {
          const mins = minutesTo(e.at, now);
          /* Past events stay, dimmed: what has already printed is part of
             reading the day, not clutter to sweep away. */
          const past = mins < 0;
          const soon = !past && mins <= 60;
          return el('div', { class: 'ns-ev' + (past ? ' is-past' : '') + (soon ? ' is-soon' : ''),
            title: [e.title, e.forecast && `forecast ${e.forecast}`, e.previous && `previous ${e.previous}`]
              .filter(Boolean).join(' · ') },
            folderMark('var(--orange)', 11),
            el('span', { class: 'm cur' }, e.country),
            el('span', { class: 'm ttl' }, e.title),
            el('span', { class: 'm at' }, localTime(e.at)),
            el('span', { class: 'm rel' }, whenText(e.at, now)));
        }));

    wrap.replaceChildren(head, body, holLine || '');
  };

  const ago = (mins) => mins < 60 ? `${mins}m ago`
    : mins < 60 * 24 ? `${Math.floor(mins / 60)}h ago`
    : `${Math.round(mins / 60 / 24)}d ago`;

  async function load(force) {
    const age = store.newsAge();
    if (!force && age != null && age < FRESH_MINS && store.news.events.length) return paint();
    paint('loading');
    try {
      const events = parseFeed(await fetchFeed());
      await store.saveNews(events);
      paint();
    } catch (e) {
      await store.newsFailed(e.message);
      paint();
      if (force) toast(e.message, 'bad');
    }
  }

  paint();
  load(false);
  return wrap;
}

export function outlook(store, nav, dateArg) {
  const acct = store.activeAccount;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateArg || '') ? dateArg : c.todayISO();

  /* Edited on a copy, written back whole. The copy is what lets an empty
     block exist on screen without existing in the journal. */
  const day = store.draftOutlook(date);
  if (!day.instruments.length) day.instruments.push(blankInstrument());

  let focused = day.instruments[0].id;      // where a Ctrl+V lands
  let timer = null;

  /* ---------- saving ----------
     Typed changes are cheap JSON and are written a moment after you stop.
     Anything involving a picture writes immediately, because it is an
     explicit act and a large one. */
  const stamp = el('span', { class: 'note m' });
  function paintStamp(state) {
    const at = day.updatedAt ? day.updatedAt.slice(11, 16) : null;
    stamp.textContent = state === 'saving' ? 'saving…'
      : at ? 'saved ' + at
      : 'nothing written yet';
  }

  async function commit() {
    clearTimeout(timer); timer = null;
    paintStamp('saving');
    for (const i of day.instruments) if (i.pair) i.pair = cleanSymbol(i.pair);
    await store.saveOutlook(day);
    paintStamp();
  }

  function touched() {
    paintStamp('saving');
    clearTimeout(timer);
    timer = setTimeout(commit, 800);
  }

  /* ---------- the day, and the days either side ---------- */
  const shift = (days) => {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const go = async (to) => { await commit(); nav.go('#/outlook/' + to); };

  const isToday = date === c.todayISO();
  const dayNav = el('div', { class: 'day-nav' },
    el('button', { type: 'button', title: 'The day before', onClick: () => go(shift(-1)) },
      icon('chevleft', 14, 'currentColor', 2)),
    el('span', { class: 'm d' }, niceDate(date) + (isToday ? ' · today' : '')),
    el('button', { type: 'button', title: 'The day after', disabled: isToday,
      onClick: () => { if (!isToday) go(shift(1)); } }, icon('chevright', 14, 'currentColor', 2)),
  );

  /* ---------- the list ---------- */
  const list = el('div', { class: 'outlook-list' });
  const zones = new Map();

  function paint() {
    zones.clear();
    list.replaceChildren(...day.instruments.map(block), addRow());
    paintTargets();
  }

  /* Which block a paste goes to is a class on an existing node, never a
     reason to rebuild the list — the same lesson the trade form learned:
     redrawing on focus destroys the very button the mouse is pressing. */
  function paintTargets() {
    for (const [id, node] of zones) node.classList.toggle('is-target', id === focused);
  }

  function block(item) {
    const pairField = el('input', {
      class: 'field ins-field m', value: item.pair, placeholder: 'XAUUSD',
      maxLength: 16, spellcheck: false,
      onInput: e => { item.pair = e.target.value.toUpperCase(); touched(); },
      onFocus: () => { focused = item.id; paintTargets(); },
      /* The name is tidied when you leave it, not while you type — nobody
         can type into a field that rewrites itself mid-word. */
      onChange: e => { e.target.value = item.pair = cleanSymbol(e.target.value); commit().then(paint); },
    });

    const biasWrap = el('div', { class: 'seg' },
      ...BIASES.map(b => el('button', { type: 'button',
        class: 'bias bias-' + b.key + (item.bias === b.key ? ' is-on' : ''),
        onClick: () => {
          if (item.bias === b.key) return;
          item.bias = b.key;
          [...biasWrap.children].forEach((n, k) => n.classList.toggle('is-on', BIASES[k].key === b.key));
          touched();
          repaintVerdict(item);
        } }, b.label)));

    const notes = el('textarea', {
      class: 'outlook-notes', spellcheck: true,
      placeholder: 'What the higher timeframe says, the level you care about, and what would make you wrong.',
      onInput: e => { item.notes = e.target.value; touched(); },
      onFocus: () => { focused = item.id; paintTargets(); },
    });
    notes.value = item.notes || '';

    /* ---------- the chart ----------
       The instrument's own chart, live — the same one the trade page and
       the weekly review use, from the same saved prices — in place of the
       screenshot. It opens on yesterday and today. Screenshots added before
       this are still in the journal and open from the line under the notes. */
    const chartSlot = el('div', { class: 'ob-chart' });
    if (cd.oandaInstrument(item.pair)) {
      const prev = shift(-1);
      chartSlot.append(tradeChart(store, nav,
        { id: 'outlook-' + item.id, pair: item.pair, date, timeOpen: '00:00', timeClose: '23:59', status: 'closed', side: 'buy' },
        { height: OB_CHART_H, plain: true, lines: 'outlook',
          focus: { from: cd.localStamp(prev, '00:00'), to: Math.min(Date.now() / 1000, cd.localStamp(date, '23:59')) } }));
    } else {
      chartSlot.append(el('div', { class: 'ob-chart-empty', style: { height: OB_CHART_H + 'px' } },
        el('span', {}, item.pair ? `No chart for ${item.pair}` : 'Type the instrument and its chart appears here')));
    }
    zones.set(item.id, chartSlot);
    const older = outlookShotsOf(item);
    const olderLine = older.length ? el('button', { type: 'button', class: 'ob-older',
      onClick: () => lightbox({ items: older.map(n => ({ label: item.pair || 'Chart', name: n })), urlFor: n => store.shotUrl(n), at: 0 }) },
      icon('image', 12, 'currentColor', 1.7), `${older.length} earlier screenshot${older.length === 1 ? '' : 's'}`) : null;

    const verdictSlot = el('div', {});
    verdicts.set(item.id, verdictSlot);
    verdictSlot.append(...[verdict(item), gradeLine(item)].filter(Boolean));

    const markSlot = el('span', { class: 'pair-mark' });
    const paintMark = () => markSlot.replaceChildren(...(instrumentOf(item.pair).kind !== 'none' ? [pairMark(item.pair, 22)] : []));
    paintMark(); pairField.addEventListener('input', paintMark);
    return el('section', { class: 'card outlook-block' },
      el('div', { class: 'ob-head' },
        el('div', { class: 'pair-wrap ob-pair' }, markSlot, pairField),
        biasWrap,
        el('div', { class: 'spacer' }),
        day.instruments.length > 1
          ? confirmButton({ label: icon('trash', 14, 'currentColor', 1.7), armedLabel: 'Delete?',
              title: 'Remove this instrument',
              className: 'ob-x', armedClassName: 'ob-x is-armed-text',
              onConfirm: () => removeBlock(item) })
          : null),
      el('div', { class: 'ob-body' }, el('div', { class: 'ob-text' }, notes, olderLine), chartSlot),
      verdictSlot);
  }

  /* ---------- the strip: the plan against the day ---------- */
  const verdicts = new Map();
  function repaintVerdict(item) {
    const slot = verdicts.get(item.id);
    if (!slot) return;
    const v = verdict(item);
    slot.replaceChildren(...[v, gradeLine(item)].filter(Boolean));
  }

  /* ---------- the call, graded: the day's candle against the bias ---------- */
  function gradeLine(item) {
    const pair = cleanSymbol(item.pair || '');
    if (!pair || (item.bias !== 'long' && item.bias !== 'short')) return null;
    const { end } = oe.dayCandleSpan(date);
    if (end > Date.now() / 1000) return el('div', { class: 'ob-grade is-wait' }, el('span', { class: 'bar' }), el('span', { class: 'txt' }, `Graded once today's candle closes (5pm New York).`));
    const line = el('div', { class: 'ob-grade' }, el('span', { class: 'bar' }), el('span', { class: 'txt' }, 'Grading the call on the day’s candle…'));
    const bias = item.bias;
    oe.gradeCalls(store, [{ date, pair, bias }]).then(G => {
      if (item.bias !== bias) return;
      const g = G.list[0];
      if (!g || g.state !== 'graded') { line.querySelector('.txt').textContent = G.why ? `Not graded — ${G.why}.` : 'Not graded — no prices for that day.'; return; }
      const pct = g.candle.move / g.candle.open * 100;
      const word = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
      line.classList.add(g.right === true ? 'is-right' : g.right === false ? 'is-wrong' : 'is-flat');
      line.querySelector('.txt').replaceChildren(`The day closed ${word} ${Math.abs(pct).toFixed(2)}% — `,
        el('b', {}, g.right === true ? `your ${BIASES.find(b => b.key === bias).label} was right` : g.right === false ? `your ${BIASES.find(b => b.key === bias).label} was wrong` : 'not a call either way'), '.');
    }).catch(() => {});
    return line;
  }

  function verdict(item) {
    if (!acct) return null;
    const pair = cleanSymbol(item.pair);
    if (!pair) return null;
    const trades = store.tradesOn(acct.id, date)
      .filter(t => cleanSymbol(t.pair) === pair)
      .sort((a, b) => (a.timeOpen || '').localeCompare(b.timeOpen || ''));
    if (!trades.length) return null;

    const rs = trades.map(t => c.rMultiple(acct, t)).filter(r => r != null && isFinite(r));
    const net = rs.length === trades.length ? rs.reduce((a, b) => a + b, 0) : null;
    const longs = trades.filter(t => t.side === 'buy').length;
    const shorts = trades.length - longs;

    /* The one thing worth saying out loud: you wrote a direction down and
       then traded the other way. Said once, plainly, without a lecture. */
    const against = (item.bias === 'long' && shorts && !longs)
                 || (item.bias === 'short' && longs && !shorts);

    const sideWord = longs && shorts ? `${longs} long, ${shorts} short`
      : longs ? (longs === 1 ? 'long' : 'all long')
      : (shorts === 1 ? 'short' : 'all short');

    const tone = against ? 'var(--yellow)'
      : net == null ? 'var(--grey-6)'
      : net > 0 ? 'var(--green)' : net < 0 ? 'var(--orange)' : 'var(--grey-4)';

    return el('div', { class: 'ob-verdict' },
      el('span', { class: 'bar', style: { background: tone } }),
      el('span', { class: 'txt' },
        'You said ', el('b', {}, item.bias), '. You took ',
        el('b', {}, `${trades.length} trade${trades.length === 1 ? '' : 's'}`),
        `, ${sideWord}`,
        trades[0].timeOpen ? `, first at ${trades[0].timeOpen}` : '', '.',
        against ? el('span', { style: { color: 'var(--yellow)' } }, ' Against what you wrote.')
          : (item.bias === 'long' && longs && !shorts) || (item.bias === 'short' && shorts && !longs) ? el('span', { class: 'ob-with' }, ' With your bias.') : null),
      el('span', { class: 'r', style: { color: net == null ? 'var(--grey-4)' : tone } },
        net == null ? '—' : c.rFmt(net)));
  }

  /* ---------- editing ---------- */
  async function removeBlock(item) {
    const n = day.instruments.indexOf(item);
    if (n < 0) return;
    for (const name of outlookShotsOf(item)) await store.dropImage(name);
    day.instruments.splice(n, 1);
    if (!day.instruments.length) day.instruments.push(blankInstrument());
    if (focused === item.id) focused = day.instruments[0].id;
    await commit();
    paint();
  }

  function addRow() {
    return el('button', { class: 'outlook-add', type: 'button',
      onClick: () => {
        const item = blankInstrument();
        day.instruments.push(item);
        focused = item.id;
        paint();
        /* Straight into the name field — you know which instrument it is
           before you know what you want to say about it. */
        const fields = list.querySelectorAll('.ins-field');
        fields[fields.length - 1]?.focus();
      } },
      icon('plus', 15, 'var(--grey-4)', 2),
      el('span', { class: 'm' }, 'Another instrument'));
  }

  const view = el('div', { class: 'view' },
    el('header', { class: 'head' },
      el('h1', {}, 'Daily outlook'),
      stamp,
      el('div', { class: 'spacer' }),
      dayNav),
    el('div', { class: 'outlook-scroll' }, acct ? outlookStrip(store, acct, nav) : null, newsStrip(store, date, nav), list),
  );

  paint();
  paintStamp();
  return view;
}

/* "Mon 21 Sep" — short enough for a header, unambiguous enough to trust. */
function niceDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${wd} ${d.getUTCDate()} ${mo}`;
}
