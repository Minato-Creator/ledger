/* ============================================================
   intro.js — the opening, each time Laminar starts.

   On black, straight to the logo and LAMINAR, as water (11 Nov; Minato
   picked "from the logo" out of three in a preview): a ripple starts on
   the logo and travels across the name, uncovering it as it goes. No drop
   is drawn and the black stays still — the ripple shows only in the
   writing, which bends and catches the light like a reflection, then
   settles. Then the quick snap as before: the intro pushes in a touch and
   is gone in a fifth of a second while the app clicks into place under it.

   It is one WebGL canvas: the wordmark drawn once as a picture, and a
   small shader that looks that picture up through the slope of the water
   (rings behind a front that moves out from the drop, dying as they go).
   Where there is no WebGL the name simply fades in.

   The app loads and draws underneath the whole time; if it is not ready by
   the snap, the name holds until it is. A click or any key skips to the
   snap. Settings → Intro: Full, Short (the same, quicker) or Off; Motion
   Off and the system's reduced motion leave it out too, and so do the test
   suites (navigator.webdriver) unless one sets window.__intro to watch it.
   ============================================================ */
import { MARK_G, LETTERS_G } from './ui.js';

const KEY = 'laminar:intro';
export const INTROS = [['full', 'Full'], ['short', 'Short'], ['off', 'Off']];
export function introMode() {
  try { const v = localStorage.getItem(KEY); return INTROS.some(([k]) => k === v) ? v : 'full'; } catch { return 'full'; }
}
export function setIntroMode(v) { try { localStorage.setItem(KEY, v); } catch { /* a private window: Full each time */ } }

/* the wordmark in its own units, and where the ripple starts in them: the middle of the logo */
const VB = { w: 925.7, h: 155 };
const DROP = { x: 61, y: 78, at: 0.15, strength: 1.05 };
/* the timeline, in seconds at Full: the water is all but still by 2.8, then the snap */
const T = { snap: 3.0, snapLen: 0.2, still: 60 };

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const out4 = u => 1 - Math.pow(1 - u, 4);

const VS = 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }';
/* q is the pixel in "units": the wordmark is 0.8 of one wide whatever the window, so the rings are the same size against the letters */
const FS = `
precision highp float;
varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uRes; uniform float uUnit; uniform float uT; uniform vec4 uDrop;
const float SPEED = 0.62, K = 56.0, AMP = 0.0078;
/* the height of the water r from the drop, age seconds after it: rings behind a front that moves out, dying as they go */
float hgt(float r, float age, float s){
  float x = SPEED * age - r;
  float behind = smoothstep(0.0, 0.035, x);
  float trail = exp(-max(x, 0.0) * 1.15);
  float calm = exp(-age * age * 0.42);
  float far = 1.0 / (1.0 + r * 1.3);
  return s * AMP * behind * trail * calm * far * sin(x * K);
}
void main(){
  vec2 q = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y) / uUnit;
  float age = uT - uDrop.z;
  vec2 push = vec2(0.0); float shine = 0.0; float shown = 0.0;
  if (age > 0.0) {
    vec2 v = q - uDrop.xy; float r = length(v); vec2 dir = r > 0.0001 ? v / r : vec2(0.0);
    float e = 0.0015;
    float slope = (hgt(r + e, age, uDrop.w) - hgt(r - e, age, uDrop.w)) / (2.0 * e);
    push = dir * slope; shine = slope * dot(dir, normalize(vec2(-0.55, -0.83)));
    shown = smoothstep(0.0, 0.07, SPEED * age - r);
  }
  /* the writing seen through the water: bent by the slope, a touch more for blue than red, lit on the near side of each ring */
  vec2 o = vec2(push.x, -push.y) * 0.034 * uUnit / uRes;
  float ar = texture2D(uTex, vUv + o * 0.86).a;
  float ag = texture2D(uTex, vUv + o).a;
  float ab = texture2D(uTex, vUv + o * 1.16).a;
  float light = clamp(1.0 + shine * 2.3, 0.22, 1.7);
  gl_FragColor = vec4(vec3(ar, ag, ab) * light * shown, 1.0);
}`;

/** Start it (straight away at boot); call ready() once the app underneath has drawn. */
export function startIntro() {
  const mode = introMode();
  const auto = typeof navigator !== 'undefined' && navigator.webdriver && !window.__intro;
  const still = document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (mode === 'off' || auto || still) return { ready() {}, playing: false };
  const speed = mode === 'short' ? 1.75 : 1;

  const ov = document.createElement('div');
  ov.className = 'intro'; ov.setAttribute('role', 'img'); ov.setAttribute('aria-label', 'Laminar');
  const canvas = document.createElement('canvas');
  ov.append(canvas);
  document.body.append(ov);
  const app = document.getElementById('app');

  /* ---------- the wordmark, as a picture ---------- */
  const marks = [...MARK_G.matchAll(/ d="([^"]+)"/g)].map(m => m[1]);
  const letters = [...LETTERS_G.matchAll(/translate\((\d+),0\)" d="([^"]+)"/g)].map(m => [+m[1], m[2]]);
  let geo = { s: 1, ox: 0, oy: 0, unit: 1 };
  function drawLockup(w, h, dpr) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const wide = Math.min(Math.max(260, innerWidth * 0.42), 620, innerWidth - 48) * dpr;
    const s = wide / VB.w, ox = (w - VB.w * s) / 2, oy = (h - VB.h * s) / 2;
    geo = { s, ox, oy, unit: wide / 0.8 };
    x.fillStyle = '#fff'; x.strokeStyle = '#fff';
    x.translate(ox, oy); x.scale(s, s);
    x.save(); x.scale(0.30754, 0.30754); x.translate(-212, -101); x.lineWidth = 14; x.lineJoin = 'round';
    for (const d of marks) { const p = new Path2D(d); x.fill(p); x.stroke(p); }
    x.restore();
    x.save(); x.translate(186.2, 127.5); x.scale(0.142857, -0.142857);
    for (const [tx, d] of letters) { x.save(); x.translate(tx, 0); x.fill(new Path2D(d)); x.restore(); }
    x.restore();
    return c;
  }

  /* ---------- the water ---------- */
  let gl = null, u = null, flat2d = null;
  try { gl = canvas.getContext('webgl', { antialias: false, alpha: false }); } catch { gl = null; }
  if (gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const a = sh(gl.VERTEX_SHADER, VS), b = sh(gl.FRAGMENT_SHADER, FS), prog = gl.createProgram();
    if (a && b) { gl.attachShader(prog, a); gl.attachShader(prog, b); gl.linkProgram(prog); }
    if (a && b && gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      u = Object.fromEntries(['uT', 'uRes', 'uUnit', 'uDrop'].map(n => [n, gl.getUniformLocation(prog, n)]));
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    } else gl = null;
  }
  if (!gl) {
    /* no WebGL here: the name, fading in */
    const plain = document.createElement('canvas');
    canvas.replaceWith(plain);
    flat2d = plain;
    plain.classList.add('intro-plain');
  }
  ov.dataset.draws = gl ? 'water' : 'plain';

  function layout() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(innerWidth * dpr)), h = Math.max(2, Math.round(innerHeight * dpr));
    const flat = drawLockup(w, h, dpr);
    if (!gl) { flat2d.width = w; flat2d.height = h; flat2d.getContext('2d').drawImage(flat, 0, 0); return; }
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, flat);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform2f(u.uRes, w, h);
    gl.uniform1f(u.uUnit, geo.unit);
    gl.uniform4f(u.uDrop, (geo.ox + DROP.x * geo.s) / geo.unit, (geo.oy + DROP.y * geo.s) / geo.unit, DROP.at, DROP.strength);
  }
  function paint(t) {
    if (!gl) { flat2d.style.opacity = clamp((t - DROP.at) / 0.7); return; }
    gl.uniform1f(u.uT, t);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- running it ---------- */
  const face = gl ? canvas : flat2d;
  let t0 = 0, raf = 0, isReady = false, skip = false, snapAt = null, last = 0;
  function frame(now) {
    if (!t0) t0 = now;
    const t = (now - t0) / 1000 * speed;
    last = t;
    if (snapAt == null && isReady && (t >= T.snap || skip)) snapAt = t;
    /* skipped: the name whole and still, whatever the water was doing */
    paint(skip && snapAt != null ? T.still : t);
    if (snapAt != null) {
      /* the snap: the intro pushes in and goes; the app settles from a touch smaller */
      const s = out4(clamp((t - snapAt) / (T.snapLen * speed)));
      const land = out4(clamp((t - snapAt) / (T.snapLen * speed * 1.6)));
      ov.style.opacity = 1 - s;
      face.style.transform = `scale(${1 + s * 0.12})`;
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
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  /* a click or any key: straight to the snap (once the app is there to snap to) */
  function onSkip() { skip = true; }
  function onKey(e) { e.preventDefault(); e.stopPropagation(); onSkip(); }
  ov.addEventListener('pointerdown', onSkip);
  addEventListener('keydown', onKey, true);
  addEventListener('resize', layout);
  layout();
  paint(0);
  raf = requestAnimationFrame(frame);
  return {
    playing: true,
    ready() { isReady = true; },
    get t() { return last; }, get snapped() { return snapAt != null; },
  };
}
