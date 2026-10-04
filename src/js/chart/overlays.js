/* ============================================================
   chart/overlays.js — the Sessions and News indicators, shared by the
   trade chart and Replay.

   Sessions: the Playbook's sessions (Asia, London, New York…) shaded, and
   named along the bottom of the chart, below the daily timeframe.
   News: red folders only — high-impact releases for the instrument's own
   currencies — a dotted line with a red mark, the names under it;
   releases at the same moment share one mark, and blocks that would
   overlap move down a row. Nothing after the replay's moment.
   ============================================================ */
import * as cd from '../candles.js';
import { withAlpha } from './core.js';

const DAY = 86400;
export const NEWS_TOP = 28;
const pad2 = n => String(n).padStart(2, '0');
const localDay = T => { const d = new Date(T * 1000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

/** Each session on screen: [from, to, name]. */
function sessionSpans(G, sessions) {
  const out = [];
  const tA = G.tX(0) - DAY, tZ = G.tX(G.pw) + DAY;
  for (let d = tA; d <= tZ + DAY; d += DAY) {
    const day = localDay(d);
    for (const s of sessions) {
      if (!s.start || !s.end) continue;
      const a = cd.localStamp(day, s.start);
      let z = cd.localStamp(day, s.end);
      if (z <= a) z += DAY;
      out.push([a, z, s.name]);
    }
  }
  return out;
}
export function paintSessions(g, G, C, sessions, tf) {
  if (!sessions.length || tf >= 1440) return;
  g.fillStyle = withAlpha(C.ink, 0.035);
  for (const [a, z] of sessionSpans(G, sessions)) {
    const xa = Math.max(0, G.xT(a)), xz = Math.min(G.pw, G.xT(z));
    if (xz - xa >= 2) g.fillRect(xa, 0, xz - xa, G.ph);
  }
}
export function paintSessionNames(g, G, C, sessions, tf, font) {
  if (!sessions.length || tf >= 1440) return;
  g.font = font(10); g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = C.ink4;
  for (const [a, z, name] of sessionSpans(G, sessions)) {
    const xa = Math.max(0, G.xT(a)), xz = Math.min(G.pw, G.xT(z));
    if (xz - xa > 46) g.fillText(String(name || '').toUpperCase(), xa + 6, G.ph - 7, xz - xa - 10);
  }
}

/**
 * A release's short name, the way traders say it: "CPI", "Core CPI", "NFP",
 * "Rate", "Powell". Minato asked for these over the full titles, which ran
 * long and were cut off.
 */
const SHORT = [
  [/\bADP\b/i, 'ADP'], [/non-?farm|\bNFP\b/i, 'NFP'], [/average hourly earnings/i, 'AHE'], [/unemployment claims|jobless claims/i, 'Claims'],
  [/unemployment rate/i, 'Unemployment'], [/claimant count/i, 'Claimant'], [/JOLTS/i, 'JOLTS'], [/employment change/i, 'Employment'],
  [/core PCE/i, 'Core PCE'], [/\bPCE\b/i, 'PCE'], [/core CPI/i, 'Core CPI'], [/\bCPI\b/i, 'CPI'], [/core PPI/i, 'Core PPI'], [/\bPPI\b/i, 'PPI'],
  [/core retail sales/i, 'Core Retail'], [/retail sales/i, 'Retail Sales'], [/\bGDP\b/i, 'GDP'],
  [/ISM manufacturing/i, 'ISM Mfg'], [/ISM services|ISM non-manufacturing/i, 'ISM Services'], [/manufacturing PMI/i, 'Mfg PMI'], [/services PMI/i, 'Services PMI'],
  [/meeting minutes|minutes/i, 'Minutes'], [/press conference/i, 'Press Conf'], [/monetary policy (statement|report)/i, 'Policy'],
  [/FOMC statement|funds rate|refinancing rate|bank rate|cash rate|overnight rate|policy rate|interest rate|deposit rate/i, 'Rate'],
  [/^(?:\w+ )?(?:chair|gov(?:ernor)?|president) (\w+) speaks/i, m => `${m[1]}`], [/^(\w+) speaks/i, m => `${m[1]}`],
  [/consumer confidence/i, 'Confidence'], [/consumer sentiment/i, 'Sentiment'], [/empire state/i, 'Empire'], [/philly fed/i, 'Philly Fed'],
  [/trade balance/i, 'Trade Bal'], [/industrial production/i, 'Ind Prod'], [/durable goods/i, 'Durables'],
];
const PLACES = /^(German|French|Italian|Spanish|Tokyo|Chinese|Swiss)\b/i;
export function shortNews(title) {
  const t = String(title || '');
  const place = (t.match(PLACES) || [])[1];
  for (const [re, out] of SHORT) {
    const m = t.match(re);
    if (m) { const s = typeof out === 'function' ? out(m) : out; return place && !/speaks/i.test(t) ? `${place} ${s}` : s; }
  }
  const bare = t.replace(/\b(m\/m|y\/y|q\/q|prelim|flash|advance|final|revised)\b/gi, '').replace(/\s+/g, ' ').trim();
  return bare.length > 16 ? bare.slice(0, 15).trim() + '…' : bare;
}
/** What a release says on the chart: its currency and short name — "USD CPI". */
export const newsLabel = ev => `${ev.country ? ev.country + ' ' : ''}${shortNews(ev.title)}`;

/** Red-folder releases for this instrument's currencies, between two moments. */
export function newsFor(store, inst, from, to) {
  const curs = cd.currenciesOf(inst);
  return (store.data.news?.events || [])
    .filter(ev => ev.impact === 'High' && curs.includes(ev.country))
    .map(ev => ({ at: Date.parse(ev.at) / 1000, title: ev.title, country: ev.country }))
    .filter(ev => Number.isFinite(ev.at) && ev.at >= from && ev.at <= to);
}
/** Paint them; returns the marks drawn ({ x, titles, left }). */
export function paintNews(g, G, C, news, font) {
  g.font = font(10.5);
  const groups = [];
  for (const ev of news) {
    if (ev.at > G.replayT) continue;
    const x = Math.round(G.xT(ev.at)) + 0.5;
    if (x < 0 || x > G.pw) continue;
    const gp = groups.find(q => Math.abs(q.x - x) < 8);
    const label = newsLabel(ev);
    if (gp) { if (!gp.titles.includes(ev.title)) gp.titles.push(ev.title); if (!gp.labels.includes(label)) gp.labels.push(label); }
    else groups.push({ x, titles: [ev.title], labels: [label] });
  }
  const say = (text, x, y, colour, align) => {
    g.textAlign = align; g.lineJoin = 'round';
    g.strokeStyle = C.card; g.lineWidth = 3; g.strokeText(text, x, y);
    g.fillStyle = colour; g.fillText(text, x, y);
    g.textAlign = 'left';
  };
  const placed = [];
  g.textBaseline = 'alphabetic';
  for (const q of groups) {
    const { x, labels } = q;
    g.strokeStyle = withAlpha(C.loss, 0.7); g.lineWidth = 1; g.setLineDash([2, 3]);
    g.beginPath(); g.moveTo(x, NEWS_TOP); g.lineTo(x, G.ph); g.stroke(); g.setLineDash([]);
    g.fillStyle = C.loss; g.fillRect(x - 3.5, NEWS_TOP, 7, 7);
    /* every release, short: "USD CPI", "USD Core CPI" — all of them, none cut off */
    const shown = labels;
    const w = Math.max(...shown.map(s => g.measureText(s).width));
    const left = x + 8 + w > G.pw - 4;
    q.left = left; q.shown = shown;
    const x0 = left ? x - 8 - w : x + 8, x1 = x0 + w;
    let row = 0;
    const hits = r => placed.some(b => b.x0 < x1 + 6 && x0 < b.x1 + 6 && b.r0 < r + shown.length && r < b.r1);
    while (hits(row) && row < 12) row++;
    placed.push({ x0, x1, r0: row, r1: row + shown.length });
    shown.forEach((s, k) => say(s, left ? x - 8 : x + 8, NEWS_TOP + 8 + (row + k) * 13, C.loss, left ? 'right' : 'left'));
  }
  return groups.map(q => ({ x: q.x, titles: q.titles.slice(), labels: q.labels.slice(), left: !!q.left }));
}
