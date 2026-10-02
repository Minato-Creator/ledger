/* ============================================================
   Ghost — you, with a rule you did not keep.

   A page inside The Lab. Pick a rule on the left and your own trades are
   replayed keeping it: the ghost's equity line is drawn against yours, the
   space between them green where the rule would have helped and red where
   it would have cost you. Nothing is simulated — the ghost only ever takes
   trades you really took, at the result you really got — except for "leave
   trades to TP", which counts a trade you cut short at what you said it
   would have made if held.

   Every figure is the ghost's, with yours beside it. The luck test asks
   whether leaving out that many trades at random would have done as well,
   because a rule found by looking back is easy to fool yourself with.
   ============================================================ */
import { el, svg, icon, fitted } from '../ui.js';
import * as c from '../calc.js';
import * as G from '../ghost.js';
import { ticks, hoverLayer, readRow } from './chartkit.js';
import { EXEC_TFS as TF_ORDER, NEWS } from '../questions.js';

const rFmt = (v, d = 1) => c.rFmt(v, d);
let suggestCache = null;   // { sig, list }

export function ghostPage(ctx) {
  const { acct, state, save, pick, store } = ctx;
  if (!state.ghost || typeof state.ghost !== 'object') state.ghost = G.blankRules();
  const R = state.ghost;

  const { rows, skipped: noR } = G.rowsFrom(acct, pick());
  const pb = store.playbook;
  const names = {
    sessions: Object.fromEntries((pb.sessions || []).map(s => [s.id, s.name])),
    setups: Object.fromEntries((pb.setups || []).map(s => [s.id, s.name])),
    tags: Object.fromEntries((pb.tagGroups || []).flatMap(g => g.tags).map(t => [t.id, t.name])),
  };

  const rail = el('section', { class: 'card gh-rail' });
  const main = el('div', { class: 'gh-main' });
  const strip = el('div', { class: 'lab-strip' });

  const head = ctx.head('ghost');

  if (rows.length < 10) {
    strip.replaceChildren(el('span', { class: 'i' }, el('b', {}, String(rows.length)), 'trades'));
    return el('div', { class: 'view lab-view' }, head, strip,
      el('div', { class: 'lab-body' }, el('section', { class: 'card lab-prompt' },
        icon('lab', 28, 'var(--grey-6)', 1.4),
        el('h2', {}, 'Not enough trades yet'),
        el('p', {}, `The ghost needs at least 10 trades to replay — there ${rows.length === 1 ? 'is' : 'are'} ${rows.length}.`))));
  }

  const changed = () => { save(); paintRail(); paintMain(); };

  /* ---------- the rules ---------- */
  function paintRail() {
    const keep = rail.querySelector('.gh-scroll')?.scrollTop || 0;
    const count = pred => rows.filter(pred).length;

    const stepRule = (key, def, min, max, step, text) => {
      const on = R[key] != null;
      const v = on ? R[key] : def;
      return el('div', { class: 'gh-rule' + (on ? ' is-on' : '') },
        el('button', { type: 'button', class: 'gh-toggle', 'aria-pressed': String(on),
          onClick: () => { R[key] = on ? null : def; changed(); } },
          el('span', { class: 'tick' + (on ? ' is-on' : '') }, on ? icon('check', 11, '#fff', 3) : null),
          el('span', { class: 't' }, text(v))),
        on ? el('div', { class: 'stepper gh-step' },
          el('button', { 'aria-label': 'Less', onClick: () => { R[key] = Math.max(min, +(v - step).toFixed(2)); changed(); } }, icon('minus', 10, 'var(--grey-2)', 2.6)),
          el('span', { class: 'val' }, String(v)),
          el('button', { 'aria-label': 'More', onClick: () => { R[key] = Math.min(max, +(v + step).toFixed(2)); changed(); } }, icon('plus', 10, 'var(--grey-2)', 2.6)))
          : null);
    };
    const flag = (key, text) => {
      const on = !!R[key];
      return el('div', { class: 'gh-rule' + (on ? ' is-on' : '') },
        el('button', { type: 'button', class: 'gh-toggle', 'aria-pressed': String(on), onClick: () => { R[key] = !on; changed(); } },
          el('span', { class: 'tick' + (on ? ' is-on' : '') }, on ? icon('check', 11, '#fff', 3) : null),
          el('span', { class: 't' }, text)));
    };
    const chips = (title, key, options) => options.length ? el('div', { class: 'gh-chips' },
      el('span', { class: 'k' }, title),
      el('div', { class: 'gh-chipset' }, ...options.map(([v, label, n]) => {
        const on = (R[key] || []).includes(v);
        return el('button', { type: 'button', class: 'gh-chip' + (on ? ' is-on' : ''), title: `${n} trade${n === 1 ? '' : 's'}`,
          'aria-pressed': String(on),
          onClick: () => {
            const set = new Set(R[key] || []);
            on ? set.delete(v) : set.add(v);
            R[key] = [...set]; changed();
          } }, label);
      }))) : null;

    const present = (key, labelOf) => {
      const m = new Map();
      for (const x of rows) if (x[key] != null) m.set(x[key], (m.get(x[key]) || 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => [v, labelOf(v), n]);
    };
    const days = G.DAYS.map((d, i) => [i, d, count(x => x.dow === i)]).filter(([, , n]) => n > 0);
    const tagCounts = new Map();
    for (const x of rows) for (const id of x.tags) tagCounts.set(id, (tagCounts.get(id) || 0) + 1);
    const tags = [...tagCounts.entries()].filter(([id]) => names.tags[id]).sort((a, b) => b[1] - a[1])
      .map(([id, n]) => [id, names.tags[id], n]);

    const rated = count(x => x.confidence != null);
    const heldN = count(x => x.held);

    const sig = JSON.stringify([ctx.state.source, acct.id, rows.length, rows.reduce((a, x) => a + x.r, 0).toFixed(6)]);
    if (!suggestCache || suggestCache.sig !== sig) suggestCache = { sig, list: G.suggest(rows, pb, { names }) };
    const apply = patch => {
      for (const [k, v] of Object.entries(patch)) R[k] = Array.isArray(v) ? [...new Set([...(R[k] || []), ...v])] : v;
      changed();
    };
    const active = Object.entries(R).some(([, v]) => (Array.isArray(v) ? v.length : v != null && v !== false));

    rail.replaceChildren(
      el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Rules'),
        active ? el('button', { class: 'gh-reset', onClick: () => { Object.assign(R, G.blankRules()); changed(); } }, 'Clear') : null),
      el('div', { class: 'gh-scroll' },
        suggestCache.list.length ? el('div', { class: 'gh-sugs' },
          el('span', { class: 'k' }, 'Worth a look'),
          ...suggestCache.list.map(sg => el('button', { type: 'button', class: 'gh-sug', onClick: () => apply(sg.patch),
            title: `Leaves out ${sg.skipped} trades. Beats ${Math.round((sg.luck ?? 0) * 100)}% of random skips of the same size.` },
            el('span', { class: 't' }, sg.label),
            el('b', {}, rFmt(sg.delta)),
            el('span', { class: 'gh-luck' + ((sg.luck ?? 0) >= 0.95 ? ' is-strong' : (sg.luck ?? 0) >= 0.8 ? '' : ' is-weak') },
              `${Math.round((sg.luck ?? 0) * 100)}%`)))) : null,
        el('span', { class: 'k gh-sec' }, 'Each day'),
        stepRule('lossesPerDay', 2, 1, 10, 1, v => `Stop after ${v} loss${v === 1 ? '' : 'es'}`),
        stepRule('dayLossR', 2, 0.5, 10, 0.5, v => `Stop at −${v}R`),
        stepRule('dayWinR', 3, 0.5, 20, 0.5, v => `Stop at +${v}R`),
        stepRule('maxTrades', 2, 1, 20, 1, v => `Max ${v} trade${v === 1 ? '' : 's'}`),
        flag('afterLoss', 'Skip the trade after a loss'),
        el('span', { class: 'k gh-sec' }, 'Which trades'),
        chips('Skip days', 'skipDays', days),
        chips('Only sessions', 'sessions', present('session', v => names.sessions[v] || 'Session')),
        chips('Only setups', 'setups', present('setup', v => names.setups[v] || 'Setup')),
        chips('Only instruments', 'pairs', present('pair', v => v)),
        chips('Skip tags', 'skipTags', tags),
        chips('Only tags', 'onlyTags', tags),
        el('span', { class: 'k gh-sec' }, 'How you traded'),
        rated ? stepRule('minConfidence', 4, 1, 5, 1, v => `Only confidence ${v}+`) : null,
        rated ? el('span', { class: 'gh-note' }, `${rated} of ${rows.length} trades rated · the rest are left out`) : null,
        chips('Only timeframes', 'tfs', present('tf', v => v).sort((a, b) => TF_ORDER.indexOf(a[0]) - TF_ORDER.indexOf(b[0]))),
        chips('Skip news timing', 'skipNews', present('news', v => (NEWS.find(([k]) => k === v) || [])[1] || v)
          .sort((a, b) => NEWS.findIndex(([k]) => k === a[0]) - NEWS.findIndex(([k]) => k === b[0]))),
        count(x => x.holiday) ? flag('skipHolidays', `Skip bank holidays · ${count(x => x.holiday)}`) : null,
        heldN ? flag('holdToTarget', 'Leave trades to TP') : null,
        heldN ? el('span', { class: 'gh-note' }, `${heldN} trade${heldN === 1 ? '' : 's'} cut short, counted at what you said ${heldN === 1 ? 'it' : 'they'} would have made if held`) : null,
        !rated && !heldN && !rows.some(x => x.tf || x.news) ? el('span', { class: 'gh-note' }, 'Confidence, timeframe, news and “if held” come from New trade — answer them on a few trades and they show up here.') : null));
    const sc = rail.querySelector('.gh-scroll');
    if (sc) sc.scrollTop = keep;
  }

  /* ---------- the answer ---------- */
  function paintMain() {
    const out = G.run(rows, R);
    const { real, ghost } = out;
    strip.replaceChildren(...[
      el('span', { class: 'i' }, el('b', {}, String(rows.length)), 'trades'),
      el('span', { class: 'i' }, el('b', {}, rFmt(real.net)), 'you'),
      noR ? el('span', { class: 'i is-warn', title: 'Live trades with no risk set have no R' }, `${noR} left out`) : null,
    ].filter(Boolean));

    const delta = (g, r, { better = 'up', fmt = v => rFmt(v) } = {}) => {
      if (g == null || r == null) return null;
      const d = g - r;
      if (Math.abs(d) < 1e-9) return el('span', { class: 'd' }, 'same');
      const good = better === 'up' ? d > 0 : d < 0;
      return el('span', { class: 'd ' + (good ? 'is-pos' : 'is-neg') }, `${d > 0 ? '+' : '−'}${fmt(Math.abs(d)).replace(/^[+−]/, '')}`);
    };
    /* Yours on one line, the difference on the next — both stay whole on a
       laptop screen, where six tiles share the width. */
    const tile = (label, value, realText, d, cls = '') => el('div', { class: 'lab-tile gh-tile' + cls },
      el('span', { class: 'k' }, label), el('span', { class: 'v' }, value),
      el('span', { class: 's' }, realText), d || el('span', { class: 'd' }, ' '));
    const pts = v => `${Math.round(v * 100)} pts`;
    const L = out.luck;

    const tiles = el('div', { class: 'gh-tiles' },
      tile('Net', rFmt(ghost.net), `you ${rFmt(real.net)}`, delta(ghost.net, real.net), ghost.net > 0 ? ' is-pos' : ghost.net < 0 ? ' is-neg' : ''),
      tile('Win rate', ghost.winRate == null ? '—' : c.pct(ghost.winRate, 0), `you ${real.winRate == null ? '—' : c.pct(real.winRate, 0)}`,
        ghost.winRate != null && real.winRate != null ? delta(ghost.winRate, real.winRate, { fmt: pts }) : null),
      tile('Per trade', rFmt(ghost.perTrade, 2), `you ${rFmt(real.perTrade, 2)}`, delta(ghost.perTrade, real.perTrade, { fmt: v => rFmt(v, 2) })),
      tile('Max drawdown', rFmt(-ghost.drawdown), `you ${rFmt(-real.drawdown)}`, delta(ghost.drawdown, real.drawdown, { better: 'down' })),
      tile('Trades', String(ghost.trades), `of ${real.trades}${ghost.held ? ` · ${ghost.held} held` : ''}`, ghost.skipped ? el('span', { class: 'd' }, `${ghost.skipped} skipped`) : null),
      el('div', { class: 'lab-tile gh-tile gh-luck-tile' + (L == null ? '' : L >= 0.95 ? ' is-strong' : L < 0.8 ? ' is-weak' : ''),
        title: 'How often leaving out the same number of trades at random would have done worse. Around 50% is what luck alone does.' },
        el('span', { class: 'k' }, 'Luck test'),
        el('span', { class: 'v' }, L == null ? '—' : `${Math.round(L * 100)}%`),
        el('span', { class: 's' }, L == null ? 'no rule yet' : L >= 0.95 ? 'unlikely to be luck' : L >= 0.8 ? 'promising' : 'could be luck')));

    const chart = el('section', { class: 'card lab-chart gh-chart' },
      el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Equity'),
        el('span', { class: 'lab-sub' }, 'R, trade by trade'),
        el('span', { class: 'lab-legend' }, el('i', { class: 'is-real' }), 'You', el('i', { class: 'is-ghost' }), 'Ghost')),
      fitted((w, h) => drawEquity(rows, out, w, h), 260));

    const fx = out.effects;
    const effectsCard = el('section', { class: 'card lab-chart gh-effects' },
      el('div', { class: 'lab-chart-head' }, el('h2', {}, 'Each rule alone')),
      fx.length
        ? el('div', { class: 'gh-fx' }, ...(() => {
            const peak = Math.max(0.01, ...fx.map(f => Math.abs(f.delta)));
            return fx.map(f => el('div', { class: 'gh-fxrow' },
              el('span', { class: 'l' }, f.label),
              el('span', { class: 'n' }, f.note || `${f.skipped} skipped`),
              el('span', { class: 'bar' },
                el('i', { class: f.delta >= 0 ? 'is-pos' : 'is-neg',
                  style: { width: (Math.abs(f.delta) / peak * 50).toFixed(1) + '%', [f.delta >= 0 ? 'left' : 'right']: '50%' } })),
              el('b', { class: f.delta > 0 ? 'is-pos' : f.delta < 0 ? 'is-neg' : '' }, rFmt(f.delta))));
          })())
        : el('p', { class: 'lab-empty' }, 'Pick a rule on the left.'));

    main.replaceChildren(tiles, chart, effectsCard);
  }

  paintRail();
  paintMain();
  return el('div', { class: 'view lab-view' }, head, strip, el('div', { class: 'gh-cols' }, rail, main));
}

/* Your line and the ghost's, on one axis. The space between them is filled
   in the profit colour where the ghost is ahead and the loss colour where it
   is behind — the fill is clipped to either side of your line, so it changes
   colour exactly where the two cross. */
function drawEquity(rows, out, W, H) {
  const wrap = el('div', { class: 'lab-svgwrap' });
  const n = rows.length;
  const real = out.real.curve, ghost = out.ghost.curve;
  const plot = { l: 48, r: W - 14, t: 12, b: H - 24 };
  let lo = 0, hi = 0;
  for (let i = 0; i < n; i++) { lo = Math.min(lo, real[i], ghost[i]); hi = Math.max(hi, real[i], ghost[i]); }
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const X = i => plot.l + ((i + 1) / n) * (plot.r - plot.l);
  const Y = v => plot.b - ((v - lo) / (hi - lo)) * (plot.b - plot.t);

  const g = svg('svg', { class: 'lab-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const id = Math.random().toString(36).slice(2, 7);
  const line = arr => `M${plot.l},${Y(0).toFixed(1)}` + arr.map((v, i) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const realPath = line(real), ghostPath = line(ghost);
  const back = real.map((v, i) => [X(i), Y(v)]).reverse().map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join('') + `L${plot.l},${Y(0).toFixed(1)}Z`;
  const between = ghostPath + back;
  g.append(svg('defs', {},
    svg('clipPath', { id: 'up' + id }, svg('path', { d: `${realPath}L${plot.r},${plot.t - 20}L${plot.l},${plot.t - 20}Z` })),
    svg('clipPath', { id: 'dn' + id }, svg('path', { d: `${realPath}L${plot.r},${plot.b + 20}L${plot.l},${plot.b + 20}Z` }))));

  for (const v of ticks(lo, hi, 5)) {
    g.append(svg('line', { class: v === 0 ? 'lab-zero' : 'lab-grid', x1: plot.l, x2: plot.r, y1: Y(v), y2: Y(v) }));
    g.append(svg('text', { class: 'lab-tick', x: plot.l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, rFmt(v, 0)));
  }
  /* Dates along the bottom: the first trade of a handful of evenly spaced days. */
  const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) {
    g.append(svg('text', { class: 'lab-tick', x: X(i), y: plot.b + 16, 'text-anchor': 'middle' }, c.shortDate(rows[i].date)));
  }

  g.append(svg('path', { class: 'gh-fill is-pos', d: between, 'clip-path': `url(#up${id})` }));
  g.append(svg('path', { class: 'gh-fill is-neg', d: between, 'clip-path': `url(#dn${id})` }));
  g.append(svg('path', { class: 'gh-line is-real', d: realPath }));
  g.append(svg('path', { class: 'gh-line is-ghost', d: ghostPath }));
  g.append(svg('circle', { class: 'gh-end is-real', cx: X(n - 1), cy: Y(real[n - 1]), r: 3.5 }));
  g.append(svg('circle', { class: 'gh-end is-ghost', cx: X(n - 1), cy: Y(ghost[n - 1]), r: 4 }));

  hoverLayer(wrap, g, plot, x => {
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - plot.l) / (plot.r - plot.l)) * n) - 1));
    const d = ghost[i] - real[i];
    return { x: X(i), y: Y(ghost[i]), rows: [
      el('div', { class: 'h' }, `${c.shortDate(rows[i].date)} · trade ${i + 1}${out.take[i] ? '' : ' · skipped'}`),
      readRow('is-ghost', rFmt(ghost[i]), 'ghost'),
      readRow('is-real', rFmt(real[i]), 'you'),
      readRow(null, `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}R`, 'difference')] };
  });
  wrap.prepend(g);
  return wrap;
}
