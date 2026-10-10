/* ============================================================
   quantversions.js — Quant's versions: each a name, its settings for the
   engine (quant.js), and its prompt — the whole strategy in words, as it
   would be given to an AI (or a person) to rebuild or improve it.

   Three built in, the three that held up over ten years: Version 1 and 2
   run quant13.js (his risk entry at MTF structure), Version 3 runs
   quant.js (the A+ 1H rules). Their settings are frozen here, so changing
   an engine's defaults never changes what a version was. Minato's own
   versions live in the vault (lab.json → quant.versions); a version made
   from Version 1 or 2 runs quant13.js, any other quant.js.
   ============================================================ */

import { OPENS } from './quant13.js';

export const BASE = { K: 2, KX: 8, zone: 0.3, minR: 1.5, pips: 2, full: 0.5, spread: 3, mtfEntry: 5, ltfEntry: 3,
  tier3: true, dcBars: 12, breakEven: true, kinds: ['mtf', 'ltf'], capR: null, pickR: false, reentry: 0, divAll: false, htf: false, htfK: 5,
  mySessions: false, maxPerDay: 0, dayLossR: 0, confirm: false, confirmMins: 60, stopLevel: false, fixedR: null, int15Agree: false, h1Agree: false, divMin: 0, scale: 1 };

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
  { k: 'divMin', label: 'Divergence on at least', unit: 'of the 4 timeframes (0: not asked)', min: 0, max: 4, step: 1 },
  { k: 'scale', label: 'Timeframes ×', unit: '(4: 4m / 12m / 20m / 1H)', min: 1, max: 8, step: 1 },
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
    S.scale > 1 ? `Timeframes stretched ×${S.scale}: wherever these rules say 1m, 3m, 5m and 15m, read ${S.scale}m, ${3 * S.scale}m, ${5 * S.scale}m and ${15 * S.scale}m (the 4H stays 4H; fills and the 1m confirmation stay on one-minute candles).` : null,
    'Structure on every timeframe: a swing high/low is a fractal (higher/lower than the candles either side). Structure breaks only when a candle closes past the level with a body of at least half the candle (or a whole body past it after a gap); anything less that trades past is a sweep — an NC (no close). After a break, the swing that caused it is protected (PL in an uptrend, PH in a downtrend).',
    `Direction: the 15m external structure only — swings ${S.KX} candles either side. No 4H or daily filter. The 15m internal structure (swings ${S.K} either side) gives the internal protected levels (IPL / IPH).`,
    'Levels to trade from, always with the 15m direction:',
    kinds.includes('mtf') ? `  • the 15m protected level and every internal one still standing in the current 15m leg — entries read on ${S.mtfEntry}m candles;` : null,
    kinds.includes('ltf') ? `  • once the 5m has shifted with the 15m (the order-flow shift, OFS), the 5m protected levels — entries read on ${S.ltfEntry}m candles.` : null,
    S.mySessions ? 'Sessions: trades are opened only in Pre-Asia (07:00), Asia (08:00–12:00), Pre-London (13:00) and London (14:00–17:00), your local time (UTC+8).' : null,
    S.maxPerDay ? `At most ${S.maxPerDay} trades a day.` : null,
    S.dayLossR ? `Stop for the day once ${n(S.dayLossR)}R has been lost that day.` : null,
    S.htf ? `4H NC windows: when a 4H candle runs a 4H swing low (swings ${S.htfK} candles either side) without a full close below it — a 4H NC+S — longs are allowed on any of the levels above, on any timeframe, even against the 15m, for that leg: until a 4H full close below that candle's low, until price reaches the nearest 4H swing high above, or until a 4H NC the other way. Shorts mirrored.` : null,
    S.divAll ? 'Divergence required: at the second push, RSI (14, on the closes) shows divergence against the DC low on every one of the 1m, 3m, 5m and 15m.' : S.divMin ? `Divergence required: at the second push, RSI (14, on the closes) shows divergence against the DC low on at least ${S.divMin} of the 1m, 3m, 5m and 15m.` : null,
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

/* ---------- Version 1 and 2: quant13.js ---------- */
export const BASE13 = { maxAgeDays: 5, divMin: 3, isoAtr: 3, minR: 1.5, zone: 0.3, reentry: 1, threeSL: false, nyOpen: 480, perSession: 1 };

export const KNOBS13 = [
  { k: 'threeSL', label: '3SL — only the hour either side of each open', bool: true },
  { k: 'nyOpen', label: 'New York open', unit: 'minutes after midnight New York (480 = 8:00, 570 = 9:30)', min: 420, max: 600, step: 30 },
  { k: 'perSession', label: 'Trades a session', unit: 'at most', min: 1, max: 3, step: 1 },
  { k: 'maxAgeDays', label: 'A level is let go after', unit: 'days', min: 1, max: 30, step: 1 },
  { k: 'isoAtr', label: 'Empty space behind the level', unit: '15m ATRs at least', min: 1, max: 8, step: 0.5 },
  { k: 'divMin', label: 'Or divergence on at least', unit: 'of the 1m / 3m / 5m / 15m', min: 1, max: 4, step: 1 },
  { k: 'zone', label: 'DC low within', unit: 'of the leg from the level', min: 0.1, max: 0.6, step: 0.05, pct: true },
  { k: 'reentry', label: 'Re-entries a level', unit: 'more goes after the first', min: 0, max: 3, step: 1 },
  { k: 'minR', label: 'Minimum target', unit: 'R', min: 1, max: 5, step: 0.25 },
];

/** Version 1 / 2's rules in words, from its settings. */
export function rulesInWords13(s) {
  const S = { ...BASE13, ...s };
  const ny = `${Math.floor(S.nyOpen / 60)}:${String(S.nyOpen % 60).padStart(2, '0')}`;
  return [
    'Market: XAUUSD (gold) first — any pair Replay has downloaded. OANDA mid one-minute candles.',
    'Structure, read as a hierarchy: the smallest swings on 5m candles make the LTF (degree 1); swings of those make the MTF (degree 2); swings of those the one above (degree 3). No CHoCH. A real break is a full-bodied close past the level, the next candle carrying on, no close back inside for 3 candles, and at least one ATR travelled. Anything less is a failed break (NC+S) and the level stands; once a push has been defended (a strong candle straight back), the rest of that leg needs a displacement candle (1.5 ATR body) to break.',
    `Levels: the protected low (high) behind every real break of the MTF — internal and external — until that structure really breaks it, and never longer than ${S.maxAgeDays} days.`,
    `The risk entry (longs; shorts mirrored): the MTF is up and the LTF has not shifted up yet. Price comes to an MTF protected low and makes a first reaction swing low on 15m candles within the bottom ${Math.round(S.zone * 100)}% of the leg from the level; a later push sweeps that low (the level's own first sweep — IPL+S — does not count, the next one does), with no real break of the level. The first bullish 15m candle closes — the rejection — and the trade opens at the next candle's open.`,
    `Only when the level has empty space behind it (no other MTF level within ${S.isoAtr} ATR of the 15m below it) or the sweep shows RSI(14) divergence against the DC low on at least ${S.divMin} of the 1m, 3m, 5m and 15m. Not after the MTF has failed to break its own way twice since its last real break.`,
    S.reentry ? `Up to ${S.reentry} more go(es) at the same level from a fresh DC low.` : null,
    S.threeSL ? `3SL: trades open only from 1 hour before to 1 hour after the Tokyo (9:00 Tokyo), London (8:00 London) and New York (${ny} New York) opens, each in its own clock — at most ${S.perSession} trade${S.perSession > 1 ? 's' : ''} a session.` : null,
    'Stop: past the sweep, plus a buffer (2 pips on gold, 1 elsewhere).',
    `Target: the weak structure — the MTF leg's extreme (or, after the MTF failed the other way, the extreme of that failed leg). If it is further than the day has left in it (the 20-day average range less today's), the nearest internal swing still standing at ${S.minR}R or more instead. Under ${S.minR}R — no trade.`,
    'Break-even: once the LTF really breaks the trade\'s way after the entry, in profit, the stop moves to the entry.',
    'Fills on one-minute candles; a typical OANDA spread paid on every entry ($0.30 on gold); nothing opened from 30 minutes before the 5pm New York close to an hour after it; one trade at a time.',
  ].filter(Boolean).join('\n');
}

/* Version 3 = the old Version 12: Version 4's exits, divergence on 3+ of 4, every timeframe ×4 */
const v12 = { ...BASE, pickR: true, reentry: 2, tier3: false, dcBars: 12, divMin: 3, scale: 4 };

export const BUILTIN = [
  { id: 'q1', name: 'Version 1', tag: 'Risk entries', engine: '13', builtIn: true, date: '2026-10-12', settings: { ...BASE13 },
    note: "Your risk entry at MTF structure, read the way you marked chart 1: real breaks only (full-bodied, carried on, held), no CHoCH, a DC at an MTF protected level with empty space behind it or divergence, the weak structure as the target. Levels are let go after 5 days. Built on gold Oct 2021 – Oct 2026 and checked on Oct 2016 – Sep 2021, which it never saw (+38R, profit factor 2.03). Ten years of gold: 155 trades, +101R, profit factor 2.04, 39% won, deepest drawdown 12.5R — every year from 2019 positive. It beat 200 out of 200 random-entry twins. On AUDUSD it loses (−28R): this is a gold edge.",
    prompt: null },
  { id: 'q2', name: 'Version 2', tag: 'Risk entries · 3SL', engine: '13', builtIn: true, date: '2026-10-12', settings: { ...BASE13, threeSL: true },
    note: "Version 1 inside your 3SL windows: from an hour before to an hour after the Tokyo, London and New York opens (New York at 8:00 New York time), one trade a session. Ten years of gold: 54 trades (about 5 a year), +48R, profit factor 2.51, 41% won, deepest drawdown 6R — half Version 1's R from a third of its trades, with half the drawdown. On AUDUSD it loses (−17R).",
    prompt: null },
  { id: 'q3', name: 'Version 3', tag: 'A+ 1H', engine: '12', builtIn: true, date: '2026-10-10', settings: v12,
    note: "Your A+ — RSI divergence at the second push on at least 3 of the 1m/3m/5m/15m — with the structure read on bigger timeframes (every timeframe ×4: structure on the 1H and 20m, entries on 12m and 20m), Version 4's sweep stop, structure target and break-even. The one rule set from the earlier rounds that held up over ten years on both markets. Ten years: gold 229 trades, +65R, profit factor 1.47, 22% won, deepest drawdown 15R; AUDUSD +27R, profit factor 1.16. About 1 year in 3 loses.",
    prompt: null },
];
for (const v of BUILTIN) v.prompt = promptOf(v);

/** A version's engine: '13' (Version 1 / 2 and their copies) or '12' (quant.js). */
export function engineOf(v) { return v?.engine === '13' ? '13' : '12'; }
/** The strategy in words for any version. */
export function promptOf(v) {
  return `${v.name}${v.tag ? ' · ' + v.tag : ''} — ${v.note}\n\n${engineOf(v) === '13' ? rulesInWords13(v.settings) : rulesInWords(v.settings)}`;
}

/** Every version: the built-in ones, then his. */
export const allVersions = state => [...BUILTIN, ...(state?.quant?.versions || [])];
/** The version to open: his pick if it still exists (the old Version 2–12 are gone), else Version 1. */
export const currentOf = state => { const all = allVersions(state); return all.find(v => v.id === state?.quant?.current) || all[0]; };

/** The engine's options for a version. */
export function optionsOf(v) {
  if (engineOf(v) === '13') {
    const s = { ...BASE13, ...v.settings };
    const opens = OPENS.map(([tz, open, name]) => [tz, name === 'New York' ? s.nyOpen : open, name]);
    return { engine: '13', maxAgeDays: s.maxAgeDays, divMin: s.divMin, isoAtr: s.isoAtr, minR: s.minR, zone: s.zone, reentry: s.reentry, kinds: ['risk'],
      sessions: s.threeSL ? opens : null, perSession: s.perSession || 1 };
  }
  const s = { ...BASE, ...v.settings };
  return { K: s.K, KX: s.KX, zone: s.zone, minR: s.minR, pips: s.pips, full: s.full, spread: s.spread, mtfEntry: s.mtfEntry, ltfEntry: s.ltfEntry,
    tier3: !!s.tier3, dcBars: s.dcBars, breakEven: !!s.breakEven, kinds: s.kinds, capR: s.capR || null,
    pickR: !!s.pickR, reentry: s.reentry || 0, divAll: s.divAll ? 4 : (s.divMin || false), scale: s.scale || 1, htf: !!s.htf, htfK: s.htfK || 5,
    sessions: s.mySessions ? MY_SESSIONS : null, maxPerDay: s.maxPerDay || 0, dayLossR: s.dayLossR || 0,
    confirm: !!s.confirm, confirmMins: s.confirmMins || 60, int15Agree: !!s.int15Agree, h1Agree: !!s.h1Agree, stopAt: s.stopLevel ? 'level' : 'sweep', fixedR: s.fixedR || null };
}
/** The settings a version's page shows. */
export const knobsOf = v => (engineOf(v) === '13' ? KNOBS13 : KNOBS);
export const baseOf = v => (engineOf(v) === '13' ? BASE13 : BASE);

/** A new version from another: the next number, its engine, its settings, its prompt. */
export function newVersion(state, from) {
  const all = allVersions(state);
  const num = Math.max(0, ...all.map(v => Number(/\d+/.exec(v.name)?.[0]) || 0)) + 1;
  const settings = JSON.parse(JSON.stringify({ ...baseOf(from), ...from.settings }));
  const v = { id: 'qv_' + Math.random().toString(36).slice(2, 8), name: `Version ${num}`, engine: engineOf(from), date: new Date().toISOString().slice(0, 10),
    from: from.id, settings, note: `Based on ${from.name}${from.tag ? ' · ' + from.tag : ''}.`, edited: false };
  v.prompt = promptOf(v);
  return v;
}
