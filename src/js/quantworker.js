/* ============================================================
   quantworker.js — Quant's backtests, off the page's own thread.

   A run walks every one-minute candle of two years and takes seconds; on
   the page's thread that freezes scrolling, clicks and the charts while it
   works. Here it runs beside the page instead.

     • 'rows'  — the page's two years, once, as one flat Float64Array
                 (t, o, h, l, c per candle) handed over without a copy
     • 'run'   — one version on those rows: quant.js (Version 3 and his
                 copies of it) or quant13.js (Version 1 / 2); the structure
                 quant13 builds is kept for the next run on the same rows
     • 'chunk' — the 10-year card: one year of one pair (with its warm-up),
                 every version on it, the trades kept small (quant10.js)
   ============================================================ */
import { backtest } from './quant.js';
import { prepare13, run13 } from './quant13.js';
import { runChunk } from './quant10.js';

let rows = null, P = null;
const unflat = f => { const n = f.length / 5, out = new Array(n); for (let i = 0, k = 0; i < n; i++, k += 5) out[i] = [f[k], f[k + 1], f[k + 2], f[k + 3], f[k + 4]]; return out; };
const trim = R => ({ trades: R.trades, signals: R.signals, skipped: R.skipped, from: R.from, to: R.to });

self.onmessage = e => {
  const m = e.data || {};
  try {
    if (m.type === 'rows') {
      rows = unflat(m.flat); P = null;
      self.postMessage({ id: m.id, ok: true });
    } else if (m.type === 'run') {
      if (!rows) throw new Error('no prices yet');
      const { engine, inst, ...opts } = m.opts;
      if (engine === '13') { P ??= prepare13(rows); self.postMessage({ id: m.id, R: trim(run13(P, inst, opts)) }); }
      else self.postMessage({ id: m.id, R: trim(backtest(rows, { inst, ...opts })) });
    } else if (m.type === 'chunk') {
      const out = runChunk(unflat(m.flat), m.inst, m.jobs, m.keepFrom, m.keepTo);
      self.postMessage({ id: m.id, out });
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: String((err && err.message) || err) });
  }
};
