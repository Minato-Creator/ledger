/* ============================================================
   intro.js — the opening, each time Laminar starts.

   On black: the L pops up, LAMINAR slides out of it to the right as the L
   moves left (one progress for both, so it stays centred), and holds a
   moment. Then a quick snap: the intro pushes in a touch and is gone in a
   fifth of a second while the app clicks into place under it. (The field
   of dots that rippled out from the letters is gone — Minato, 7 Nov: "just
   keep the logo and laminar text animation".)

   The app loads and draws underneath the whole time; if it is not ready by
   the snap, the name holds until it is. A click or any key skips to the
   snap. Settings → Appearance → Intro: Full, Short (the same, quicker)
   or Off; Motion Off and the system's reduced motion leave it out too, and
   so do the test suites (navigator.webdriver) unless one sets
   window.__intro to watch it. Built in the intro page Minato approved
   (3 Nov) and carried over as it was.
   ============================================================ */
import { MARK_G, LETTERS_G } from './ui.js';

const KEY = 'laminar:intro';
export const INTROS = [['full', 'Full'], ['short', 'Short'], ['off', 'Off']];
export function introMode() {
  try { const v = localStorage.getItem(KEY); return INTROS.some(([k]) => k === v) ? v : 'full'; } catch { return 'full'; }
}
export function setIntroMode(v) { try { localStorage.setItem(KEY, v); } catch { /* a private window: Full each time */ } }

/* the wordmark's proportions (its own units: the L 0–122 of 155 tall, the letters 200–920) */
const U = { markW: 126 / 159, textL: 200 / 155, textW: 720 / 155, textT: 25 / 155, textH: 105 / 155, W: 920 / 155 };
/* the timeline, in seconds at Full: the name is out by 2.05, held a breath, then the snap */
const T = { pop: 0.25, split: 1.0, splitLen: 1.05, snap: 2.6, snapLen: 0.2 };

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out4 = u => 1 - Math.pow(1 - u, 4);
/* a damped spring from 0 to 1: overshoots once, settles */
const spring = (t, w = 17, z = 0.38) => { if (t <= 0) return 0; const wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t)); };

/** Start it (straight away at boot); call ready() once the app underneath has drawn. */
export function startIntro() {
  const mode = introMode();
  const auto = typeof navigator !== 'undefined' && navigator.webdriver && !window.__intro;
  const still = document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (mode === 'off' || auto || still) return { ready() {}, playing: false };
  const speed = mode === 'short' ? 1.75 : 1;

  const ov = document.createElement('div');
  ov.className = 'intro'; ov.setAttribute('role', 'presentation');
  ov.innerHTML = `<div class="intro-stage"><div class="intro-lockup" role="img" aria-label="Laminar">`
    + `<span class="intro-mark"><svg viewBox="-2 -2 126 159" fill="currentColor" aria-hidden="true">${MARK_G}</svg></span>`
    + `<span class="intro-clip"><span class="intro-word"><svg viewBox="200 25 720 105" fill="currentColor" aria-hidden="true">${LETTERS_G}</svg></span></span>`
    + `</div></div>`;
  document.body.append(ov);
  const lockup = ov.querySelector('.intro-lockup'), mark = ov.querySelector('.intro-mark');
  const clip = ov.querySelector('.intro-clip'), word = ov.querySelector('.intro-word');
  const app = document.getElementById('app');

  /* ---------- sizes ---------- */
  let H = 0, G = {};
  function layout() {
    H = Math.round(Math.max(38, Math.min(76, innerWidth * 0.075)));
    G = { markW: U.markW * H, markH: H * 159 / 155, textL: U.textL * H, textW: U.textW * H, textT: U.textT * H, textH: U.textH * H, W: U.W * H, pad: Math.round(H * 0.45) };
    lockup.style.width = G.W + 'px'; lockup.style.height = H + 'px';
    mark.style.width = G.markW + 'px'; mark.style.height = G.markH + 'px'; mark.style.top = (-2 / 155 * H) + 'px';
    clip.style.top = (G.textT - G.pad) + 'px'; clip.style.height = (G.textH + G.pad * 2) + 'px';
    word.style.top = G.pad + 'px'; word.style.width = G.textW + 'px'; word.style.height = G.textH + 'px';
  }

  /* ---------- the name ---------- */
  function paintLockup(t) {
    const ps = spring(t - T.pop), pa = clamp((t - T.pop) / 0.18);
    const p = easeInOut(clamp((t - T.split) / T.splitLen));
    const gap = G.textL - G.markW, markX = (G.W - G.markW) / 2 * (1 - p), right = markX + G.markW;
    mark.style.opacity = pa;
    mark.style.transform = `translate3d(${markX}px,0,0) scale(${Math.max(0, ps)})`;
    clip.style.left = (right - 1) + 'px';
    clip.style.width = Math.max(0, G.W - right + 40) + 'px';
    word.style.transform = `translate3d(${gap * p - G.textW * (1 - p) + 1}px,0,0)`;
    word.style.opacity = clamp(p * 2.2);
  }

  /* ---------- running it ---------- */
  let t0 = 0, raf = 0, isReady = false, skip = false, snapAt = null, last = 0;
  function frame(now) {
    if (!t0) t0 = now;
    const t = (now - t0) / 1000 * speed;
    last = t;
    if (snapAt == null && isReady && (t >= T.snap || skip)) snapAt = t;
    paintLockup(skip && snapAt != null ? Math.max(t, T.split + T.splitLen) : t);
    if (snapAt != null) {
      /* the snap: the intro pushes in and goes; the app settles from a touch smaller */
      const s = out4(clamp((t - snapAt) / (T.snapLen * speed)));
      const land = out4(clamp((t - snapAt) / (T.snapLen * speed * 1.6)));
      ov.style.opacity = 1 - s;
      lockup.style.transform = `scale(${1 + s * 0.12})`;
      if (app) app.style.transform = land < 1 ? `scale(${0.965 + 0.035 * land})` : '';
      if (land >= 1) return finish();
    }
    raf = requestAnimationFrame(frame);
  }
  function finish() {
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', layout);
    if (app) app.style.transform = '';
    ov.remove();
  }
  /* a click or any key: straight to the snap (once the app is there to snap to) */
  function onSkip() { skip = true; }
  function onKey(e) { e.preventDefault(); e.stopPropagation(); onSkip(); }
  ov.addEventListener('pointerdown', onSkip);
  addEventListener('keydown', onKey, true);
  addEventListener('resize', layout);
  layout();
  paintLockup(0);
  raf = requestAnimationFrame(frame);
  return {
    playing: true,
    ready() { isReady = true; },
    get t() { return last; }, get snapped() { return snapAt != null; },
  };
}
