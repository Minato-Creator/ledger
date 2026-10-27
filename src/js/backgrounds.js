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

   The three pictures that used to be here (Lounge, Ridge, Canopy) are gone;
   a journal that had one opens with no background.

   To add one of ours: put the clip and its first frame in src/media/backgrounds/
   (1080p, 30 fps, no sound, made to loop without a seam — see HANDOVER) and
   add an entry below with an `id`, a `name`, the `src`, the `poster` and a
   `scrim`.
   ============================================================ */

export const BACKGROUNDS = [
  { id: 'torii',    name: 'Torii',        src: 'media/backgrounds/torii.mp4',   poster: 'media/backgrounds/torii.jpg',   scrim: 0.6 },
  { id: 'path',     name: 'Samurai Path', src: 'media/backgrounds/path.mp4',    poster: 'media/backgrounds/path.jpg',    scrim: 0.58 },
  { id: 'moon',     name: 'Moon',         src: 'media/backgrounds/moon.mp4',    poster: 'media/backgrounds/moon.jpg',    scrim: 0.42 },
  { id: 'rain',     name: 'Rain',         src: 'media/backgrounds/rain.mp4',    poster: 'media/backgrounds/rain.jpg',    scrim: 0.4 },
  { id: 'susanoo',  name: 'Susanoo',      src: 'media/backgrounds/susanoo.mp4', poster: 'media/backgrounds/susanoo.jpg', scrim: 0.5 },
  /* his, added 26 Oct: a pale studio, so it is held down more than the dark ones */
  { id: 'gt3',      name: 'GT3 RS',       src: 'media/backgrounds/gt3.mp4',     poster: 'media/backgrounds/gt3.jpg',     scrim: 0.55 },
  /* his too (a Pexels clip by Rostislav Uzunov): 4K cut to 1080p, its last second faded into its first so it loops without a seam */
  { id: 'water',    name: 'Water',        src: 'media/backgrounds/water.mp4',   poster: 'media/backgrounds/water.jpg',   scrim: 0.45 },
];

/** One of ours, by id, or null (a picture from before is null too). */
export const findBackground = id => BACKGROUNDS.find(b => b.id === id) || null;

/** How hard a background has to be held down before small writing sits on it. */
export const scrimFor = bg =>
  (bg && typeof bg.scrim === 'number') ? bg.scrim : 0.45;
