import { el, icon, toast, confirmButton, lightbox } from '../ui.js';
import * as c from '../calc.js';
import { tradeShotsOf } from '../store.js';
import { CONFIDENCE, EMOTION_AFTER, EXIT_REASONS, MISTAKES, DELIVERY, NEWS, holidayName } from '../questions.js';
import { newsText, holidayText, dayRedFolders } from '../newsday.js';
import { newsLabel, localTime } from '../news.js';
import { heldAsked, heldOf, heldText } from '../questions.js';
import { tradeChart } from './tradechart.js';

export function tradeDetail(store, nav, id) {
  const acct = store.activeAccount;
  const t = store.trades.find(x => x.id === id);
  if (!t) return el('div', { class: 'view' }, el('div', { class: 'card', style: { flex: 1 } },
    el('div', { class: 'empty' }, el('p', {}, 'That trade is not here any more.'),
      el('button', { class: 'btn btn-quiet', onClick: () => nav.go('#/trades') }, 'Back to trades'))));

  const account = store.allAccounts.find(a => a.id === t.accountId) || acct;
  const r = c.rMultiple(account, t);
  const o = c.outcome(t);
  const planned = c.plannedR(t);
  const oneR = c.oneR(account, t);
  const setup = store.playbook.setups.find(s => s.id === t.setupId);
  const sessionName = c.sessionLabel(store.playbook, t.sessionId);
  const allTags = store.playbook.tagGroups.flatMap(g => g.tags);
  const tags = (t.tagIds || []).map(x => allTags.find(y => y.id === x)).filter(Boolean);
  const cur = account.currency;
  const open = t.status === 'open';
  const col = open ? 'var(--yellow)'
    : o === 'win' ? 'var(--green)' : o === 'loss' ? 'var(--orange)' : 'var(--grey-2)';

  const row = (k, v, vcol) => el('div', { style: { display: 'flex', alignItems: 'baseline' } },
    el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, k),
    el('span', { class: 'm', style: { marginLeft: 'auto', fontSize: '12.5px', color: vcol || 'var(--ink-2)' } }, v));

  const head = el('header', { class: 'head' },
    el('button', { style: { width: '32px', height: '32px', borderRadius: '12px', background: 'var(--grey-8)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
      onClick: () => nav.go('#/trades') }, icon('chevleft', 15, 'var(--grey-1)', 2)),
    el('h1', {}, t.pair),
    el('span', { class: 'sub' }, `${c.longDate(t.date)} · ${sessionName} · ${account.name}`),
    el('div', { class: 'spacer' }),
    open
      ? el('button', { class: 'btn btn-primary', onClick: () => nav.go('#/edit/' + t.id) }, 'Close it')
      : el('button', { class: 'btn btn-quiet', onClick: () => nav.go('#/edit/' + t.id) }, 'Edit'),
    /* A trade and its charts, gone for good — so the button asks first. */
    confirmButton({
      label: 'Delete', armedLabel: 'Confirm delete',
      className: 'btn btn-ghost', armedClassName: 'btn btn-ghost is-armed',
      onConfirm: async () => {
        await store.deleteTrade(t.id); toast('Trade deleted'); nav.go('#/trades');
      } }),
  );

  /* ---------- the charts ----------
     Read from the journal after the page is up rather than before it, so a
     slow disk delays a picture and not the whole trade. */
  const present = tradeShotsOf(t);
  const chartsCard = present.length
    ? el('div', { class: 'card', style: { flex: 'none' } },
        el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '9px' } },
          el('div', { class: 'eyebrow', style: { margin: 0 } }, 'Screenshots'),
          el('span', { class: 'note' }, present.length === 1 ? '' : `${present.length}`),
          el('div', { style: { marginLeft: 'auto' } })),
        /* Two across once there are two, however many there are — a row of
           six thumbnails is not a chart, it is a filmstrip.

           An odd count leaves half a row empty, and that is on purpose: the
           alternative, letting the last one span both columns, makes it twice
           the size of the rest and the eye reads that as importance. Charts
           of the same trade are worth comparing, so they are the same size. */
        el('div', { style: { marginTop: '12px', display: 'grid',
                             gridTemplateColumns: present.length > 1 ? '1fr 1fr' : '1fr', gap: '10px' } },
          ...present.map((name, at) => chartTile(store, t, name, at, present))))
    : null;

  /* The day's chart first — a trader looks at the picture before reading
     the note — and the screenshots you took at the bottom, where the column
     scrolls to them. */
  const left = el('div', { class: 'td-left', style: { width: '780px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px',
                                                      minHeight: 0, overflowY: 'auto' } },
    tradeChart(store, nav, t),
    howItWent(t, store.data.news),
    el('div', { class: 'card', style: { flex: 'none', minHeight: '170px' } },
      el('div', { class: 'eyebrow' }, 'Journal'),
      el('div', { style: { marginTop: '13px', fontSize: '13.5px', lineHeight: 1.62, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', flex: '1', overflowY: 'auto' } },
        t.notes || el('span', { style: { color: 'var(--grey-5)' } }, 'No notes on this one.')),
      el('div', { style: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--grey-7)', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        ...(tags.length ? tags.map(tag => el('span', { class: 'tag' }, tag.name))
                        : [el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, 'No tags')]))),
    chartsCard,
  );

  const right = el('div', { style: { flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' } },
    el('div', { class: 'card light', style: { height: '196px', flex: 'none' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        el('span', { class: 'm', style: { fontSize: '11.5px', borderRadius: 'var(--r-pill)', padding: '5px 11px',
          background: t.side === 'buy' ? 'rgba(var(--profit-rgb), .20)' : 'rgba(var(--loss-rgb), .20)',
          color: t.side === 'buy' ? 'var(--pos-light)' : 'var(--neg-light)' } }, t.side === 'buy' ? '▲ Long' : '▼ Short'),
        t.assetClass ? el('span', { class: 'm', style: { fontSize: '11.5px', borderRadius: 'var(--r-pill)', padding: '5px 11px', background: 'var(--grey-1_7)', color: 'var(--grey-8)' } }, t.assetClass) : null,
        open ? el('span', { class: 'm', style: { display: 'inline-flex', alignItems: 'center', gap: '6px',
              marginLeft: 'auto', fontSize: '11px', borderRadius: 'var(--r-pill)', padding: '5px 11px',
              background: 'rgba(255,184,0,.20)', color: 'var(--yellow)' } },
            el('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--yellow)' } }),
            'Still open') : null),
      /* A running trade has no figure to put here, and a dash would read as a
         break-even. It says what it is instead. */
      open
        ? el('div', { class: 'kpi-val', style: { marginTop: 'auto', fontSize: '30px', color: 'var(--yellow)' } }, 'Open')
        : el('div', { class: 'kpi-val', style: { marginTop: 'auto', fontSize: '36px' } }, c.tradeFig(store.displayUnit, account, t)),
      open
        ? el('div', { class: 'm', style: { marginTop: '12px', fontSize: '11.5px', color: 'var(--grey-6)' } },
            oneR ? `${Number(t.riskPercent).toFixed(2)}% at risk · 1R = ${c.money(oneR, { sign: false, currency: cur })}` : 'no risk set')
        : el('div', { style: { marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' } },
            el('span', { class: 'm', style: { fontSize: '12px', borderRadius: 'var(--r-pill)', padding: '4px 11px',
              background: o === 'win' ? 'rgba(var(--profit-rgb), .20)' : o === 'loss' ? 'rgba(var(--loss-rgb), .20)' : 'var(--grey-1_7)',
              color: o === 'win' ? 'var(--pos-light)' : o === 'loss' ? 'var(--neg-light)' : 'var(--grey-8)' } }, c.rFmt(r)),
            el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-6)' } },
              store.displayUnit === '$' && account.startingBalance
                ? `${(Math.abs(t.netResult) / account.startingBalance * 100).toFixed(2)}% of account`
                : store.displayUnit === '$' ? ''
                : c.money(t.netResult, { currency: cur })))),

    el('div', { class: 'card', style: { flex: '1', gap: '11px' } },
      el('div', { class: 'eyebrow' }, 'Execution'),
      row('Entry', `${t.entryPrice ?? '—'}${t.timeOpen ? '  ' + t.timeOpen : ''}`),
      row('Stop', t.stopLoss ?? '—'),
      row('Target', t.takeProfit ?? '—'),
      row('Exit', open ? 'still in it' : `${t.exitPrice ?? '—'}${t.timeClose ? '  ' + t.timeClose : ''}`, open ? 'var(--yellow)' : null),
      el('div', { style: { height: '1px', background: 'var(--grey-7)' } }),
      row('Size', t.size ? `${t.size} ${t.sizeUnit || ''}`.trim() : '—'),
      row('Risk set', `${Number(t.riskPercent).toFixed(2)}%  = ${c.money(oneR, { sign: false, currency: cur })}`),
      row('Result entered', open ? 'not yet' : c.money(t.netResult, { currency: cur }), col),
      row('R = result ÷ 1R', open ? '—' : c.rFmt(r), col),
      row('Planned R:R', planned == null ? '—' : `1 : ${planned.toFixed(2)}`),
      row('Setup', setup ? setup.name : '—'),
      row('Session', sessionName + (t.sessionAuto === false ? '  (set by hand)' : '')),
      row('Time in trade', c.durationFmt(c.durationMins(t.timeOpen, t.timeClose))),
      !open && planned != null && r != null
        ? el('div', { style: { marginTop: 'auto', background: 'var(--grey-7)', borderRadius: 'var(--r-inset)', padding: '15px 17px' } },
            el('div', { class: 'eyebrow', style: { marginBottom: '7px' } }, 'Captured versus planned'),
            el('div', { class: 'm', style: { fontSize: '19px', color: 'var(--ink)', lineHeight: 1 } },
              `${r.toFixed(2)}R of a planned ${planned.toFixed(2)}R`),
            )
        : null),
  );

  return el('div', { class: 'view' }, head, el('div', { class: 'row', style: { flex: '1', minHeight: 0 } }, left, right));
}

/* One chart on the trade page. The picture arrives when the journal hands it
   over; until then the tile shimmers rather than jumping the layout. */
function chartTile(store, trade, name, at, present) {
  const tile = el('button', { class: 'shot-view is-waiting',
    title: 'View full size',
    onClick: () => { if (tile.dataset.url) lightbox({
      items: present.map(n => ({ label: trade.pair || 'Chart', name: n })),
      urlFor: n => store.shotUrl(n),
      at }); } },
    el('span', { class: 'zoom' }, icon('expand', 12, '#fff', 1.9)));

  store.shotUrl(name).then(url => {
    tile.classList.remove('is-waiting');
    if (url) { tile.dataset.url = url; tile.style.backgroundImage = `url("${url}")`; }
    else {
      tile.style.cursor = 'default';
      tile.append(el('span', { class: 'm', style: { fontSize: '10.5px', color: 'var(--yellow)' } },
        'picture missing from the journal'));
    }
  });
  return tile;
}


/* ---------- how it went ----------
   The questions New trade asks, read back: how sure you were, how it felt,
   how it ended and what it would have made if held, the timeframe, how
   price moved, and what went wrong. Left off entirely for a trade logged
   before they were asked. */
export function howItWent(t, news = null) {
  const open = t.status === 'open';
  const mistakes = Array.isArray(t.mistakes) ? t.mistakes : null;
  const held = heldOf(t);
  const hols = Array.isArray(t.holidays) ? t.holidays : [];
  const has = t.confidence != null || t.emotionAfter != null || t.exitReason != null || t.execTf != null || t.delivery != null || mistakes || held || t.news || hols.length || t.newsEvent || newsText(t, news) || holidayText(t, news);
  if (!has) return null;
  const name = (list, v) => (list.find(([k]) => k === v) || [])[1];
  const scale = (list, v) => v == null ? el('b', { class: 'is-none' }, '—')
    : el('b', {}, el('span', { class: 'td-pips is-' + v }, ...[1, 2, 3, 4, 5].map(i => el('i', { class: i <= v ? 'on' : '' }))), `${v} · ${name(list, v)}`);
  const cell = (k, v, cls = '', extra = {}) => el('div', { class: 'td-cell' + cls, ...extra }, el('span', { class: 'k' }, k), v);
  const plain = v => v == null ? el('b', { class: 'is-none' }, '—') : el('b', {}, v);
  const heldTone = held ? (held.outcome === 'win' ? ' is-pos' : held.outcome === 'loss' ? ' is-neg' : '') : '';
  return el('div', { class: 'card td-how', style: { flex: 'none' } },
    el('div', { class: 'eyebrow' }, 'How it went'),
    el('div', { class: 'td-grid' },
      cell('Confidence', scale(CONFIDENCE, t.confidence)),
      cell('Feeling after', open ? plain('after it closes') : scale(EMOTION_AFTER, t.emotionAfter)),
      cell('Exit', plain(open ? 'still in it' : name(EXIT_REASONS, t.exitReason) ?? null), t.exitReason ? ' is-xr-' + t.exitReason : ''),
      heldAsked(t) || held ? cell('If held to target', plain(held ? heldText(held) : null), ' is-held' + heldTone) : null,
      cell('Timeframe', plain(t.execTf ?? null)),
      open ? null : cell('Price delivery', plain(name(DELIVERY, t.delivery) ?? null), t.delivery ? ' is-dl-' + t.delivery : ''),
      cell('News timing', plain(name(NEWS, t.news) ?? null), t.news && t.news !== 'none' ? ' is-news' : ''),
      /* from the calendar where it was read for that day, else as saved */
      newsCell(t, news, cell, plain),
      cell('Bank holiday', plain(holidayText(t, news) ?? 'N/A'), holidayText(t, news) ? ' is-hol' : ' is-na')),
    open ? null : el('div', { class: 'td-mist' },
      el('span', { class: 'k' }, 'Mistakes'),
      mistakes == null ? el('span', { class: 'td-none' }, 'not asked')
        : mistakes.length ? el('span', { class: 'td-chips' }, ...MISTAKES.filter(([k]) => mistakes.includes(k)).map(([, n]) => el('span', { class: 'td-chip' }, n)))
        : el('span', { class: 'td-clean' }, 'None — a clean trade')));
}

/* The day's red folders, short: "USD - NFP". More than one → "+2 more",
   and a click opens them all, each with its time and full title. */
function newsCell(t, news, cell, plain) {
  const evs = dayRedFolders(t, news);
  if (!evs.length) return cell('News', plain(newsText(t, news) ?? 'N/A'), newsText(t, news) ? ' is-rf' : ' is-na');
  const full = e => [e.at ? localTime(e.at) : null, e.country, e.title].filter(Boolean).join(' · ');
  if (evs.length === 1) return cell('News', el('b', { title: full(evs[0]) }, newsLabel(evs[0])), ' is-rf');
  const list = el('div', { class: 'td-news-all', hidden: true },
    ...evs.map(e => el('div', { class: 'td-news-ev', title: full(e) }, el('span', { class: 't' }, e.at ? localTime(e.at) : ''), el('span', {}, newsLabel(e)))));
  const more = el('span', { class: 'td-news-more' }, `+${evs.length - 1} more`);
  const box = cell('News', el('b', {}, el('span', { class: 'td-news-one' }, newsLabel(evs[0])), more), ' is-rf is-many', {
    role: 'button', tabindex: 0, title: 'Every red folder that day',
    onClick: () => { list.hidden = !list.hidden; more.textContent = list.hidden ? `+${evs.length - 1} more` : 'less'; box.classList.toggle('is-open', !list.hidden); },
    onKeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); box.click(); } } });
  box.append(list);
  return box;
}
