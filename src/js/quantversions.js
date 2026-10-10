/* ============================================================
   quantversions.js — Quant's versions: each a name, its settings for the
   engine (quant.js), and its prompt — the whole strategy in words, as it
   would be given to an AI (or a person) to rebuild or improve it.

   The built-in versions are frozen here with every setting spelled out, so
   changing the engine's defaults never changes what an old version was.
   Minato's own versions live in the vault (lab.json → quant.versions).
   ============================================================ */

export const BASE = { K: 2, KX: 8, zone: 0.3, minR: 1.5, pips: 2, full: 0.5, spread: 3, mtfEntry: 5, ltfEntry: 3,
  tier3: true, dcBars: 12, breakEven: true, kinds: ['mtf', 'ltf'], capR: null, pickR: false, reentry: 0, divAll: false, htf: false, htfK: 5,
  mySessions: false, maxPerDay: 0, dayLossR: 0, confirm: false, confirmMins: 60, stopLevel: false, fixedR: null, int15Agree: false, h1Agree: false };

/* Pre-Asia 07:00, Asia 08:00–12:00, Pre-London 13:00, London 14:00–17:00 — his local time (UTC+8), as minutes of the day */
export const MY_SESSIONS = [[420, 720], [780, 1020]];

/** The knobs a version can turn, in the order the page shows them. */
export const KNOBS = [
  { k: 'KX', label: '15m external swings', unit: 'candles either side', min: 2, max: 20, step: 1 },
  { k: 'dcBars', label: 'Double confirmation', unit: 'entry candles at least', min: 0, max: 60, step: 1 },
  { k: 'zone', label: 'DC low within', unit: 'of the leg from the level', min: 0.05, max: 0.8, step: 0.05, pct: true },
  { k: 'confirm', label: '1m internal break first', bool: true },
  { k: 'confirmMins', label: 'Wait for it up to', unit: 'minutes', min: 5, max: 480, step: 5 },
  { k: 'int15Agree', label: '15m internal structure agrees', bool: true },
  { k: 'h1Agree', label: '1H structure agrees', bool: true },
  { k: 'stopLevel', label: 'Stop past the protected level', bool: true },
  { k: 'fixedR', label: 'Take profit at', unit: 'R (empty: the structure target)', min: 0.5, max: 10, step: 0.25, empty: true },
  { k: 'minR', label: 'Minimum target', unit: 'R', min: 1, max: 10, step: 0.25 },
  { k: 'capR', label: 'Target cap', unit: 'R (empty: none)', min: 1, max: 30, step: 0.5, empty: true },
  { k: 'pickR', label: 'Aim past near targets', bool: true },
  { k: 'reentry', label: 'Re-entries a level', unit: 'more goes after the first', min: 0, max: 5, step: 1 },
  { k: 'divAll', label: 'Divergence on 1/3/5/15m', bool: true },
  { k: 'htf', label: '4H NC windows', bool: true },
  { k: 'htfK', label: '4H swings', unit: 'candles either side', min: 2, max: 12, step: 1 },
  { k: 'mySessions', label: 'Your sessions only', bool: true },
  { k: 'maxPerDay', label: 'Trades a day', unit: 'at most (0: no limit)', min: 0, max: 10, step: 1 },
  { k: 'dayLossR', label: 'Stop for the day at', unit: 'R lost (0: never)', min: 0, max: 10, step: 0.5 },
  { k: 'pips', label: 'Stop past the sweep', unit: 'pips', min: 0, max: 100, step: 1 },
  { k: 'spread', label: 'Spread on entry', unit: 'pips', min: 0, max: 20, step: 0.5 },
  { k: 'tier3', label: 'Skip tier 3', bool: true },
  { k: 'breakEven', label: 'Break-even on the 5m', bool: true },
  { k: 'mtf', label: '15m levels', bool: true, kind: true },
  { k: 'ltf', label: '5m levels after the OFS', bool: true, kind: true },
];

const pct = v => `${Math.round(v * 100)}%`;
const n = v => String(+Number(v).toFixed(2));

/** The strategy in words, from a version's settings. */
export function rulesInWords(s) {
  const S = { ...BASE, ...s };
  const kinds = S.kinds || [];
  const lines = [
    'Instrument: XAUUSD (gold), OANDA mid one-minute candles, built up to 3m, 5m and 15m.',
    'Structure on every timeframe: a swing high/low is a fractal (higher/lower than the candles either side). Structure breaks only when a candle closes past the level with a body of at least half the candle (or a whole body past it after a gap); anything less that trades past is a sweep — an NC (no close). After a break, the swing that caused it is protected (PL in an uptrend, PH in a downtrend).',
    `Direction: the 15m external structure only — swings ${S.KX} candles either side. No 4H or daily filter. The 15m internal structure (swings ${S.K} either side) gives the internal protected levels (IPL / IPH).`,
    'Levels to trade from, always with the 15m direction:',
    kinds.includes('mtf') ? `  • the 15m protected level and every internal one still standing in the current 15m leg — entries read on ${S.mtfEntry}m candles;` : null,
    kinds.includes('ltf') ? `  • once the 5m has shifted with the 15m (the order-flow shift, OFS), the 5m protected levels — entries read on ${S.ltfEntry}m candles.` : null,
    S.mySessions ? 'Sessions: trades are opened only in Pre-Asia (07:00), Asia (08:00–12:00), Pre-London (13:00) and London (14:00–17:00), your local time (UTC+8).' : null,
    S.maxPerDay ? `At most ${S.maxPerDay} trades a day.` : null,
    S.dayLossR ? `Stop for the day once ${n(S.dayLossR)}R has been lost that day.` : null,
    S.htf ? `4H NC windows: when a 4H candle runs a 4H swing low (swings ${S.htfK} candles either side) without a full close below it — a 4H NC+S — longs are allowed on any of the levels above, on any timeframe, even against the 15m, for that leg: until a 4H full close below that candle's low, until price reaches the nearest 4H swing high above, or until a 4H NC the other way. Shorts mirrored.` : null,
    S.divAll ? 'Divergence required: at the second push, RSI (14, on the closes) shows divergence against the DC low on every one of the 1m, 3m, 5m and 15m.' : null,
    S.reentry ? `Re-entries: after a trade at a level, up to ${S.reentry} more go(es) at the same level from a fresh DC low, while the level stands.` : null,
    S.tier3 ? 'Tier 3: no trade once the leg\'s weak high/low has already been run without a break (15m for 15m levels, 5m for 5m levels).' : null,
    `NC+S with a double confirmation (longs; shorts mirrored): price comes to the level and makes a first reaction low near it — the DC low, within the bottom ${pct(S.zone)} of the leg from the level, or below the level. After a bounce${S.dcBars ? `, at least ${S.dcBars} entry candles later,` : ''} a second push sweeps that low, with no full close below the protected level. The first opposite (bullish) candle closes — the rejection candle — and the trade opens at the next candle's open.`,
    S.int15Agree || S.h1Agree ? `Alignment: when the rejection candle closes, ${[S.int15Agree && 'the 15m internal structure (swings ' + S.K + ' either side)', S.h1Agree && 'the 1H structure (swings ' + S.K + ' either side)'].filter(Boolean).join(' and ')} must point the trade\'s way.` : null,
    S.confirm ? `Confirmation: the trade waits for a 1m internal break — a full-bodied 1m close above the last 1m swing high made before the sweep\'s low. If it came before the rejection candle closed, in at once; otherwise in at the open after it, within ${S.confirmMins} minutes of the rejection candle. A new low on the way moves the stop with it; a full close below the protected level cancels it.` : null,
    S.stopLevel ? `Stop: below the protected level or the lowest point since the DC low, whichever is lower, plus ${n(S.pips)} pips ($${(S.pips * 0.1).toFixed(2)}).` : `Stop: below the lowest point since the DC low, plus ${n(S.pips)} pips ($${(S.pips * 0.1).toFixed(2)}).`,
    S.fixedR ? `Target: a fixed ${n(S.fixedR)}R from the entry.` : `Target: the nearest strong high above the entry (a protected high or a leg's top, on the 15m or 5m) made before the DC low and whose liquidity is still there (price has not traded through it). ${S.pickR ? `If the nearest is closer than ${n(S.minR)}R, aim for the next one beyond it (still made before the DC low); none at ${n(S.minR)}R or more — no trade.` : `At least ${n(S.minR)}R or no trade.`}${S.capR ? ` A target further than ${n(S.capR)}R is brought in to ${n(S.capR)}R.` : ''}`,
    S.breakEven ? 'Break-even: once a 5m swing formed after the entry is broken by a full close in the trade\'s favour, the stop moves to the entry. No partials.' : 'No break-even and no partials: every trade runs to its stop or its target.',
    `Fills on the one-minute candles; ${n(S.spread)} pips ($${(S.spread * 0.1).toFixed(2)}) of spread paid on every entry; a stop and a target in the same minute count as the stop; nothing opened from 30 minutes before the 5pm New York close to an hour after it; one trade at a time.`,
  ];
  return lines.filter(Boolean).join('\n');
}

const v2 = { ...BASE, KX: 5, tier3: false, dcBars: 0 };
const v3 = { ...BASE };
const v4 = { ...BASE, pickR: true, reentry: 2 };
const v5 = { ...BASE, pickR: true, reentry: 2, divAll: true };
const v6 = { ...BASE, pickR: true, reentry: 2, htf: true, htfK: 5 };
const v7 = { ...BASE, pickR: true, reentry: 2, mySessions: true, maxPerDay: 3, dayLossR: 3 };
const v8 = { ...BASE, pickR: true, reentry: 2, tier3: false, dcBars: 40, confirm: true, stopLevel: true, fixedR: 1.5 };
const v10 = { ...BASE, pickR: true, reentry: 2, tier3: false, dcBars: 40, confirm: true, confirmMins: 120, stopLevel: true, fixedR: 1.5, int15Agree: true };
const v11 = { ...v10, h1Agree: true };
const v9 = { ...BASE, pickR: true, reentry: 2, tier3: false, dcBars: 40, confirm: true, stopLevel: true, capR: 3 };

export const BUILTIN = [
  { id: 'v2', name: 'Version 2', builtIn: true, date: '2026-10-09', settings: v2,
    note: 'Built from your direction: no HTF alignment; focus on protected structure, the LTF OFS, the MTF structure and NC+S; break-even on 5m structure of the same leg only. The double confirmation read the way your own charts show it.',
    prompt: null },
  { id: 'v3', name: 'Version 3', builtIn: true, date: '2026-10-09', settings: v3,
    note: 'Version 2 plus three filters, each kept only because both years (Oct 2024–Sep 2025 and Oct 2025–Oct 2026) improved with it: 15m external swings 8 candles either side; a double confirmation at least 12 entry candles long; no trade at tier 3. Tried and dropped: target caps at 3R/4R/5R, a wider stop (+$1, +$2), divergence on the entry candles, a stop at the protected level, a session filter.',
    prompt: null },
  { id: 'v4', name: 'Version 4', builtIn: true, date: '2026-10-09', settings: v4,
    note: 'Version 3 plus two things from your own way of trading: when the nearest strong high is under 1.5R, aim for the next one ("if the previous high is less than 1.5R then don\'t worry about it"), and re-enter a level after a stop (up to two more goes, each from a fresh DC low). More trades and more R, the same profit factor. Tried and dropped: target caps at 3R/4R/5R and a stop $1–$2 wider (your ideas — the profit is in the far targets), a minimum stop of $2–$3, divergence on only 1–3 of the four timeframes.',
    prompt: null },
  { id: 'v5', name: 'Version 5 · A+', builtIn: true, date: '2026-10-09', settings: v5,
    note: 'Version 4, taking only the A+ trades: RSI divergence on every one of the 1m, 3m, 5m and 15m at the second push, as your plan says ("DIV must be seen on all LTF"). Very few trades, but the best of them — profit factor above 3 in both years. Divergence on only some of the four was worse than none.',
    prompt: null },
  { id: 'v6', name: 'Version 6 · HTF windows', builtIn: true, date: '2026-10-10', settings: v6,
    note: 'Version 4 plus your 4H idea: after a 4H NC+S (a 4H swing run with no close past it), setups that way are taken on any timeframe, even against the 15m, for that leg — until the 4H candle\'s extreme is closed through, price reaches the 4H protected structure on the other side, or a 4H NC the other way. More trades (633) and more R in both years, but a deeper drawdown, and the window trades on their own are only just positive (174 trades, +42R, PF 1.35). With 4H swings of 4 or 6 candles instead of 5, year 1 comes out a little below Version 4 — so treat it as promising, not proven. Tried and dropped: capping targets at 10R (+79R instead of +198R) or skipping trades over 10R; requiring the 5m OFS inside the window; a 15m DC risk entry at the 4H NC level only.',
    prompt: null },
  { id: 'v7', name: 'Version 7 · Your sessions', builtIn: true, date: '2026-10-10', settings: v7,
    note: 'Version 4, opening trades only in your sessions — Pre-Asia, Asia, Pre-London and London (07:00–12:00 and 13:00–17:00 your time) — with your playbook\'s day rules: at most 3 trades a day, stop for the day at −3R (your 1.5% cap at 0.5% a trade). Fewer trades and a smaller drawdown, but much of Version 4\'s profit was made outside these hours (your 00:00–07:00 and 21:00–24:00). Pre-London is the best session by far; Pre-Asia loses on its own. Daily and weekly stops barely change the drawdown — the losing runs stretch across days.',
    prompt: null },
  { id: 'v8', name: 'Version 8 · High win rate', builtIn: true, date: '2026-10-10', settings: v8,
    note: 'Built for your goal: a 40–50% win rate with a small drawdown. Version 4 with four changes, each chosen on year 1 and then checked on year 2: (1) a double confirmation at least 40 entry candles long — the longer the gap between the DC low and the sweep, the better, in a smooth line from 12 to 80; (2) after the rejection candle, wait for a 1m internal break (a full close past the last 1m swing high before the sweep low); (3) the stop past the protected level, not just the sweep; (4) take profit at 1.5R, your minimum. Tier 3 trades are allowed. Result: 185 trades (about 8 a month), 55% win rate (53% year 1, 56% year 2), profit factor 1.85, +29R, deepest drawdown 4R, at most 4 losses in a row, every quarter positive — including Jul–Oct 2026 when Version 4 lost 30R. Run with neighbouring structure settings (DC zone 20–40%, 15m swings 5 or 8) it averages +14R, profit factor 1.4 — the honest expectation. The catch: 108 of the 185 trades end at break-even (your 5m break-even rule does most of the work — without it the win rate falls to about 45%), and the total R is far below Version 4’s, which lives on rare 10R+ runners. Tried and dropped: wider stops by ATR, engulfing or close-back rejection candles, break-even only after +0.5R or on the 15m, 4H windows and a wider DC zone (more trades, weaker), targets of 2R–3R (lower win rate, about the same R).',
    prompt: null },
  { id: 'v9', name: 'Version 9 · Structure target', builtIn: true, date: '2026-10-10', settings: v9,
    note: 'Version 8, but aiming at the structure target (the nearest strong high past 1.5R, as in Version 4), brought in to 3R when it is further. 174 trades, 45% win rate, profit factor 1.90, +28R, deepest drawdown 5R. Closer to how you pick targets; one quarter slightly negative (Jul–Sep 2025, −2R).',
    prompt: null },
  { id: 'v10', name: 'Version 10 · Robust', builtIn: true, date: '2026-10-10', settings: v10,
    note: "Version 8 made sturdier. Every idea was scored not on one setting but averaged over ten neighbouring ones (DC zone 20–40%, 15m swings 5 or 8) — Version 4's +198R, for one, averages only +54R that way, and Version 8's +29R averages +14R. Two changes held up everywhere: (1) the 15m internal structure (IPL/IPH swings) must point the trade's way when the rejection candle closes — the pullback has not broken it; (2) wait up to 2 hours (not 1) for the 1m internal break. Result: 153 trades (about 6 a month), 58% win rate (59% year 1, 58% year 2), profit factor 2.08, +28R, deepest drawdown 4R, 4 losses in a row at worst. Averaged over the neighbours: +20R, profit factor 1.8, 53% won, both years positive in all ten. Tried and dropped this round: the setup on other entry timeframes added together (more trades, weaker), a smaller or bigger DC (30, 50, 60), skipping your 00:00–07:00, tier 3, the 5m agreeing, 2R targets, break-even on the 15m, a trailing stop on 1m/5m/15m swings, re-entries. Also fixed for every version: a stop the market gaps through now fills at the open, and break-even only moves the stop once that 5m close is in profit (before, a few trades were moved to break-even while still under water).",
    prompt: null },
  { id: 'v11', name: 'Version 11 · 1H aligned', builtIn: true, date: '2026-10-10', settings: v11,
    note: "Version 10 plus the 1H structure pointing the trade's way too. Fewer trades, better ones: 102 trades (about 4 a month), 61% win rate (64% year 1, 58% year 2), profit factor 2.37, +26R, deepest drawdown 3R, 3 losses in a row at worst. Averaged over the neighbouring settings: +19R, profit factor 2.1, 57% won, both years positive in all ten. Requiring the daily as well leaves too few trades (about 3 a month).",
    prompt: null },
];
for (const v of BUILTIN) v.prompt = `${v.name} — ${v.note}\n\n${rulesInWords(v.settings)}`;

/** Every version: the built-in ones, then his. */
export const allVersions = state => [...BUILTIN, ...(state?.quant?.versions || [])];

/** The engine's options for a version. */
export function optionsOf(v) {
  const s = { ...BASE, ...v.settings };
  return { K: s.K, KX: s.KX, zone: s.zone, minR: s.minR, pips: s.pips, full: s.full, spread: s.spread, mtfEntry: s.mtfEntry, ltfEntry: s.ltfEntry,
    tier3: !!s.tier3, dcBars: s.dcBars, breakEven: !!s.breakEven, kinds: s.kinds, capR: s.capR || null,
    pickR: !!s.pickR, reentry: s.reentry || 0, divAll: s.divAll ? 4 : false, htf: !!s.htf, htfK: s.htfK || 5,
    sessions: s.mySessions ? MY_SESSIONS : null, maxPerDay: s.maxPerDay || 0, dayLossR: s.dayLossR || 0,
    confirm: !!s.confirm, confirmMins: s.confirmMins || 60, int15Agree: !!s.int15Agree, h1Agree: !!s.h1Agree, stopAt: s.stopLevel ? 'level' : 'sweep', fixedR: s.fixedR || null };
}

/** A new version from another: the next number, its settings, its prompt. */
export function newVersion(state, from) {
  const all = allVersions(state);
  const num = Math.max(0, ...all.map(v => Number(/\d+/.exec(v.name)?.[0]) || 0)) + 1;
  const settings = JSON.parse(JSON.stringify({ ...BASE, ...from.settings }));
  const v = { id: 'qv_' + Math.random().toString(36).slice(2, 8), name: `Version ${num}`, date: new Date().toISOString().slice(0, 10),
    from: from.id, settings, note: `Based on ${from.name}.`, edited: false };
  v.prompt = `${v.name} — ${v.note}\n\n${rulesInWords(settings)}`;
  return v;
}
