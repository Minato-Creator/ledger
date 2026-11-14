/* ============================================================
   share/cert.js — the profit certificate (a month's or a year's), drawn on a canvas.

   One landscape page: blue on the left fading to warm white on the right,
   with the Laminar mark large, dark blue and out of focus on the blue side.
   The words sit on the light side — the month, what it made, who made it,
   three figures (return, R earned, win rate) and a signature — and the
   wordmark is white, top left.

   drawCert(g, W, H, m) draws the whole page at any size; it is laid out on
   a 1200 × 848 page and scaled, so the preview in the sheet and the saved
   picture are the same drawing (views/certificate.js).
   ============================================================ */
import { wordmarkSvg } from '../ui.js';

/* one export to a line: the single-file build only carries the first name of a pair */
export const CERT_W = 1200;
export const CERT_H = 848;
const INK = '#0B1730', INK_2 = '#2B3A5C', INK_3 = '#4A5878';

/* "L.J", written by hand: the L, its dot, the J's bar, the J, its dot, a line under both. */
const SIGN = [
  ['M46 24 C 62 6, 82 10, 70 36 C 58 62, 44 86, 32 102 C 24 113, 9 106, 15 94 C 21 83, 42 90, 57 97 C 72 104, 88 103, 100 92', 2.6],
  ['M110 98 l1.4 1.2', 2.6],
  ['M132 30 C 150 34, 176 28, 192 16', 2.6],
  ['M164 24 C 163 54, 160 86, 152 110 C 146 128, 127 133, 117 121 C 109 110, 120 99, 134 101 C 154 104, 180 95, 208 78', 2.6],
  ['M216 96 l1.4 1.2', 2.6],
  ['M22 130 C 84 119, 152 124, 236 112', 1.6],
];

/* The Laminar mark's two blades, in the wordmark's own coordinates. */
const BLADES = [
  [[226.0, 190.1], [354.0, 119.8], [354.0, 432.8], [226.0, 501.3]],
  [[282.3, 533.3], [504.9, 403.1], [595.3, 457.9], [368.2, 589.8]],
];

/* The page: blue to pale from left to right, with a pool of warm white on the right. */
function paintPage(g, W, H) {
  const across = g.createLinearGradient(0, 0, W, 0);
  for (const [at, colour] of [[0, '#2463EB'], [0.3, '#4F85EE'], [0.58, '#A9C2F5'], [1, '#E4EBF9']]) across.addColorStop(at, colour);
  g.fillStyle = across; g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W * 0.80, H * 0.52); g.scale(W * 0.46, H * 0.62);
  const pool = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  pool.addColorStop(0, '#FCFCF4'); pool.addColorStop(0.72, 'rgba(252,252,244,0)');
  g.fillStyle = pool; g.fillRect(-3, -3, 6, 6);
  g.restore();
}

/* The mark, large and out of focus. Where a canvas cannot blur (an old webview) it is drawn sharp. */
function paintMark(g, s, top = 92 * s) {
  const k = 562 / 440;
  const at = ([x, y]) => [(40 + (x - 190) * k) * s, top + (y - 85) * k * s];
  g.save();
  if ('filter' in g) g.filter = `blur(${14 * s}px)`;
  for (const blade of BLADES) {
    const pts = blade.map(at);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const fill = g.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    fill.addColorStop(0, '#0E3990'); fill.addColorStop(0.55, '#143FA0'); fill.addColorStop(1, '#1F5BD8');
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath(); g.fill();
  }
  g.restore();
}

/** The certificate's page without its words, for any shape of picture: the same blue fading to warm
    white, the mark blurred on the left and centred down the height (the share card's "Blue", card.js). */
export function paintCertBack(g, W, H) {
  const s = Math.min(W / CERT_W, (H * 0.8) / 690);
  paintPage(g, W, H);
  paintMark(g, s, (H - 690 * s) / 2);
}

let wordmark = null;
/** The wordmark in white, ready to draw on the blue. */
export function certAssets() {
  if (!wordmark) {
    wordmark = new Promise(res => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(wordmarkSvg('#FFFFFF'));
    });
  }
  return wordmark;
}

/**
 * @param {CanvasRenderingContext2D} g
 * @param {number} W, H   the canvas, in pixels (1200 : 848)
 * @param {object} m      { month, kind, amount, name, ret, r, rate, font, wordmark }
 */
export function drawCert(g, W, H, m) {
  const s = W / CERT_W;
  const F = (wt, px) => `${wt} ${px * s}px ${m.font || 'system-ui, sans-serif'}`;
  const track = em => { if ('letterSpacing' in g) g.letterSpacing = `${em}px`; };
  const LEFT = 640, RIGHT = 1136, FOOT = 800;
  g.save();
  paintPage(g, W, H);
  paintMark(g, s);

  /* the wordmark, top left, white on the blue */
  if (m.wordmark) g.drawImage(m.wordmark, 64 * s, 52 * s, 168 * s, 28 * s);

  /* the words: a stack of lines on the light side, centred above the bottom row */
  const lines = [
    { txt: m.month, wt: 700, px: 40, lh: 48, ink: INK, track: -0.02, fit: RIGHT - LEFT },
    { txt: m.kind || 'Monthly profit', wt: 500, px: 21, lh: 25, ink: INK_2, track: 0 },
    { txt: m.amount, wt: 800, px: 100, lh: 108, ink: INK, track: -0.045, fit: RIGHT - LEFT },
    ...(m.name ? [
      { txt: 'Presented to', wt: 400, px: 19, lh: 23, ink: INK_2, track: 0, before: 22 },
      { txt: m.name, wt: 700, px: 32, lh: 39, ink: INK, track: -0.01, fit: RIGHT - LEFT },
    ] : []),
  ];
  const GAP = 6;
  const tall = lines.reduce((sum, l, i) => sum + l.lh + (l.before || 0) + (i ? GAP : 0), 0);
  let y = (52 + 695) / 2 - tall / 2;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  for (const [i, l] of lines.entries()) {
    y += (i ? GAP : 0) + (l.before || 0);
    let px = l.px;
    g.font = F(l.wt, px); track(l.track * px * s);
    if (l.fit) {
      const w = g.measureText(l.txt).width / s;
      if (w > l.fit) { px *= l.fit / w; g.font = F(l.wt, px); track(l.track * px * s); }
    }
    g.fillStyle = l.ink;
    g.fillText(l.txt, LEFT * s, (y + l.lh / 2 + px * 0.355) * s);
    y += l.lh;
  }

  /* bottom row, left: the three figures */
  let x = LEFT;
  for (const [label, value] of [['RETURN', m.ret], ['R EARNED', m.r], ['WIN RATE', m.rate]]) {
    g.font = F(500, 14); track(0.06 * 14 * s);
    const lw = g.measureText(label).width / s;
    g.fillStyle = INK_3; g.fillText(label, x * s, (FOOT - 33) * s);
    g.font = F(700, 21); track(0);
    const vw = g.measureText(value).width / s;
    g.fillStyle = INK; g.fillText(value, x * s, (FOOT - 6) * s);
    x += Math.max(lw, vw) + 40;
  }

  /* bottom row, right: the signature, over whose it is */
  g.textAlign = 'right';
  g.font = F(500, 12); track(0.06 * 12 * s);
  g.fillStyle = INK_3; g.fillText('LAMINAR JOURNAL', RIGHT * s, (FOOT - 3) * s);
  track(0);
  g.translate((RIGHT - 68) * s, (FOOT - 95 + 38) * s);
  g.rotate(-5 * Math.PI / 180);
  g.scale(0.544 * s, 0.544 * s);
  g.translate(-125, -70);
  g.strokeStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [d, w] of SIGN) { g.lineWidth = w; g.stroke(new Path2D(d)); }
  g.restore();
}
