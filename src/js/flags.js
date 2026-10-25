/* ============================================================
   flags.js — a mark for every instrument, the way a chart platform shows
   them: a currency pair is its two flags as overlapping discs, the base in
   front at the lower left and the quote behind it at the upper right.
   Anything that is not a currency is one disc of its own, whatever it is
   quoted in — XAUUSD is gold, not gold and a dollar:
     metals   a stack of three bars on the metal's colour
     Nasdaq   100 in white on blue
     S&P 500  500 in white on red
     DXY      a $ on green
     coins    the coin's letter on its colour
     indices  the flag of their market; oil a drop; gas a flame.

   Everything is drawn here as plain shapes on a 30 × 30 square, cropped to
   a circle where it is shown. Nothing is fetched, so it works offline, in
   the desktop app and in the single-file build alike.
   ============================================================ */
import { el } from './ui.js';

/* ---------- a few shapes ---------- */
const star = (cx, cy, r, fill, inner = 0.42, stroke = '') => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * inner : r;
    p.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${p.join(' ')}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width=".7" paint-order="stroke"` : ''}/>`;
};
/** The Union flag on a square of side s at (x, y). */
const union = (x = 0, y = 0, s = 30) => {
  const k = s / 30;
  return `<g transform="translate(${x} ${y}) scale(${k})">
    <rect width="30" height="30" fill="#012169"/>
    <path d="M0 0L30 30M30 0L0 30" stroke="#fff" stroke-width="6"/>
    <path d="M0 0L30 30M30 0L0 30" stroke="#C8102E" stroke-width="2"/>
    <path d="M15 0V30M0 15H30" stroke="#fff" stroke-width="10"/>
    <path d="M15 0V30M0 15H30" stroke="#C8102E" stroke-width="6"/></g>`;
};
const stripesH = cols => cols.map((c, i) => `<rect y="${(30 / cols.length) * i}" width="30" height="${30 / cols.length + .2}" fill="${c}"/>`).join('');
const stripesV = cols => cols.map((c, i) => `<rect x="${(30 / cols.length) * i}" width="${30 / cols.length + .2}" height="30" fill="${c}"/>`).join('');

/* ---------- the flags ---------- */
const FLAG = {
  USD: () => {
    let s = '';
    for (let i = 0; i < 13; i++) s += `<rect y="${(i * 30 / 13).toFixed(2)}" width="30" height="${(30 / 13 + .1).toFixed(2)}" fill="${i % 2 ? '#fff' : '#B22234'}"/>`;
    s += '<rect width="16" height="16.2" fill="#3C3B6E"/>';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s += `<circle cx="${2.6 + c * 3.6 + (r % 2) * 1.8}" cy="${2.4 + r * 3.7}" r=".85" fill="#fff"/>`;
    return s;
  },
  EUR: () => {
    let s = '<rect width="30" height="30" fill="#003399"/>';
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; s += star(15 + 8.6 * Math.sin(a), 15 - 8.6 * Math.cos(a), 1.75, '#FFCC00'); }
    return s;
  },
  GBP: () => union(),
  JPY: () => '<rect width="30" height="30" fill="#fff"/><circle cx="15" cy="15" r="7.6" fill="#BC002D"/>',
  AUD: () => '<rect width="30" height="30" fill="#012169"/>' + union(0, 0, 15) + star(7.5, 23, 3.3, '#fff', .45)
    + star(22.5, 6.5, 1.7, '#fff') + star(18.5, 14, 1.7, '#fff') + star(26, 12.5, 1.6, '#fff') + star(22.5, 24.5, 1.9, '#fff') + star(25, 18.5, .9, '#fff'),
  NZD: () => '<rect width="30" height="30" fill="#012169"/>' + union(0, 0, 15)
    + star(22.5, 6.5, 2.1, '#C8102E', .42, '#fff') + star(18.5, 14, 2.1, '#C8102E', .42, '#fff') + star(26, 12.5, 1.8, '#C8102E', .42, '#fff') + star(22.5, 24, 2.4, '#C8102E', .42, '#fff'),
  CAD: () => '<rect width="30" height="30" fill="#fff"/><rect width="7.5" height="30" fill="#D80621"/><rect x="22.5" width="7.5" height="30" fill="#D80621"/>'
    + '<polygon fill="#D80621" points="15,6.5 16.6,9.4 18.3,8.6 17.6,12.6 20.5,10.6 21,12 23,11.6 22.2,14.3 23.4,15 19.6,18.2 20.2,19.6 16,19 15.4,23.5 14.6,23.5 14,19 9.8,19.6 10.4,18.2 6.6,15 7.8,14.3 7,11.6 9,12 9.5,10.6 12.4,12.6 11.7,8.6 13.4,9.4"/>',
  CHF: () => '<rect width="30" height="30" fill="#DA291C"/><rect x="12.4" y="6" width="5.2" height="18" fill="#fff"/><rect x="6" y="12.4" width="18" height="5.2" fill="#fff"/>',
  CNY: () => '<rect width="30" height="30" fill="#EE1C25"/>' + star(9, 9.5, 4.6, '#FFDE00') + star(16, 4.6, 1.5, '#FFDE00') + star(19, 8, 1.5, '#FFDE00') + star(19, 12.5, 1.5, '#FFDE00') + star(16, 15.6, 1.5, '#FFDE00'),
  HKD: () => {
    let s = '<rect width="30" height="30" fill="#DE2910"/>';
    for (let i = 0; i < 5; i++) s += `<ellipse cx="15" cy="10.3" rx="2.5" ry="4.6" fill="#fff" transform="rotate(${i * 72} 15 15)"/>`;
    return s;
  },
  SGD: () => '<rect width="30" height="15" fill="#EF3340"/><rect y="15" width="30" height="15" fill="#fff"/>'
    + '<circle cx="9" cy="8" r="4.4" fill="#fff"/><circle cx="10.6" cy="8" r="4" fill="#EF3340"/>'
    + [0, 1, 2, 3, 4].map(i => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return star(14 + 2.6 * Math.cos(a), 8 + 2.6 * Math.sin(a), .95, '#fff'); }).join(''),
  SEK: () => '<rect width="30" height="30" fill="#006AA7"/><rect x="8.5" width="5" height="30" fill="#FECC02"/><rect y="12.5" width="30" height="5" fill="#FECC02"/>',
  NOK: () => '<rect width="30" height="30" fill="#BA0C2F"/><rect x="7" width="8" height="30" fill="#fff"/><rect y="11" width="30" height="8" fill="#fff"/><rect x="9" width="4" height="30" fill="#00205B"/><rect y="13" width="30" height="4" fill="#00205B"/>',
  DKK: () => '<rect width="30" height="30" fill="#C8102E"/><rect x="8.5" width="4.2" height="30" fill="#fff"/><rect y="12.9" width="30" height="4.2" fill="#fff"/>',
  MXN: () => stripesV(['#006847', '#fff', '#CE1126']) + '<circle cx="15" cy="15" r="3.2" fill="#8C5A3C"/><path d="M12.4 17.2q2.6 2 5.2 0" stroke="#1E7A3A" stroke-width="1" fill="none"/>',
  ZAR: () => '<rect width="30" height="15" fill="#E03C31"/><rect y="15" width="30" height="15" fill="#001489"/>'
    + '<polygon points="0,0 5,0 16,10.5 30,10.5 30,19.5 16,19.5 5,30 0,30" fill="#fff"/>'
    + '<polygon points="0,3 13.5,12.8 30,12.8 30,17.2 13.5,17.2 0,27" fill="#007749"/>'
    + '<polygon points="0,5.5 11,15 0,24.5" fill="#FFB81C"/><polygon points="0,8 8,15 0,22" fill="#000"/>',
  TRY: () => '<rect width="30" height="30" fill="#E30A17"/><circle cx="12.5" cy="15" r="7" fill="#fff"/><circle cx="14.3" cy="15" r="5.6" fill="#E30A17"/>' + star(20.3, 15, 2.7, '#fff'),
  PLN: () => stripesH(['#fff', '#DC143C']),
  INR: () => stripesH(['#FF9933', '#fff', '#138808']) + '<circle cx="15" cy="15" r="3.6" fill="none" stroke="#000080" stroke-width=".9"/><circle cx="15" cy="15" r=".9" fill="#000080"/>',
  BRL: () => '<rect width="30" height="30" fill="#009C3B"/><polygon points="15,4 28,15 15,26 2,15" fill="#FFDF00"/><circle cx="15" cy="15" r="6" fill="#002776"/><path d="M9.3 13.6q5.7-1.6 11.4 1.6" stroke="#fff" stroke-width="1" fill="none"/>',
  KRW: () => '<rect width="30" height="30" fill="#fff"/><path d="M8.5 15a6.5 6.5 0 0 1 13 0z" fill="#CD2E3A"/><path d="M8.5 15a6.5 6.5 0 0 0 13 0z" fill="#0047A0"/><circle cx="11.75" cy="15" r="3.25" fill="#CD2E3A"/><circle cx="18.25" cy="15" r="3.25" fill="#0047A0"/>',
  /* the markets of the big indices */
  DE: () => stripesH(['#000', '#DD0000', '#FFCE00']),
  FR: () => stripesV(['#0055A4', '#fff', '#EF4135']),
  IT: () => stripesV(['#009246', '#fff', '#CE2B37']),
  ES: () => '<rect width="30" height="30" fill="#AA151B"/><rect y="7.5" width="30" height="15" fill="#F1BF00"/>',
  NL: () => stripesH(['#AE1C28', '#fff', '#21468B']),
};
FLAG.CNH = FLAG.CNY;
const MARKET = { US: 'USD', GB: 'GBP', JP: 'JPY', AU: 'AUD', HK: 'HKD', EU: 'EUR', CN: 'CNY', CA: 'CAD', CH: 'CHF' };

/* ---------- metals, indices, energy, coins ---------- */
/* Three bars stacked two-and-one on the metal's own colour, in the middle
   of the mark the way TradingView's gold sits (the stack is 11.2 tall, so it
   is lifted to run from 9.4 to 20.6 around the centre at 15). */
const bars = (bg, ink, o = .9) => `<rect width="30" height="30" fill="${bg}"/>
  <g transform="translate(0 -2.3)" fill="${ink}" fill-opacity="${o}" stroke="${ink}" stroke-opacity="${o}" stroke-width=".5" stroke-linejoin="round">
  <polygon points="5.2,22.9 14.6,22.9 12.8,17.9 7,17.9"/>
  <polygon points="15.4,22.9 24.8,22.9 23,17.9 17.2,17.9"/>
  <polygon points="10.3,16.7 19.7,16.7 17.9,11.7 12.1,11.7"/></g>`;
/* A coin's letter (or an index's number) is not drawn in the SVG: text
   there would land in the row's textContent (₿XAUUSD). It is written by
   CSS from data-g instead, and by the share card on its canvas. */
const coin = (bg, glyph, ink = '#fff', size = 15, { weight = 700, track = 0, extra = '' } = {}) =>
  Object.assign(() => `<rect width="30" height="30" fill="${bg}"/>${extra}`, { glyph, ink, size, weight, track });
const ASSET = {
  /* TradingView's gold, white bars */
  XAU: () => bars('#D69A00', '#FFFFFF', 1),
  XAG: () => bars('#A7ADB4', '#26292D'),
  XPT: () => bars('#8A939D', '#1C1F23'),
  XPD: () => bars('#8A939D', '#1C1F23'),
  XCU: () => bars('#B0673A', '#3A1A08'),
  /* the two US indices the way TradingView draws them: the number on its colour */
  NDX: coin('#0091BA', '100', '#fff', 9.8, { weight: 800, track: -0.03 }),
  SPX: coin('#C4162E', '500', '#fff', 9.8, { weight: 800, track: -0.03 }),
  DXY: coin('#1E8C66', '$', '#fff', 16, { weight: 800 }),
  OIL: () => '<rect width="30" height="30" fill="#F2A93B"/><path d="M15 6.5C15 6.5 9.2 13.8 9.2 17.8a5.8 5.8 0 0 0 11.6 0C20.8 13.8 15 6.5 15 6.5Z" fill="#1E1E1E"/><path d="M12.2 18.2a2.6 2.6 0 0 0 2.2 2.6" stroke="#6b6b6b" stroke-width="1" fill="none" stroke-linecap="round"/>',
  GAS: () => '<rect width="30" height="30" fill="#2E6FD8"/><path d="M15 6c1 4 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.4 1.4-3.6 2.3-5 .3 1.6 1.1 2.4 1.9 2.8C14.4 11.4 14 8.6 15 6Z" fill="#fff"/>',
  BTC: coin('#F7931A', '₿', '#fff', 16),
  ETH: coin('#627EEA', 'Ξ', '#fff', 15),
  SOL: coin('#1B1B2A', 'S', '#14F195', 14),
  XRP: coin('#23292F', 'X', '#fff', 13),
};

/* ---------- what an instrument is ---------- */
const CUR = {
  USD: 'U.S. Dollar', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen', AUD: 'Australian Dollar', NZD: 'New Zealand Dollar',
  CAD: 'Canadian Dollar', CHF: 'Swiss Franc', CNY: 'Chinese Yuan', CNH: 'Chinese Yuan (offshore)', HKD: 'Hong Kong Dollar',
  SGD: 'Singapore Dollar', SEK: 'Swedish Krona', NOK: 'Norwegian Krone', DKK: 'Danish Krone', MXN: 'Mexican Peso',
  ZAR: 'South African Rand', TRY: 'Turkish Lira', PLN: 'Polish Zloty', INR: 'Indian Rupee', BRL: 'Brazilian Real', KRW: 'South Korean Won',
  XAU: 'Gold', XAG: 'Silver', XPT: 'Platinum', XPD: 'Palladium', XCU: 'Copper', BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP',
};
const KIND = c => (ASSET[c] ? ASSET[c] : FLAG[c]);

/* Indices, energy and futures by the names brokers and exchanges give them. */
const NAMED = [
  [['NAS100', 'NAS', 'NDX', 'US100', 'USTEC', 'USTECH', 'NASDAQ', 'NASDAQ100', 'NQ', 'MNQ', 'QQQ'], { asset: 'NDX', name: 'Nasdaq 100' }],
  [['US30', 'DJ30', 'DJI', 'WS30', 'DOW', 'DOW30', 'YM', 'MYM'], { mark: 'US', name: 'Dow Jones 30' }],
  [['SPX500', 'US500', 'SPX', 'SP500', 'SPX500USD', 'ES', 'MES', 'SPY'], { asset: 'SPX', name: 'S&P 500' }],
  [['DXY', 'USDX', 'DX', 'USDOLLAR', 'USDINDEX'], { asset: 'DXY', name: 'U.S. Dollar Index' }],
  [['US2000', 'RUSSELL', 'RUT', 'RTY', 'M2K'], { mark: 'US', name: 'Russell 2000' }],
  [['GER40', 'GER30', 'DE40', 'DE30', 'DAX', 'DAX40', 'FDAX'], { mark: 'DE', name: 'DAX 40' }],
  [['UK100', 'FTSE', 'FTSE100'], { mark: 'GB', name: 'FTSE 100' }],
  [['FRA40', 'FR40', 'CAC', 'CAC40'], { mark: 'FR', name: 'CAC 40' }],
  [['JP225', 'JPN225', 'NIK225', 'NKY', 'NIKKEI', 'NI225'], { mark: 'JP', name: 'Nikkei 225' }],
  [['AUS200', 'AU200', 'ASX', 'ASX200'], { mark: 'AU', name: 'ASX 200' }],
  [['HK50', 'HK33', 'HSI'], { mark: 'HK', name: 'Hang Seng' }],
  [['EU50', 'EUSTX50', 'STOXX50', 'SX5E'], { mark: 'EU', name: 'Euro Stoxx 50' }],
  [['ESP35', 'IBEX', 'IBEX35'], { mark: 'ES', name: 'IBEX 35' }],
  [['ITA40', 'FTMIB'], { mark: 'IT', name: 'FTSE MIB' }],
  [['CN50', 'CHINA50', 'A50'], { mark: 'CN', name: 'China A50' }],
  [['USOIL', 'WTI', 'XTIUSD', 'CL', 'MCL', 'CRUDE', 'OIL', 'USCRUDE'], { asset: 'OIL', name: 'Crude Oil (WTI)' }],
  [['UKOIL', 'BRENT', 'XBRUSD', 'BZ'], { asset: 'OIL', name: 'Brent Crude' }],
  [['NATGAS', 'NGAS', 'XNGUSD', 'NG'], { asset: 'GAS', name: 'Natural Gas' }],
  [['GOLD', 'GC', 'MGC'], { asset: 'XAU', name: 'Gold' }],
  [['SILVER', 'SI', 'SIL'], { asset: 'XAG', name: 'Silver' }],
  [['PLATINUM', 'PL'], { asset: 'XPT', name: 'Platinum' }],
  [['PALLADIUM', 'PA'], { asset: 'XPD', name: 'Palladium' }],
  [['COPPER', 'HG', 'MHG'], { asset: 'XCU', name: 'Copper' }],
  [['BTC', 'XBT', 'BITCOIN', 'MBT'], { asset: 'BTC', name: 'Bitcoin' }],
  [['ETH', 'ETHEREUM'], { asset: 'ETH', name: 'Ethereum' }],
];
const BY_NAME = new Map(NAMED.flatMap(([keys, v]) => keys.map(k => [k, v])));
/* currency futures quoted against the dollar */
const CME_FX = { '6E': 'EUR', '6B': 'GBP', '6J': 'JPY', '6A': 'AUD', '6C': 'CAD', '6S': 'CHF', '6N': 'NZD', M6E: 'EUR', M6B: 'GBP', M6A: 'AUD' };

const normal = s => String(s || '').toUpperCase().replace(/\.[A-Z0-9]+$/, '').replace(/[^A-Z0-9]/g, '');
/** Strip a futures contract's month and year (NQZ5, ESH26, NQ1!). */
const rootOf = s => s.replace(/1!$|[FGHJKMNQUVXZ]\d{1,2}$/, '');

/**
 * What a symbol is: { kind: 'pair' | 'one' | 'none', base, quote, name }.
 * base/quote are keys into FLAG/ASSET (or market codes for an index).
 */
export function instrumentOf(symbol) {
  const raw = normal(symbol);
  if (!raw) return { kind: 'none', name: '' };
  for (const s of [raw, rootOf(raw), raw.replace(/(M|PRO|ECN|RAW|CASH|SPOT)$/, '')]) {
    const hit = BY_NAME.get(s);
    if (hit) return { kind: 'one', base: hit.asset || MARKET[hit.mark] || hit.mark, name: hit.name };
    if (CME_FX[s]) return { kind: 'pair', base: CME_FX[s], quote: 'USD', name: `${CUR[CME_FX[s]]} / ${CUR.USD} futures` };
    const m = s.match(/^([A-Z]{3})([A-Z]{3})/);
    if (m && CUR[m[1]] && CUR[m[2]]) {
      const name = `${CUR[m[1]]} / ${CUR[m[2]]}`;
      /* gold, silver or a coin is shown on its own, whatever it is priced in */
      if (ASSET[m[1]]) return { kind: 'one', base: m[1], quote: m[2], name };
      return { kind: 'pair', base: m[1], quote: m[2], name };
    }
  }
  /* an index with its currency written on the end, as OANDA and TradingView
     name them (NAS100USD, US30USD, DE30EUR, UK100GBP) */
  const bare = rootOf(raw).replace(/(USD|EUR|GBP|JPY|AUD|HKD|CNH)$/, '');
  const hit = bare !== raw && BY_NAME.get(bare);
  if (hit) return { kind: 'one', base: hit.asset || MARKET[hit.mark] || hit.mark, name: hit.name };
  return { kind: 'none', name: '' };
}

/* ---------- drawing it ---------- */
const disc = (key, cls) => {
  const draw = KIND(key);
  const span = el('span', { class: 'pm-disc ' + cls });
  if (draw) span.innerHTML = `<svg viewBox="0 0 30 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${draw().replace(/>\s+</g, '><').trim()}</svg>`;
  if (draw?.glyph) {
    span.dataset.g = draw.glyph;
    span.style.setProperty('--g-ink', draw.ink);
    span.style.setProperty('--g-size', (draw.size / 30).toFixed(3) + 'em');
    if (draw.weight !== 700) span.style.setProperty('--g-weight', draw.weight);
    if (draw.track) span.style.setProperty('--g-track', draw.track + 'em');
  }
  return span;
};

/**
 * The mark for an instrument, `size` px square. Two discs for a pair, one for
 * anything else we know, and the symbol's first letters on a plain disc for
 * anything we do not.
 */
export function pairMark(symbol, size = 22) {
  const k = instrumentOf(symbol);
  const box = el('span', { class: 'pmark is-' + k.kind, style: { '--pm': size + 'px' }, 'aria-hidden': 'true' });
  if (k.kind === 'pair') box.append(disc(k.quote, 'is-quote'), disc(k.base, 'is-base'));
  else if (k.kind === 'one') box.append(disc(k.base, 'is-one'));
  else {
    /* letters drawn by CSS, so the row's own text still reads as just the symbol */
    const t = normal(symbol).slice(0, 2) || '·';
    box.append(el('span', { class: 'pm-disc is-one is-blank', 'data-l': t }));
  }
  return box;
}

/**
 * The same mark as plain parts, for drawing on a canvas (the share card):
 * each disc's SVG (a 30×30 view box) and, for a coin or the S&P, its letters.
 *   { kind, discs: [{ role: 'quote'|'base'|'one', svg, glyph, ink, size, weight, track }], letters }
 */
export function markParts(symbol) {
  const k = instrumentOf(symbol);
  const part = (key, role) => {
    const draw = KIND(key);
    if (!draw) return { role, svg: null };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" width="120" height="120" preserveAspectRatio="xMidYMid slice">${draw().replace(/>\s+</g, '><').trim()}</svg>`;
    return { role, svg, glyph: draw.glyph || '', ink: draw.ink || '#fff', size: draw.size || 15, weight: draw.weight || 700, track: draw.track || 0 };
  };
  if (k.kind === 'pair') return { kind: 'pair', discs: [part(k.quote, 'quote'), part(k.base, 'base')], letters: '' };
  if (k.kind === 'one') return { kind: 'one', discs: [part(k.base, 'one')], letters: '' };
  return { kind: 'none', discs: [], letters: normal(symbol).slice(0, 2) || '' };
}

/** "Euro / U.S. Dollar", or '' when the symbol is not one we know. */
export const instrumentName = symbol => instrumentOf(symbol).name;

/**
 * The mark and the symbol together, as every list shows them:
 *   [flags] EURUSD
 *           EURO / U.S. DOLLAR      (when `named`)
 */
export function pairLabel(symbol, { size = 22, named = false, cls = '' } = {}) {
  const name = named ? instrumentName(symbol) : '';
  return el('span', { class: 'plabel ' + cls },
    pairMark(symbol, size),
    el('span', { class: 'pl-t' }, el('span', { class: 'pl-s' }, symbol || '—'), name ? el('span', { class: 'pl-n' }, name) : null));
}
