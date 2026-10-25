/* ============================================================
   share/card.js — the share card, drawn on a canvas.

   One function draws one frame: drawCard(g, W, H, t, model). The preview
   in the sheet, the video, the GIF and the photo all call it, so what you
   see while you set it up is what you get out.

   `t` is seconds since the card started. The card comes in over ANIM
   seconds — the instrument, the figure counting up, the numbers under it,
   the candles walking in from the left with an Entry and an Exit pinned on
   them — and then holds. A photo is drawn at the end (t = Infinity).

   The candles are OANDA's one-minute prices for the trade's own day, built
   up to the timeframe chosen. Only the candles are drawn: no grid, no
   axis, no panel behind them, so they sit straight on the background.
   ============================================================ */
import * as cd from '../candles.js';
import { markParts } from '../flags.js';
import { wordmarkSvg } from '../ui.js';

export const SIZES = [
  ['landscape', 'Landscape', 1200, 630],
  ['portrait', 'Portrait', 1080, 1920],
  ['wide', '16:9', 1280, 720],
  ['square', 'Square', 1080, 1080],
  ['tall', '4:5', 1080, 1350],
];
export const sizeOf = k => SIZES.find(s => s[0] === k) || SIZES[0];
export const QUALITIES = [['std', 'Standard', 1920], ['4k', '4K', 3840]];
/** The card's size in pixels, even numbers (video encoders want them). */
export function pixelsFor(sizeKey, quality) {
  const [, , w, h] = sizeOf(sizeKey);
  const long = (QUALITIES.find(q => q[0] === quality) || QUALITIES[0])[2];
  const k = long / Math.max(w, h);
  const even = v => Math.max(2, Math.round(v * k / 2) * 2);
  return { w: even(w), h: even(h) };
}
export const TFS = [['1m', 1], ['5m', 5], ['15m', 15], ['1h', 60]];

/* the timeline, in seconds */
export const ANIM = 3.4;
const T_HEAD = [0, 0.45], T_FIG = [0.25, 1.45], T_CHART = [0.5, 2.7];

/* ---------- small maths ---------- */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const prog = (t, [a, b]) => clamp((t - a) / (b - a));
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeBack = p => { const k = 1.7; return 1 + (k + 1) * Math.pow(p - 1, 3) + k * Math.pow(p - 1, 2); };
const rgba = (hex, a) => {
  const m = String(hex || '').replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map(x => x + x).join('') : m.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/* ============================================================
   The chart: which candles, around the trade
   ============================================================ */
/** The timeframe that shows the trade in a sensible number of candles. */
export function autoTf(entryT, exitT) {
  const mins = Math.max(1, (exitT - entryT) / 60);
  for (const [, m] of TFS) if (mins / m <= 40) return m;
  return 60;
}

/**
 * The candles for the card: the trade, a stretch before it and a little
 * after, at `tf` minutes. Returns null when there is nothing to draw.
 */
export function chartFrom(rows, tf, entryT, exitT, entryP, exitP) {
  const all = cd.aggregate(rows || [], tf);
  if (all.length < 2) return null;
  const at = T => {               // the candle holding moment T
    let lo = 0, hi = all.length - 1;
    if (T < all[0][0]) return 0;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (all[mid][0] <= T) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const ie = at(entryT), ix = Math.max(ie, at(exitT));
  const span = ix - ie + 1;
  const MAX = 150;
  let pre = Math.round(Math.max(10, span * 0.7)), post = Math.round(Math.max(6, span * 0.35));
  if (span + pre + post > MAX) {
    const room = Math.max(0, MAX - span);
    pre = Math.round(room * 0.66); post = room - pre;
  }
  const a = Math.max(0, ie - pre), z = Math.min(all.length - 1, ix + post);
  const bars = all.slice(a, z + 1);
  const fin = v => v != null && v !== '' && Number.isFinite(Number(v));
  return {
    bars, ie: ie - a, ix: ix - a, tf,
    entryP: fin(entryP) ? Number(entryP) : all[ie][1],
    exitP: fin(exitP) ? Number(exitP) : all[ix][4],
    crowded: span > MAX,
  };
}

/* ============================================================
   Pictures the card needs: the instrument's flags, the wordmark
   ============================================================ */
const images = new Map();
function svgImage(svg) {
  if (images.has(svg)) return images.get(svg);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  images.set(svg, img);
  return img;
}
export async function loadAssets(symbol) {
  const parts = markParts(symbol);
  const discs = parts.discs.map(d => ({ ...d, img: d.svg ? svgImage(d.svg) : null }));
  const wordmark = { light: svgImage(wordmarkSvg('#ffffff')), dark: svgImage(wordmarkSvg('#111111')) };
  const all = [...discs.map(d => d.img), wordmark.light, wordmark.dark].filter(Boolean);
  await Promise.all(all.map(i => (i.decode ? i.decode() : Promise.resolve()).catch(() => {})));
  return { kind: parts.kind, discs, letters: parts.letters, wordmark };
}

/* ============================================================
   Backgrounds made here — no files, so the sheet has something to show
   before any of your own are added
   ============================================================ */
export const ORIGINALS = [
  ['night', 'Night'],
  ['aurora', 'Aurora'],
  ['money', 'Money'],
  ['grid', 'Grid'],
  ['paper', 'Paper'],
];
export const isLightOriginal = id => id === 'paper';

let grain = null;
function grainTile() {
  if (grain) return grain;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 192;
  const g = cv.getContext('2d');
  const im = g.createImageData(192, 192);
  let s = 17;
  for (let i = 0; i < im.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s >> 16) & 255;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  grain = cv;
  return cv;
}
function paintGrain(g, W, H, t, alpha) {
  const tile = grainTile();
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = 'overlay';
  const ox = Math.floor((t * 37) % 192), oy = Math.floor((t * 53) % 192);
  const pat = g.createPattern(tile, 'repeat');
  g.translate(-ox, -oy);
  g.fillStyle = pat;
  g.fillRect(0, 0, W + 192, H + 192);
  g.restore();
}

function paintOriginal(g, W, H, t, id, m) {
  const P = m.colours.profit, L = m.colours.loss;
  const tone = m.tone === 'loss' ? L : m.tone === 'win' ? P : '#9CA3AF';
  const D = Math.max(W, H);
  if (id === 'paper') {
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#F6F4EF'); bg.addColorStop(1, '#E9E6DF');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const sweep = (t * 0.06) % 1;
    const lg = g.createRadialGradient(W * (0.2 + sweep * 0.6), H * 0.1, 0, W * 0.5, H * 0.5, D * 0.8);
    lg.addColorStop(0, 'rgba(255,255,255,.65)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    paintGrain(g, W, H, t, 0.08);
    return;
  }
  g.fillStyle = '#060709'; g.fillRect(0, 0, W, H);
  if (id === 'aurora' || id === 'money') {
    const blobs = id === 'aurora'
      ? [[P, 0.8, 0.30, 0.25, 0.55], ['#3B82F6', 1.1, 0.75, 0.35, 0.5], ['#7C5CFF', 0.7, 0.55, 0.85, 0.45]]
      : [[tone, 0.6, 0.78, 0.4, 0.75], [tone, 0.9, 0.25, 0.9, 0.35], ['#ffffff', 0.5, 0.6, 0.15, 0.06]];
    g.save();
    g.globalCompositeOperation = 'screen';
    blobs.forEach(([col, sp, cx, cy, a], i) => {
      const x = W * (cx + 0.12 * Math.sin(t * 0.35 * sp + i * 2.1));
      const y = H * (cy + 0.14 * Math.cos(t * 0.28 * sp + i * 1.3));
      const r = D * (0.42 + 0.05 * Math.sin(t * 0.5 + i));
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rgba(col, a)); rg.addColorStop(1, rgba(col, 0));
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    });
    g.restore();
  } else if (id === 'grid') {
    const hz = H * 0.58;
    const glow = g.createRadialGradient(W * 0.5, hz, 0, W * 0.5, hz, D * 0.6);
    glow.addColorStop(0, rgba(tone, 0.32)); glow.addColorStop(1, rgba(tone, 0));
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = Math.max(1, D / 1400);
    for (let i = -14; i <= 14; i++) {
      g.beginPath(); g.moveTo(W * 0.5 + i * W * 0.02, hz); g.lineTo(W * 0.5 + i * W * 0.22, H); g.stroke();
    }
    const shift = (t * 0.35) % 1;
    for (let k = 0; k < 14; k++) {
      const p = (k + shift) / 14, y = hz + (H - hz) * p * p;
      g.globalAlpha = p; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    g.restore();
  } else {
    /* night: a slow light across black */
    const x = W * (-0.3 + ((t * 0.07) % 1) * 1.6);
    const lg = g.createLinearGradient(x - D * 0.4, 0, x + D * 0.4, H);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.06)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    const rg = g.createRadialGradient(W * 0.7, H * 0.45, 0, W * 0.7, H * 0.45, D * 0.7);
    rg.addColorStop(0, rgba(tone, 0.10)); rg.addColorStop(1, rgba(tone, 0));
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }
  const vg = g.createRadialGradient(W / 2, H / 2, D * 0.25, W / 2, H / 2, D * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  paintGrain(g, W, H, t, 0.10);
}

/** A still of one of the backgrounds made here, for its tile in the sheet. */
export function originalThumb(id, colours, tone, w = 240, h = 136) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  paintOriginal(cv.getContext('2d'), w, h, 1.6, id, { colours, tone });
  return cv.toDataURL('image/jpeg', 0.8);
}

/** A picture or a playing clip, cropped to cover the card; fx, fy say where the crop sits. */
function paintMedia(g, W, H, el, fx = 0.5, fy = 0.5) {
  const vw = el.videoWidth || el.naturalWidth || el.width, vh = el.videoHeight || el.naturalHeight || el.height;
  if (!vw || !vh || (el.readyState != null && el.readyState < 2)) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); return; }
  const k = Math.max(W / vw, H / vh);
  const dw = vw * k, dh = vh * k;
  g.drawImage(el, (W - dw) * fx, (H - dh) * fy, dw, dh);
}

/** How far a drag of (dx, dy) card pixels moves the crop. */
export function nudgeFocus(bg, W, H, dx, dy) {
  const el = bg.el; if (!el) return null;
  const vw = el.videoWidth || el.naturalWidth || el.width, vh = el.videoHeight || el.naturalHeight || el.height;
  if (!vw || !vh) return null;
  const k = Math.max(W / vw, H / vh), sx = W - vw * k, sy = H - vh * k;
  return {
    fx: sx < -0.5 ? clamp((bg.fx ?? 0.5) + dx / sx) : 0.5,
    fy: sy < -0.5 ? clamp((bg.fy ?? 0.5) + dy / sy) : 0.5,
  };
}

/* ============================================================
   One frame
   ============================================================ */
/**
 * @param {CanvasRenderingContext2D} g
 * @param {number} W, H   the canvas, in pixels
 * @param {number} t      seconds since the card began (Infinity: the end)
 * @param {object} m      what to draw — see the sheet (views/share.js)
 */
export function drawCard(g, W, H, t, m) {
  const o = m.opts;
  const wide = W / H >= 1.3;
  const s = wide ? Math.min(W / 1200, H / 630) : W / 1080;
  const light = m.bg.kind === 'original' && isLightOriginal(m.bg.id);
  const ink = light ? '#121212' : '#FFFFFF';
  const inkA = a => (light ? `rgba(18,18,18,${a})` : `rgba(255,255,255,${a})`);
  const F = (wt, px) => `${wt} ${px}px ${m.font}`;

  g.save();
  g.clearRect(0, 0, W, H);
  const R = o.corners === 'straight' ? 0 : 34 * s;
  if (R) { g.beginPath(); g.roundRect(0, 0, W, H, R); g.clip(); }

  /* ---- the background ---- */
  if (m.bg.kind === 'original') paintOriginal(g, W, H, t === Infinity ? ANIM : t, m.bg.id, m);
  else if (m.bg.el) paintMedia(g, W, H, m.bg.el, m.bg.fx, m.bg.fy);
  else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
  if (m.bg.kind !== 'original') {
    if (m.bg.dim > 0) { g.fillStyle = `rgba(0,0,0,${clamp(m.bg.dim)})`; g.fillRect(0, 0, W, H); }
    /* a shade behind the writing, so it reads on any clip */
    const lg = wide ? g.createLinearGradient(0, 0, W * 0.62, 0) : g.createLinearGradient(0, 0, 0, H * 0.55);
    lg.addColorStop(0, 'rgba(0,0,0,.45)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    const fg = g.createLinearGradient(0, H, 0, H - 150 * s);
    fg.addColorStop(0, 'rgba(0,0,0,.4)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fg; g.fillRect(0, 0, W, H);
  }

  const pad = (wide ? 54 : 70) * s;
  const pnlOnly = o.style === 'pnl';
  const blockW = wide && !pnlOnly ? W * 0.5 - pad : W - pad * 2;
  g.textBaseline = 'alphabetic';

  /* ---- the instrument ---- */
  const ah = easeOut(prog(t, T_HEAD));
  const M = 46 * s;
  const headY = pad;
  g.save();
  g.globalAlpha = ah; g.translate(0, (1 - ah) * 12 * s);
  drawMark(g, pad, headY, M, m.assets, light, s);
  g.font = F(700, 38 * s); g.fillStyle = ink;
  const symX = pad + M + 14 * s, symY = headY + M * 0.5 + 13 * s;
  g.fillText(m.symbol, symX, symY);
  const symW = g.measureText(m.symbol).width;
  g.font = F(600, 15 * s);
  try { g.letterSpacing = `${1.6 * s}px`; } catch { /* older canvas */ }
  g.fillStyle = inkA(0.6);
  g.fillText(m.meta, symX + symW + 14 * s, symY - 2 * s);
  try { g.letterSpacing = '0px'; } catch { /* fine */ }
  g.restore();

  /* ---- the figure, counting up ---- */
  const fp = prog(t, T_FIG);
  const figText = fp >= 1 ? m.figure : m.figAt(easeOut(fp));
  let figPx = (pnlOnly ? (wide ? 150 : 170) : wide ? 118 : 136) * s;
  g.font = F(750, figPx);
  const fullW = g.measureText(m.figure).width;
  if (fullW > blockW) { figPx *= blockW / fullW; g.font = F(750, figPx); }
  const figY = pnlOnly
    ? (wide ? H * 0.5 + figPx * 0.32 : H * 0.42 + figPx * 0.32)
    : headY + M + 26 * s + figPx * 0.78;
  const winTone = m.tone === 'loss' ? m.colours.loss : m.tone === 'win' ? m.colours.profit : (light ? '#121212' : '#FFFFFF');
  const figCol = o.figure === 'colour' ? winTone : ink;
  g.save();
  g.globalAlpha = clamp(fp * 3);
  g.fillStyle = figCol;
  g.shadowColor = o.figure === 'colour' ? rgba(winTone, light ? 0.25 : 0.55) : (light ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.55)');
  g.shadowBlur = (light ? 14 : 30) * s * (0.6 + 0.4 * Math.sin(Math.min(1, fp) * Math.PI / 2));
  g.fillText(figText, pad, figY);
  g.shadowBlur = 0;
  g.fillText(figText, pad, figY);
  g.restore();

  /* ---- the numbers under it ---- */
  if (!pnlOnly && o.stats !== 'hidden' && m.stats.length) {
    const rowH = (wide ? 34 : 42) * s, fs = (wide ? 20.5 : 25) * s;
    const top = figY + (wide ? 30 : 40) * s;
    g.font = F(500, fs);
    const labW = Math.max(...m.stats.map(([k]) => g.measureText(k).width)) + 28 * s;
    g.font = F(650, fs);
    const valW = Math.max(...m.stats.map(([, v]) => g.measureText(v).width));
    if (o.stats === 'boxed') {
      const a = easeOut(prog(t, [0.5, 0.9]));
      g.save(); g.globalAlpha = a;
      g.fillStyle = light ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.38)';
      g.beginPath(); g.roundRect(pad - 16 * s, top - fs * 0.2 - 12 * s, labW + valW + 32 * s, rowH * m.stats.length + 18 * s, 16 * s); g.fill();
      g.restore();
    }
    m.stats.forEach(([k, v], i) => {
      const a = easeOut(prog(t, [0.55 + i * 0.09, 0.95 + i * 0.09]));
      const y = top + rowH * i + fs * 0.75;
      g.save(); g.globalAlpha = a; g.translate((1 - a) * -10 * s, 0);
      g.font = F(500, fs); g.fillStyle = inkA(0.58); g.fillText(k, pad, y);
      g.font = F(650, fs); g.fillStyle = ink; g.fillText(v, pad + labW, y);
      g.restore();
    });
  }

  /* ---- the candles ---- */
  if (!pnlOnly && o.style !== 'none' && m.chart) {
    const box = wide
      ? { x: W * 0.535, y: H * 0.17, w: W * 0.465 - pad, h: H * 0.6 }
      : { x: pad, y: H * 0.53, w: W - pad * 2, h: H * 0.28 };
    drawChart(g, box, t, m, s, light);
  }

  /* ---- the foot: the wordmark, who, and the setup ---- */
  const fa = easeOut(prog(t, [0.7, 1.15]));
  g.save(); g.globalAlpha = fa;
  const footY = H - pad;
  const wm = m.assets ? (light ? m.assets.wordmark.dark : m.assets.wordmark.light) : null;
  const wmH = 19 * s, wmW = wmH * 926 / 155;
  let fx = pad;
  if (wm) { try { g.drawImage(wm, fx, footY - wmH, wmW, wmH); } catch { /* not decoded yet */ } }
  fx += wmW;
  if (m.name) {
    g.font = F(500, 16 * s); g.fillStyle = inkA(0.5);
    g.fillText('×', fx + 12 * s, footY - 3 * s);
    fx += 12 * s + g.measureText('×').width + 12 * s;
    const av = 24 * s;
    /* your picture (or the video's frame now), else your initials on your colour */
    const pic = m.avatar, pw = pic ? (pic.videoWidth || pic.naturalWidth || 0) : 0, ph = pic ? (pic.videoHeight || pic.naturalHeight || 0) : 0;
    const ready = pw > 0 && ph > 0 && (pic.tagName !== 'VIDEO' || pic.readyState >= 2);
    g.save();
    g.beginPath(); g.arc(fx + av / 2, footY - wmH / 2, av / 2, 0, Math.PI * 2);
    if (ready) {
      g.clip();
      const k = Math.max(av / pw, av / ph);
      try { g.drawImage(pic, fx + av / 2 - pw * k / 2, footY - wmH / 2 - ph * k / 2, pw * k, ph * k); } catch { /* not decoded yet */ }
    } else {
      g.fillStyle = m.userColour || '#3B82F6'; g.fill();
      g.font = F(700, 10.5 * s); g.fillStyle = m.userInk || '#fff'; g.textAlign = 'center';
      g.fillText(m.initials, fx + av / 2, footY - wmH / 2 + 3.8 * s);
      g.textAlign = 'left';
    }
    g.restore();
    g.font = F(650, 16 * s); g.fillStyle = ink;
    g.fillText(m.name, fx + av + 8 * s, footY - 3 * s);
  }
  if (m.tagline) {
    g.font = F(600, 14 * s); g.fillStyle = inkA(0.55); g.textAlign = 'right';
    try { g.letterSpacing = `${1.2 * s}px`; } catch { /* fine */ }
    g.fillText(m.tagline.toUpperCase(), W - pad, footY - 3 * s);
    try { g.letterSpacing = '0px'; } catch { /* fine */ }
    g.textAlign = 'left';
  }
  g.restore();
  g.restore();
}

/* the instrument's mark: a pair's two flags, one disc, or letters */
function drawMark(g, x, y, M, A, light, s) {
  if (!A) return;
  /* No ring round a disc. Where a pair's base overlaps its quote, the quote
     is cut away instead (`cut`: the base's circle and a hair round it). */
  const disc = (d, cx, cy, D, cut) => {
    g.save();
    g.beginPath(); g.arc(cx, cy, D / 2, 0, Math.PI * 2); g.clip();
    if (cut) {
      g.beginPath(); g.rect(cx - D, cy - D, D * 2, D * 2);
      g.moveTo(cut.x + cut.r, cut.y); g.arc(cut.x, cut.y, cut.r, 0, Math.PI * 2, true);
      g.clip('evenodd');
    }
    if (d?.img) { try { g.drawImage(d.img, cx - D / 2, cy - D / 2, D, D); } catch { /* not ready */ } }
    else { g.fillStyle = light ? '#ddd' : '#2a2a2a'; g.fillRect(cx - D / 2, cy - D / 2, D, D); }
    if (d?.glyph) {
      g.fillStyle = d.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      const px = D * d.size / 30;
      g.font = `${d.weight || 700} ${px}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      if ('letterSpacing' in g) g.letterSpacing = (d.track || 0) * px + 'px';
      g.fillText(d.glyph, cx, cy + D * 0.03);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }
    g.restore();
  };
  if (A.kind === 'pair') {
    const D = M * 0.7;
    const base = { x: x + D / 2, y: y + M - D / 2 };
    disc(A.discs[0], x + M - D / 2, y + D / 2, D, { ...base, r: D / 2 + 1.5 * s });
    disc(A.discs[1], base.x, base.y, D);
  } else if (A.kind === 'one') {
    disc(A.discs[0], x + M / 2, y + M / 2, M * 0.86);
  } else if (A.letters) {
    g.save();
    g.fillStyle = light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.14)';
    g.beginPath(); g.arc(x + M / 2, y + M / 2, M * 0.43, 0, Math.PI * 2); g.fill();
    g.fillStyle = light ? '#333' : '#fff'; g.textAlign = 'center';
    g.font = `700 ${M * 0.32}px system-ui, sans-serif`;
    g.fillText(A.letters, x + M / 2, y + M / 2 + M * 0.11);
    g.restore();
  }
}

/* the candles (or a line), the entry and the exit */
function drawChart(g, box, t, m, s, light) {
  const ch = m.chart, o = m.opts;
  const bars = ch.bars, n = bars.length;
  let lo = Infinity, hi = -Infinity;
  for (const b of bars) { if (b[3] < lo) lo = b[3]; if (b[2] > hi) hi = b[2]; }
  for (const p of [ch.entryP, ch.exitP]) if (Number.isFinite(p)) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
  const padP = (hi - lo) * 0.1 || Math.abs(hi) * 0.001 || 1;
  lo -= padP; hi += padP;
  const step = box.w / n;
  const X = i => box.x + (i + 0.5) * step;
  const Y = p => box.y + (hi - p) / (hi - lo) * box.h;

  /* candles arrive left to right, each growing from its open */
  const cp = prog(t, T_CHART);
  const shown = cp * n;
  const at = i => T_CHART[0] + (T_CHART[1] - T_CHART[0]) * ((i + 1) / n);   // when candle i is whole
  const up = o.candles === 'white' ? (light ? '#121212' : '#FFFFFF') : m.colours.profit;
  const down = o.candles === 'white' ? (light ? 'rgba(18,18,18,.4)' : 'rgba(255,255,255,.42)') : m.colours.loss;

  g.save();
  g.shadowColor = light ? 'rgba(0,0,0,.12)' : 'rgba(0,0,0,.45)';
  g.shadowBlur = 6 * s;
  if (o.style === 'line') {
    const last = Math.min(n - 1, Math.floor(shown));
    if (shown > 0.01) {
      g.beginPath();
      for (let i = 0; i <= last; i++) { const x = X(i), y = Y(bars[i][4]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      if (last < n - 1) {
        const f = shown - last, x0 = X(last), y0 = Y(bars[last][4]), y1 = Y(bars[last + 1][4]);
        g.lineTo(x0 + step * f, y0 + (y1 - y0) * f);
      }
      g.strokeStyle = light ? '#121212' : '#FFFFFF';
      g.lineWidth = 2.6 * s; g.lineJoin = 'round'; g.lineCap = 'round';
      g.shadowColor = light ? 'rgba(0,0,0,.15)' : 'rgba(255,255,255,.45)'; g.shadowBlur = 10 * s;
      g.stroke();
    }
  } else {
    const cw = Math.max(1.2 * s, step * 0.62), wick = Math.max(1, 1.4 * s);
    for (let i = 0; i < n; i++) {
      const f = clamp(shown - i);
      if (f <= 0) break;
      const [, op, hp, lp, cl] = bars[i];
      const rise = cl >= op;
      const col = rise ? up : down;
      const c2 = op + (cl - op) * easeOut(f);
      const midY = Y(op);
      g.globalAlpha = clamp(f * 2);
      g.fillStyle = col; g.strokeStyle = col; g.lineWidth = wick;
      const top = Y(op + (hp - op) * easeOut(f)), bot = Y(op + (lp - op) * easeOut(f));
      g.beginPath(); g.moveTo(X(i), top); g.lineTo(X(i), bot); g.stroke();
      const y0 = Math.min(midY, Y(c2)), h = Math.max(1 * s, Math.abs(Y(c2) - midY));
      g.fillRect(X(i) - cw / 2, y0, cw, h);
    }
  }
  g.restore();

  /* the entry and the exit, pinned on as the candles reach them */
  const pt = i => [X(i), Y(i === ch.ie ? ch.entryP : ch.exitP)];
  const [ex, ey] = pt(ch.ie), [xx, xy] = pt(ch.ix);
  const tIn = at(ch.ie), tOut = at(ch.ix);
  /* the run from one to the other, drawn once the exit is there */
  const lp = prog(t, [tOut + 0.05, tOut + 0.55]);
  if (lp > 0) {
    g.save();
    g.strokeStyle = light ? 'rgba(18,18,18,.55)' : 'rgba(255,255,255,.7)';
    g.lineWidth = 1.6 * s; g.setLineDash([6 * s, 5 * s]);
    g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + (xx - ex) * easeOut(lp), ey + (xy - ey) * easeOut(lp)); g.stroke();
    g.restore();
  }
  const pin = (x, y, label, since) => {
    const p = prog(t, [since, since + 0.35]);
    if (p <= 0) return;
    const k = easeBack(p);
    g.save();
    g.globalAlpha = clamp(p * 2);
    /* the point itself */
    g.fillStyle = light ? '#121212' : '#FFFFFF';
    g.beginPath(); g.arc(x, y, 4.2 * s, 0, Math.PI * 2); g.fill();
    g.strokeStyle = light ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.55)'; g.lineWidth = 1.5 * s; g.stroke();
    /* the pill, above the point (below it near the top) */
    g.font = `700 ${15 * s}px ${m.font}`;
    const tw = g.measureText(label).width, pw = tw + 22 * s, ph = 29 * s;
    const above = y - ph - 12 * s > box.y - 30 * s;
    const py = above ? y - ph - 10 * s : y + 10 * s;
    const px = Math.min(Math.max(x - pw / 2, box.x - 20 * s), box.x + box.w + 20 * s - pw);
    g.translate(x, y); g.scale(k, k); g.translate(-x, -y);
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 10 * s;
    g.fillStyle = light ? '#121212' : '#FFFFFF';
    g.beginPath(); g.roundRect(px, py, pw, ph, ph / 2); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = light ? '#FFFFFF' : '#111111';
    g.fillText(label, px + 11 * s, py + ph / 2 + 5.3 * s);
    g.restore();
  };
  pin(ex, ey, 'Entry', tIn);
  pin(xx, xy, 'Exit', tOut);
}
