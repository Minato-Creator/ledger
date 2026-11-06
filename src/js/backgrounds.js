/* ============================================================
   backgrounds.js — the videos that can play behind everything.

   A background is a short clip on a loop, muted, behind the whole journal
   (the layer itself is drawn by store.js → applySurface). There are two
   kinds:

     Ours   listed here. The file sits in src/media/backgrounds/ — the
            desktop app serves it from there, build-single.mjs writes it
            into the single-file build as data. Each carries a small poster
            (the still shown on its tile and while it loads) and a scrim:
            how hard it is held down behind the writing.

     Yours  added in Appearance → Custom, kept in the vault as
            screenshots/bgvideo-*.mp4 (store.addBgVideo), so it goes
            wherever the journal goes. Its value is 'yours:<id>'.

   The three pictures that used to be here (Lounge, Ridge, Canopy) are gone,
   and so are Torii, Moon and Water (Minato, 3 Nov); a journal that had one
   opens with no background.

   To add one of ours: put the clip and its first frame in src/media/backgrounds/
   (1080p, 30 fps, no sound, made to loop without a seam — see HANDOVER) and
   add an entry below with an `id`, a `name`, the `src`, the `poster` and a
   `scrim`.
   ============================================================ */

export const BACKGROUNDS = [
  { id: 'path',     name: 'Samurai Path', src: 'media/backgrounds/path.mp4',    poster: 'media/backgrounds/path.jpg',    scrim: 0.58 },
  { id: 'rain',     name: 'Rain',         src: 'media/backgrounds/rain.mp4',    poster: 'media/backgrounds/rain.jpg',    scrim: 0.4 },
  { id: 'susanoo',  name: 'Susanoo',      src: 'media/backgrounds/susanoo.mp4', poster: 'media/backgrounds/susanoo.jpg', scrim: 0.5 },
  /* his, added 26 Oct: a pale studio, so it is held down more than the dark ones */
  { id: 'gt3',      name: 'GT3 RS',       src: 'media/backgrounds/gt3.mp4',     poster: 'media/backgrounds/gt3.jpg',     scrim: 0.55 },
];

/** One of ours, by id, or null (a picture from before is null too). */
export const findBackground = id => BACKGROUNDS.find(b => b.id === id) || null;

/** How hard a background has to be held down before small writing sits on it. */
export const scrimFor = bg =>
  (bg && typeof bg.scrim === 'number') ? bg.scrim : 0.45;

/* ---------- Fade: two colours of your own, no clip ----------
   Like Discord's colour themes: the first colour from the top left, running
   into the second across the window. Its value is 'fade'; the colours live
   in accounts.json (accounts.fade). Crimson — red into black — is the one
   it starts on. */
export const FADE = Object.freeze({ a: '#6A0B10', b: '#060607' });
export const FADES = [
  ['Crimson', '#6A0B10', '#060607'], ['Ember', '#7A3410', '#09080A'], ['Ocean', '#0B3A66', '#04070D'],
  ['Forest', '#0F4030', '#050807'], ['Violet', '#3E1670', '#07050D'], ['Dusk', '#5E2A55', '#0B0A14'],
  ['Steel', '#3A4452', '#0A0B0D'], ['Sand', '#C9B79A', '#F2EEE7'],
];
const isHex6 = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
export const normaliseFade = f => ({ a: isHex6(f?.a) ? f.a.toUpperCase() : FADE.a, b: isHex6(f?.b) ? f.b.toUpperCase() : FADE.b });
const rgb = h => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16));
const between = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
/** The fade as a CSS background. */
export function fadeCss(fade) {
  const { a, b } = normaliseFade(fade);
  return `radial-gradient(120% 95% at 0% 0%, ${a}cc 0%, transparent 62%), linear-gradient(118deg, ${a} 0%, ${between(a, b, 0.55)} 34%, ${b} 74%)`;
}
/** How bright it reads: the top band (the top bar and headings) and the whole, 0 black … 1 white. */
export function fadeLuma(fade) {
  const { a, b } = normaliseFade(fade);
  const y = h => { const [r, g, bl] = rgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255; };
  return { top: y(between(a, b, 0.35)), all: y(between(a, b, 0.6)) };
}
