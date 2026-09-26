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
import * as c from '../calc.js';
import { cleanSymbol } from '../calc.js';
import { outlookShotsOf } from '../store.js';
import { prepare, isImage, imageOnClipboard, imageOnDrop, readableSize, MAX_INPUT } from '../shots.js';
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
    const events = eventsOn(cached.events, date);
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

    const body = !events.length
      ? el('div', { class: 'ns-empty m' },
          cached.fetchedAt
            ? 'Nothing high-impact on this day.'
            : state === 'loading' ? 'Reading the calendar…'
            : 'No calendar yet — press refresh.')
      : el('div', { class: 'ns-row' }, ...events.map(e => {
          const mins = minutesTo(e.at, now);
          const holiday = e.impact === 'Holiday';
          /* Past events stay, dimmed: what has already printed is part of
             reading the day, not clutter to sweep away. */
          const past = mins < 0;
          const soon = !past && mins <= 60;
          return el('div', { class: 'ns-ev' + (past ? ' is-past' : '') + (soon ? ' is-soon' : ''),
            title: [e.title, e.forecast && `forecast ${e.forecast}`, e.previous && `previous ${e.previous}`]
              .filter(Boolean).join(' · ') },
            folderMark(holiday ? 'var(--grey-5)' : 'var(--orange)', 11),
            el('span', { class: 'm cur' }, e.country),
            el('span', { class: 'm ttl' }, e.title),
            el('span', { class: 'm at' }, localTime(e.at)),
            el('span', { class: 'm rel' }, holiday ? 'all day' : whenText(e.at, now)));
        }));

    wrap.replaceChildren(head, body);
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

    /* ---------- the charts ----------
       One instrument, as many charts as the morning needed. With none it is
       the drop area it always was; with one or more it is the pictures
       themselves, each of which opens full size, and a small button on the
       end for the next one.

       The whole column takes a drop or a paste whichever it is showing, so
       the habit of snipping and hitting paste never stops working. */
    const shots = outlookShotsOf(item);

    const input = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true,
      onChange: e => { const files = [...e.target.files]; e.target.value = ''; takeMany(item, files); } });

    const pick = () => { focused = item.id; paintTargets(); input.click(); };

    const zone = el('div', { class: 'ob-charts' + (shots.length ? ' has-shots' : ''),
      tabIndex: shots.length ? -1 : 0,
      onFocus: () => { focused = item.id; paintTargets(); },
      onDragOver: e => { e.preventDefault(); zone.classList.add('is-over'); },
      onDragLeave: () => zone.classList.remove('is-over'),
      onDrop: e => { e.preventDefault(); zone.classList.remove('is-over'); take(item, imageOnDrop(e)); } });

    /* The tiles scroll; the button to add the next one does not, so it is
       never the thing you have to scroll down to find. */
    const strip = el('div', { class: 'ob-shot-strip' });

    if (shots.length) {
      strip.append(...shots.map((name, at) => {
        const tile = el('button', { type: 'button', class: 'ob-shot is-loading',
          title: 'View full size',
          onClick: () => { if (tile.dataset.url) lightbox({
            items: shots.map(n => ({ label: item.pair || 'Chart', name: n })),
            urlFor: n => store.shotUrl(n), at }); } },
          confirmButton({
            label: icon('close', 11, 'currentColor', 2.2), armedLabel: 'delete?',
            title: 'Remove this chart',
            className: 'ob-shot-x', armedClassName: 'ob-shot-x is-armed-text',
            onConfirm: () => dropShot(item, name) }));
        store.shotUrl(name).then(url => {
          tile.classList.remove('is-loading');
          if (url) { tile.dataset.url = url; tile.style.backgroundImage = `url("${url}")`; }
          else tile.append(el('span', { class: 'm', style: { fontSize: '10px', color: 'var(--yellow)' } }, 'missing'));
        });
        return tile;
      }));
      zone.append(strip,
        el('button', { type: 'button', class: 'ob-shot-add', title: 'Add another chart', onClick: pick },
          icon('plus', 13, 'currentColor', 2),
          el('span', { class: 'm' }, 'Chart'),
          shots.length > 3 ? el('span', { class: 'n' }, String(shots.length)) : null));
      /* Past three the strip scrolls, and a hidden picture is a picture you
         forget you took — so the edge fades to say there is more. */
      requestAnimationFrame(() => strip.classList.toggle('is-more', strip.scrollHeight > strip.clientHeight + 1));
    } else {
      zone.append(el('button', { type: 'button', class: 'shot-zone outlook-shot', onClick: pick,
        onFocus: () => { focused = item.id; paintTargets(); } },
        icon('image', 19, 'var(--grey-5)', 1.6),
        el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--grey-5)' } }, 'Drop, paste or click')));
    }
    zones.set(item.id, zone);

    const verdictSlot = el('div', {});
    verdicts.set(item.id, verdictSlot);
    const v = verdict(item);
    if (v) verdictSlot.append(v);

    return el('section', { class: 'card outlook-block' },
      el('div', { class: 'ob-head' },
        pairField,
        biasWrap,
        el('div', { class: 'spacer' }),
        day.instruments.length > 1
          ? confirmButton({ label: icon('trash', 14, 'currentColor', 1.7), armedLabel: 'Delete?',
              title: 'Remove this instrument',
              className: 'ob-x', armedClassName: 'ob-x is-armed-text',
              onConfirm: () => removeBlock(item) })
          : null),
      el('div', { class: 'ob-body' }, notes, el('div', { class: 'ob-chart' }, zone, input)),
      verdictSlot);
  }

  /* ---------- the strip: the plan against the day ---------- */
  const verdicts = new Map();
  function repaintVerdict(item) {
    const slot = verdicts.get(item.id);
    if (!slot) return;
    const v = verdict(item);
    slot.replaceChildren(...(v ? [v] : []));
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
        against ? el('span', { style: { color: 'var(--yellow)' } }, ' Against what you wrote.') : null),
      el('span', { class: 'r', style: { color: net == null ? 'var(--grey-4)' : tone } },
        net == null ? '—' : c.rFmt(net)));
  }

  /* ---------- editing ---------- */
  /* Charts are added, never replaced — a second screenshot on an instrument
     is a second timeframe, not a correction of the first. */
  async function take(item, file) {
    if (!file) return;
    if (!isImage(file)) return toast('That is not an image', 'bad');
    if (file.size > MAX_INPUT) return toast(`That file is ${readableSize(file.size)} — too big`, 'bad');
    try {
      const out = await prepare(file);
      item.shots = outlookShotsOf(item);
      item.shots.push(await store.putOutlookShot(date, item.id, out.blob, newShotId()));
      focused = item.id;
      await commit();
      paint();
    } catch (e) { toast(e.message, 'bad'); }
  }

  /* Picking several at once writes them in the order they were chosen, one
     after another — two at the same filename would be one file on disk. */
  async function takeMany(item, files) {
    for (const f of files) await take(item, f);
  }

  async function dropShot(item, name) {
    item.shots = outlookShotsOf(item).filter(n => n !== name);
    await store.dropImage(name);
    await commit();
    paint();
  }

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

  /* A screenshot arrives from the snipping tool, not from disk. It goes to
     whichever block you last touched. */
  function onPaste(e) {
    const file = imageOnClipboard(e);
    if (!file) return;
    const item = day.instruments.find(x => x.id === focused);
    if (!item) return;
    e.preventDefault();
    take(item, file);
  }

  const view = el('div', { class: 'view', onPaste },
    el('header', { class: 'head' },
      el('h1', {}, 'Daily outlook'),
      stamp,
      el('div', { class: 'spacer' }),
      dayNav),
    el('div', { class: 'outlook-scroll' }, newsStrip(store, date, nav), list),
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
