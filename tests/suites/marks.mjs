/* Instrument marks (flags.js): a currency pair is two flags; anything that
   is not a currency is one disc of its own, whatever it is quoted in.

   Gold is gold only (TradingView's gold, white bars), silver silver only,
   the Nasdaq "100" on blue and the S&P 500 "500" on red as TradingView draws
   them, a coin its own letter. No mark has a ring round it. The forex flags are checked
   as two discs; that their drawings did not move is checked against the
   previous version by hand (HANDOVER, 2.34.0). */
import pw from 'playwright';

const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const PORT = process.env.QUIRE_PORT || 8777;

let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${n}${x !== '' ? ' — ' + x : ''}`); };

const b = await pw.chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://127.0.0.1:${PORT}/index.html`);
await p.waitForTimeout(500);

const kinds = await p.evaluate(async () => {
  const { instrumentOf } = await import('/js/flags.js');
  const out = {};
  for (const s of ['XAUUSD', 'XAUUSDm', 'GOLD', 'GC', 'MGCZ5', 'XAGUSD', 'SILVER', 'SI', 'NAS100', 'NQ', 'MNQH6', 'US100', 'USTEC', 'NDX',
    'SPX500', 'US500', 'SPX', 'ES', 'MESZ5', 'NAS100USD', 'NAS100_USD', 'SPX500USD', 'US30USD', 'DE30EUR', 'DXY', 'USDX', 'DXZ5', 'BTCUSD', 'ETHUSDT', 'XPTUSD', 'EURUSD', 'GBPJPY', 'USDCAD', '6E', 'US30', 'GER40', 'USOIL', 'CORN'])
    out[s] = instrumentOf(s);
  return out;
});
const is = (s, kind, base) => kinds[s].kind === kind && kinds[s].base === base;

t('XAUUSD is gold on its own, not gold and a dollar', is('XAUUSD', 'one', 'XAU'), JSON.stringify(kinds.XAUUSD));
t('…and so is every way of writing it (XAUUSDm, GOLD, GC, MGCZ5)', ['XAUUSDm', 'GOLD', 'GC', 'MGCZ5'].every(s => is(s, 'one', 'XAU')));
t('…its name still says what it is priced in', kinds.XAUUSD.name === 'Gold / U.S. Dollar', kinds.XAUUSD.name);
t('silver is silver on its own (XAGUSD, SILVER, SI)', ['XAGUSD', 'SILVER', 'SI'].every(s => is(s, 'one', 'XAG')));
t('the Nasdaq has its own mark (NAS100, NQ, MNQH6, US100, USTEC, NDX)', ['NAS100', 'NQ', 'MNQH6', 'US100', 'USTEC', 'NDX'].every(s => is(s, 'one', 'NDX')));
t('the S&P 500 has its own mark (SPX500, US500, SPX, ES, MESZ5)', ['SPX500', 'US500', 'SPX', 'ES', 'MESZ5'].every(s => is(s, 'one', 'SPX')));
t('an index with its currency on the end is still the index (NAS100USD, NAS100_USD, SPX500USD)',
  is('NAS100USD', 'one', 'NDX') && is('NAS100_USD', 'one', 'NDX') && is('SPX500USD', 'one', 'SPX'));
t('…and keeps its flag where it has one (US30USD, DE30EUR)', is('US30USD', 'one', 'USD') && is('DE30EUR', 'one', 'DE'));
t('the dollar index has its own mark (DXY, USDX, DXZ5)', ['DXY', 'USDX', 'DXZ5'].every(s => is(s, 'one', 'DXY')) && kinds.DXY.name === 'U.S. Dollar Index');
t('a coin is its coin on its own (BTCUSD, ETHUSDT)', is('BTCUSD', 'one', 'BTC') && is('ETHUSDT', 'one', 'ETH'));
t('platinum is a metal on its own too', is('XPTUSD', 'one', 'XPT'));
t('forex is still two flags (EURUSD, GBPJPY, USDCAD, 6E)',
  ['EURUSD', 'GBPJPY', 'USDCAD', '6E'].every(s => kinds[s].kind === 'pair') && kinds.EURUSD.base === 'EUR' && kinds.EURUSD.quote === 'USD');
t('the Dow and the DAX keep their flags, oil its drop', is('US30', 'one', 'USD') && is('GER40', 'one', 'DE') && is('USOIL', 'one', 'OIL'));
t('something unknown is letters', kinds.CORN.kind === 'none');

const dom = await p.evaluate(async () => {
  const { pairMark, pairLabel } = await import('/js/flags.js');
  const host = document.createElement('div'); document.body.append(host);
  const look = s => {
    const m = pairMark(s, 40); host.append(m);
    const d = [...m.querySelectorAll('.pm-disc')];
    const svg = d[0]?.querySelector('svg')?.innerHTML || '';
    return { discs: d.length, one: d[0]?.classList.contains('is-one'), g: d[0]?.dataset.g || '', text: m.textContent,
      weight: d[0]?.style.getPropertyValue('--g-weight') || '', svg, before: d[0] ? getComputedStyle(d[0], '::before').content : '' };
  };
  const got = { xau: look('XAUUSD'), xag: look('XAGUSD'), nas: look('NAS100'), spx: look('SPX500'), eur: look('EURUSD') };
  const rings = [...host.querySelectorAll('.pm-disc')].map(d => getComputedStyle(d).boxShadow);
  const q = host.querySelector('.pm-disc.is-quote');
  const cut = q ? (getComputedStyle(q).maskImage || getComputedStyle(q).webkitMaskImage || '') : '';
  return { ...got, rings, cut,
    label: pairLabel('SPX500', { named: true }).textContent };
});
t('gold: one disc in TradingView\'s gold, three white bars, no flag', dom.xau.discs === 1 && dom.xau.one && /#D69A00/.test(dom.xau.svg) && /fill="#FFFFFF"/.test(dom.xau.svg) && (dom.xau.svg.match(/<polygon/g) || []).length === 3 && !/#B22234/.test(dom.xau.svg));
t('silver: one disc, silver, three bars', dom.xag.discs === 1 && /#A7ADB4/.test(dom.xag.svg) && (dom.xag.svg.match(/<polygon/g) || []).length === 3);
t('the Nasdaq: one blue disc, 100 written on it in heavy white', dom.nas.discs === 1 && /#0091BA/.test(dom.nas.svg) && dom.nas.g === '100' && dom.nas.weight === '800' && dom.nas.before === '"100"');
t('the S&P: one red disc, 500 written on it in heavy white', dom.spx.discs === 1 && /#C4162E/.test(dom.spx.svg) && dom.spx.g === '500' && dom.spx.weight === '800' && dom.spx.before === '"500"');
t('no ring round any mark', dom.rings.every(r => r === 'none'), JSON.stringify(dom.rings));
t('a pair\'s quote is cut away where the base overlaps it, not ringed', /radial-gradient/.test(dom.cut));
t('…written by CSS, so the row still reads as just the symbol', dom.spx.text === '' && dom.label === 'SPX500S&P 500', JSON.stringify(dom.label));
t('EURUSD is still two discs', dom.eur.discs === 2);

const parts = await p.evaluate(async () => {
  const { markParts } = await import('/js/flags.js');
  return { spx: markParts('SPX500'), xau: markParts('XAUUSD'), btc: markParts('BTCUSD') };
});
t('the share card gets one disc for gold', parts.xau.kind === 'one' && parts.xau.discs.length === 1 && /D69A00/.test(parts.xau.discs[0].svg));
t('…and the 500 with its weight for the S&P', parts.spx.discs[0].glyph === '500' && parts.spx.discs[0].weight === 800 && parts.spx.discs[0].track < 0);
t('…and the coin alone for BTCUSD', parts.btc.kind === 'one' && parts.btc.discs[0].glyph === '₿');

/* gold and silver: the stack of bars sits in the middle of the disc, like TradingView's gold */
const mid = await p.evaluate(async () => {
  const { pairMark } = await import('/js/flags.js');
  return ['XAUUSD', 'XAGUSD'].map(sym => {
    const m = pairMark(sym, 60); document.body.append(m);
    const disc = m.querySelector('svg').getBoundingClientRect(), g = m.querySelector('svg g').getBoundingClientRect();
    const out = [(g.left + g.right) / 2 - (disc.left + disc.right) / 2, (g.top + g.bottom) / 2 - (disc.top + disc.bottom) / 2].map(v => Math.round(v * 10) / 10);
    m.remove(); return out;
  });
});
t('gold and silver bars are centred on the disc', mid.every(([dx, dy]) => Math.abs(dx) < 1 && Math.abs(dy) < 1), JSON.stringify(mid));

t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
