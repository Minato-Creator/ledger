/* ============================================================
   chartshot.js — a trade's chart, as a picture.

   The same chart the trade's own page shows (tradechart.js: OANDA's
   candles for the day, the entry, the stop, the target and the exit, the
   position drawn on it with its labels), drawn once off the page and
   handed back as a PNG — for a note to keep (noteedit.js).

   It needs what the chart needs: an instrument OANDA has prices for, and
   the key in Settings. Without either it says so instead.
   ============================================================ */
import { el } from '../ui.js';
import * as c from '../calc.js';
import * as cd from '../candles.js';
import { tradeChart } from './tradechart.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

/** Can this trade's chart be drawn at all? (an instrument OANDA knows) */
export const hasChart = t => !!(t && t.pair && cd.oandaInstrument(t.pair));

/** @returns {Promise<File>} a PNG of the trade's chart */
export async function tradeChartPicture(store, nav, t, { width = 1240, height = 600 } = {}) {
  if (!hasChart(t)) throw new Error('There are no prices for ' + (t?.pair || 'this trade'));
  const host = el('div', { 'aria-hidden': 'true', style: { position: 'fixed', left: '-20000px', top: '0', width: width + 'px', pointerEvents: 'none' } });
  document.body.append(host);
  try {
    const card = tradeChart(store, nav, t, { minimal: true, position: true, labels: true, clear: true, height });
    host.append(card);
    const began = Date.now();
    while (!(card.__chart && card.__chart.bars > 0)) {
      const took = Date.now() - began;
      /* nothing being drawn after a moment: no key, or no prices for that day */
      if (took > 2500 && !card.querySelector('canvas.tc-canvas')) throw new Error(card.innerText.trim().split('\n').pop() || 'The chart could not be drawn');
      if (took > 20000) throw new Error('The prices for this trade did not arrive');
      await wait(120);
    }
    await wait(450);                                   // the candles in, the position on, drawn
    const src = card.querySelector('canvas.tc-canvas');
    if (!src || !src.width) throw new Error('The chart could not be drawn');
    const k = src.width / (src.getBoundingClientRect().width || src.width);
    const head = Math.round(46 * k);
    const out = el('canvas', { width: src.width, height: src.height + head });
    const g = out.getContext('2d');
    /* nothing behind it: the note's own page shows through */
    g.drawImage(src, 0, head);
    /* a line saying what it is: the pair, the day, the result */
    const ink = getComputedStyle(card).color || '#F4F4F6';
    const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillStyle = ink; g.font = `600 ${15 * k}px ${font}`;
    g.fillText(t.pair, 16 * k, head / 2);
    const w = g.measureText(t.pair).width;
    g.globalAlpha = 0.62; g.font = `500 ${12.5 * k}px ${font}`;
    const side = t.side === 'sell' ? 'Short' : t.side === 'buy' ? 'Long' : '';
    g.fillText([side, t.date ? c.longDate(t.date) : ''].filter(Boolean).join(' · '), 16 * k + w + 12 * k, head / 2);
    g.globalAlpha = 1;
    const blob = await new Promise(res => out.toBlob(res, 'image/png'));
    if (!blob) throw new Error('The chart could not be made into a picture');
    return new File([blob], `${t.pair}-${t.date || 'chart'}.png`, { type: 'image/png' });
  } finally {
    host.remove();
  }
}
