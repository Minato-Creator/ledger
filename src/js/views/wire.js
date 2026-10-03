/* ============================================================
   wire.js (view) — the newswire.

   A page you scroll rather than a strip you glance at. Newest at the top,
   always; the day it happened above each run of headlines; and a row of
   chips to cut it down to the one kind you came for.

   Three decisions worth knowing about:

   • It refreshes while you are on it and stops the moment you leave. One
     request a tick, not seven — the mixed feed carries every category, and
     the deep read of all six is done once when the page opens. An app that
     quietly reaches out every few minutes whether or not anyone is looking
     is not what this is.

   • The page never empties itself. A refresh merges into what is already
     held, so a feed that fails for a minute costs you nothing, and the wire
     you last read is still there with no connection at all.

   • What arrived since you last looked is marked rather than resorted. The
     order on this page is time, and nothing else is allowed to move it.
   ============================================================ */
import { isRedFolder, isBankHoliday, holidayCountry } from '../questions.js';
import { el, icon, toast, folderMark } from '../ui.js';
import * as c from '../calc.js';
import {
  DEEP_FEEDS, LIVE_FEED, FRESH_MINS, readFeed, mergeWire,
  localTime, ago, byDay, labelFor, FEEDS,
} from '../wire.js';
import {
  ensureNews, eventsOn, eventsByDay, localTime as ffTime,
  whenText, minutesTo,
} from '../news.js';

/* Kept between visits so coming back to the page lands where you left it
   rather than back at Everything. */
let filter = 'all';
let openId = null;
/* One tick for the app, not one per repaint. The page is rebuilt on every
   interaction, and a timer left behind by each rebuild would have the wire
   fetching several times a minute within a few clicks. */
let tick = null;
/* The countdown runs on its own clock, separate from the feed's. It is the
   only thing on this page that has to be right to the minute. */
let countdown = null;

const LIVE_MINS = 3;

/* ============================================================
   Today's red folders, counting down

   A strip that moves, because the thing it is telling you is that time is
   passing. It carries today only — the week is in the rail beside the wire,
   and a strip you have to wait forty seconds to read the end of is not a
   strip, it is a queue.

   The run of events is written twice and the pair is slid left by exactly
   half its width, which is what makes the loop seamless: the moment the
   first copy leaves, the second is where it was. The speed is set from the
   measured width so a busy Friday scrolls at the same pace as a quiet
   Tuesday rather than sprinting.
   ============================================================ */
const SCROLL_PX_PER_SEC = 34;

function redFolderStrip(store, nav) {
  const wrap = el('section', { class: 'card rf-strip' });
  /* Every countdown on the strip, both copies of it, so the minutes can be
     rewritten without rebuilding the track and restarting the scroll. */
  let ticking = [];

  function eventLine(e, now) {
    const mins = minutesTo(e.at, now);
    const past = mins < 0;
    const soon = !past && mins <= 60;
    const rel = el('span', { class: 'rel' }, whenText(e.at, now));
    ticking.push({ node: rel, at: e.at, holiday: false });
    return el('span', { class: 'rf-ev' + (past ? ' is-past' : '') + (soon ? ' is-soon' : ''),
      title: [e.title, e.forecast && `forecast ${e.forecast}`, e.previous && `previous ${e.previous}`]
        .filter(Boolean).join(' · ') },
      folderMark('var(--orange)', 10),
      el('span', { class: 'cur' }, e.country),
      el('span', { class: 'ttl' }, e.title),
      el('span', { class: 'at' }, ffTime(e.at)),
      rel);
  }

  function paint(state) {
    ticking = [];
    const cached = store.news;
    const today = c.todayISO();
    const all = eventsOn(cached.events, today);
    const events = all.filter(isRedFolder);
    const hols = all.filter(isBankHoliday);

    const label = el('span', { class: 'rf-label' },
      folderMark('var(--orange)', 12),
      el('span', { class: 'm t' }, 'Today'),
      el('span', { class: 'm n' }, events.length ? `${events.length}` : ''),
      /* bank holidays are not red folders: named beside the label, not scrolled */
      hols.length ? el('span', { class: 'm rf-hol', title: hols.map(h => h.title).join(' · ') },
        'Bank holiday · ' + hols.map(h => holidayCountry(h.country)).join(', ')) : null);

    if (!events.length) {
      /* An empty strip that still scrolls is an animation for its own sake.
         It says its one sentence and stays still. */
      wrap.replaceChildren(label, el('span', { class: 'm rf-none' },
        state === 'loading' ? 'reading the calendar…'
        : cached.lastError && !cached.fetchedAt ? 'could not reach Forex Factory'
        : cached.fetchedAt ? 'nothing high-impact today'
        : 'no calendar yet'));
      return;
    }

    const now = Date.now();
    const run = () => el('span', { class: 'rf-run' }, ...events.map(e => eventLine(e, now)));
    const second = run();
    const track = el('div', { class: 'rf-track' }, run(), second);
    const window_ = el('div', { class: 'rf-window' }, track);
    wrap.replaceChildren(label, window_);

    /* Width is only knowable once it is on the page. Two things come out of
       it: the duration, so a busy Friday scrolls at the same pace as a quiet
       Tuesday, and whether to scroll at all — three short events that
       already fit have nowhere to go, and sliding them about anyway is
       movement for its own sake. */
    requestAnimationFrame(() => {
      const w = track.scrollWidth / 2;
      if (!w) return;
      if (w <= window_.clientWidth) {
        second.remove();
        ticking = ticking.slice(0, events.length);
        wrap.classList.add('is-still');
        return;
      }
      wrap.classList.remove('is-still');
      track.style.animationDuration = Math.max(14, Math.round(w / SCROLL_PX_PER_SEC)) + 's';
      track.classList.add('is-running');
    });
  }

  /* The minutes are rewritten in place. Rebuilding the row would jump the
     scroll back to the start every half minute. */
  function retime() {
    if (!wrap.isConnected) { clearInterval(countdown); countdown = null; return; }
    const now = Date.now();
    for (const t of ticking) {
      if (t.holiday) continue;
      t.node.textContent = whenText(t.at, now);
      const mins = minutesTo(t.at, now);
      const ev = t.node.parentElement;
      if (ev) {
        ev.classList.toggle('is-past', mins < 0);
        ev.classList.toggle('is-soon', mins >= 0 && mins <= 60);
      }
    }
  }

  paint();
  ensureNews(store).then(() => paint()).catch(() => paint());
  clearInterval(countdown);
  countdown = setInterval(retime, 20000);
  return wrap;
}

/* ============================================================
   The week's red folders

   Small on purpose. It is the same calendar the outlook page opens with —
   high impact and bank holidays, nothing else — laid out as the week so you
   can see what is still coming without leaving the wire.
   ============================================================ */
function redFolderWeek(store, nav) {
  const cached = store.news;
  const days = eventsByDay(cached.events);
  const today = c.todayISO();
  const now = Date.now();

  const body = days.length
    ? el('div', { class: 'rf-week-list' },
        ...days.flatMap(([date, list]) => [
          el('div', { class: 'rf-week-day' + (date === today ? ' is-today' : '') },
            el('span', {}, c.shortDate(date).replace(/^0/, '')),
            el('span', { class: 'n' }, date === today ? 'today' : '')),
          ...list.map(e => {
            const past = minutesTo(e.at, now) < 0;
            return el('div', { class: 'rf-week-ev' + (past ? ' is-past' : ''),
              title: [e.title, e.forecast && `forecast ${e.forecast}`, e.previous && `previous ${e.previous}`]
                .filter(Boolean).join(' · ') },
              el('span', { class: 'at' }, isBankHoliday(e) ? 'all day' : ffTime(e.at)),
              isBankHoliday(e) ? el('span', { class: 'rf-holmark', title: 'Bank holiday — not a red folder' }) : folderMark('var(--orange)', 10),
              el('span', { class: 'cur' }, e.country),
              el('span', { class: 'ttl' }, isBankHoliday(e) ? `Bank holiday · ${holidayCountry(e.country)}` : e.title));
          }),
        ]))
    : el('div', { class: 'rf-week-none m' },
        cached.fetchedAt ? 'Nothing high-impact this week.' : 'No calendar read yet.');

  return el('section', { class: 'card rf-week' },
    el('div', { class: 'rf-week-head' },
      folderMark('var(--orange)', 12),
      el('h2', {}, 'This week'),
      el('span', { class: 'note' }, 'Forex Factory'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'ns-refresh', title: 'Check Forex Factory now',
        onClick: async () => {
          try { await ensureNews(store, { force: true }); }
          catch (e) { toast(e.message, 'bad'); }
          nav.refresh();
        } }, icon('refresh', 12, 'currentColor', 1.9))),
    body);
}

export function wire(store, nav) {
  const held = store.wire;
  const items = held.items || [];
  /* Read once when the page is built, not on every repaint — otherwise the
     line moves under you as you scroll and nothing stays marked as new. */
  const since = held.seenAt || null;
  const isNew = it => since && it.at > since;

  let busy = false;

  /* ---------- fetching ----------
     A deep read walks every category feed; a live read is the one mixed feed.
     Both merge, so neither can empty the page. */
  async function pull(feeds, { quiet = false } = {}) {
    if (busy) return;
    busy = true;
    paintHead();
    const got = [], failed = [];
    for (const f of feeds) {
      try { got.push(...await readFeed(f)); }
      catch (e) { failed.push(e.message || String(e)); }
    }
    busy = false;
    if (!got.length) {
      await store.wireFailed(failed[0] || 'nothing came back');
      if (!quiet) toast(`investingLive ${failed[0] || 'gave nothing back'}`, 'bad');
      paintHead();
      return;
    }
    const before = new Set((store.wire.items || []).map(x => x.id));
    const merged = mergeWire(store.wire.items, got);
    await store.saveWire(merged);
    const fresh = merged.filter(x => !before.has(x.id)).length;
    if (!quiet && failed.length) toast(`${failed.length} feed${failed.length === 1 ? '' : 's'} did not answer`, 'warn');
    if (fresh) nav.refresh({ keepFocus: true });
    else paintHead();
  }

  /* ---------- the head ---------- */
  const out = {};
  function paintHead() {
    const w = store.wire;
    const mins = store.wireAge();
    out.stamp.textContent = busy ? 'reading…'
      : mins == null ? 'not read yet'
      : mins < 1 ? 'just now'
      : mins < 60 ? `${mins}m ago`
      : `${Math.floor(mins / 60)}h ago`;
    out.stamp.style.color = busy ? 'var(--ink-3)'
      : w.lastError ? 'var(--yellow)' : 'var(--ink-4)';
    out.err.textContent = w.lastError && !busy ? w.lastError : '';
    out.refresh.disabled = busy;
    out.refresh.classList.toggle('is-spinning', busy);
  }

  out.stamp = el('span', { class: 'm', style: { fontSize: '10.5px' } }, '');
  out.err = el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--yellow)' } }, '');
  out.refresh = el('button', { class: 'btn btn-light', title: 'Read the feeds again now',
    onClick: () => pull([LIVE_FEED, ...DEEP_FEEDS]) },
    icon('refresh', 13, 'var(--grey-8)', 1.9), 'Refresh');

  const head = el('header', { class: 'head' },
    el('h1', {}, 'Newswire'),
    el('span', { class: 'sub' }, 'investingLive'),
    out.stamp,
    out.err,
    el('div', { class: 'spacer' }),
    out.refresh);

  /* ---------- the chips ----------
     Counts are of what is held, so a chip that would show you nothing says
     so before you press it. */
  const counts = {};
  for (const it of items) counts[it.category] = (counts[it.category] || 0) + 1;

  const chips = el('div', { class: 'wire-chips' },
    el('button', { type: 'button', class: 'wire-chip' + (filter === 'all' ? ' is-on' : ''),
      onClick: () => { filter = 'all'; nav.refresh(); } },
      'Everything', el('span', { class: 'n' }, String(items.length))),
    ...FEEDS.filter(f => !f.hidden).map(f =>
      el('button', { type: 'button', class: 'wire-chip' + (filter === f.key ? ' is-on' : ''),
        disabled: !counts[f.key],
        onClick: () => { filter = f.key; nav.refresh(); } },
        f.label, el('span', { class: 'n' }, String(counts[f.key] || 0)))));

  /* ---------- the list ---------- */
  const shown = filter === 'all' ? items : items.filter(it => it.category === filter);
  const days = byDay(shown);

  const row = (it) => {
    const open = openId === it.id;
    const body = it.summary
      ? el('button', { type: 'button', class: 'wire-sum' + (open ? ' is-open' : ''),
          title: open ? 'Hide' : 'Read a little more',
          onClick: () => { openId = open ? null : it.id; nav.refresh({ keepFocus: true }); } },
          it.summary)
      : null;

    return el('article', { class: 'wire-row' + (isNew(it) ? ' is-new' : '') },
      el('span', { class: 'wire-time', title: c.longDate(it.at.slice(0, 10)) }, localTime(it.at)),
      el('span', { class: 'wire-cat', dataset: { cat: it.category } }, labelFor(it.category)),
      el('div', { class: 'wire-main' },
        el('span', { class: 'wire-title' }, it.title),
        body),
      el('span', { class: 'wire-ago' }, ago(it.at)));
  };

  const list = el('div', { class: 'wire-list' },
    ...days.flatMap(([date, ofDay]) => [
      el('div', { class: 'wire-day' },
        el('span', {}, c.longDate(date)),
        el('span', { class: 'n' }, `${ofDay.length} item${ofDay.length === 1 ? '' : 's'}`)),
      ...ofDay.map(row),
    ]));

  const empty = el('div', { class: 'empty' },
    el('p', {}, items.length
      ? 'Nothing under that heading yet.'
      : 'The wire has not been read yet. It fetches on its own; press Refresh if you would rather not wait.'),
    items.length ? null : el('button', { class: 'btn btn-light', onClick: () => pull([LIVE_FEED, ...DEEP_FEEDS]) },
      icon('refresh', 13, 'var(--grey-8)', 1.9), 'Read it now'));

  const card = el('section', { class: 'card wire-card' },
    chips,
    shown.length ? list : empty);

  const view = el('div', { class: 'view' }, head,
    redFolderStrip(store, nav),
    el('div', { class: 'row', style: { flex: '1', minHeight: 0 } },
      card, redFolderWeek(store, nav)));
  paintHead();

  /* ---------- while you are here ----------
     The tick stops itself the moment the page is gone, so leaving the app on
     another screen is leaving it alone. */
  clearInterval(tick);
  tick = setInterval(() => {
    if (!view.isConnected) { clearInterval(tick); tick = null; return; }
    pull([LIVE_FEED], { quiet: true });
  }, LIVE_MINS * 60 * 1000);

  /* A deep read when what is held has gone stale, and nothing at all when it
     has not — opening the page twice in a minute is not a reason to ask
     somebody else's server for the same thing twice. */
  const age = store.wireAge();
  if (age == null || age >= FRESH_MINS) {
    setTimeout(() => { if (view.isConnected) pull(age == null ? [LIVE_FEED, ...DEEP_FEEDS] : [LIVE_FEED], { quiet: true }); }, 60);
  }

  /* Reading it is what marks it read. Recorded after the page is built, so
     this visit still shows what arrived since the last one. */
  setTimeout(() => { if (view.isConnected && items.length) store.markWireSeen(); }, 1200);

  return view;
}
