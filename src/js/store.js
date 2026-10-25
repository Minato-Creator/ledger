/* ============================================================
   store.js — the journal as plain files in a folder.

   Where those files physically live, and how they are read, is fs.js's
   problem: native through Rust, or the browser's File System Access API.
   This file only knows about accounts, trades, playbook and replay.
   ============================================================ */

import { sessionFor, UNITS, todayISO, readableOn, lift, sink, inkOn, accountMoney } from './calc.js';
import { findBackground, scrimFor } from './backgrounds.js';
import { tidyName } from './clip.js';
import { BUILTIN_CLIPS, isBuiltinClip } from './share/clips.js';
import { shotName, urlFor, forgetUrl } from './shots.js';
import { fs, isTauri } from './fs.js';
import { zip, unzip, bytesOfText, textOfBytes } from './vault.js';
import { blankSheet } from './lab.js';
import { blankRules } from './ghost.js';
import { KEEP_ITEMS } from './wire.js';
import { healReplay } from './replaysessions.js';
import { applyLook, normaliseLook, scheduledLook, themeOf } from './look.js';
export { todayISO, isTauri };

/* ============================================================
   The vault

   A vault is a folder, laid out so that a person opening it in a file manager
   can see what is what:

     vault.json          what this folder is
     data/               the journal — four files of plain JSON
     screenshots/        the charts, as ordinary .jpg files

   Earlier versions kept the four files loose at the top with the replay
   tucked in its own folder. Those are moved on first open rather than left
   for the user to tidy.
   ============================================================ */
export const FILES = {
  accounts: 'data/accounts.json',
  trades:   'data/trades.json',
  playbook: 'data/playbook.json',
  replay:   'data/replay.json',
  outlooks: 'data/outlooks.json',
  news:     'data/news.json',
  wire:     'data/wire.json',
  lab:      'data/lab.json',
  review:   'data/review.json',
  drawings: 'data/drawings.json',
};
const LEGACY = {
  accounts: 'accounts.json',
  trades:   'trades.json',
  playbook: 'playbook.json',
  replay:   'replay/weeks.json',
};
export const MANIFEST = 'vault.json';
export const SHOTS = 'screenshots';

export function isSupported() { return fs.isSupported(); }

export const DEFAULT_COLOURS = { profit: '#18AC65', loss: '#F4624A' };

/* How the share sheet opens the first time (views/share.js). */
export const SHARE_DEFAULTS = Object.freeze({
  bg: 'original:night', tf: 'auto', unit: '', style: 'candles', clipStyle: 'line', candles: 'colour', stats: 'plain',
  figure: 'white', corners: 'rounded', size: 'landscape', quality: 'std', length: 6, scope: 'trade',
});

/* Anything that needs the colour at partial opacity — a gradient under the
   equity curve, a shaded calendar day, a chip behind a direction — needs the
   channels, not the hex. Published alongside so `rgba(var(--profit-rgb), .3)`
   follows the same setting. */
function rgbTriplet(hex) {
  const m = String(hex).replace('#', '');
  const n = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16)).join(', ');
}

/* One place decides what the app looks like. The chosen profit and loss
   colours are written onto the root as the same variables the views already
   use, so nothing below has to know they are configurable. */
/* The video behind everything, and whether the panels let it through.

   Both are written onto the root element so every screen inherits them without
   a single view knowing they exist. The clip plays in one <video> on <body>,
   outside #app (which is rebuilt on every click, and would restart it), muted
   and on a loop, under a scrim that holds it down behind the writing — the
   Dim in Appearance → Custom.

   Glass comes in two: Frosted blurs what is behind the panels heavily and
   tints them dark (or white on the paper looks); Clear barely blurs and
   barely tints, so the video shows through. `glass` is false, true
   (frosted) or 'clear'. */
let layer = null;
function videoLayer() {
  if (layer && layer.isConnected) return layer;
  const wrap = document.createElement('div');
  wrap.className = 'bg-layer';
  wrap.setAttribute('aria-hidden', 'true');
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.preload = 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.disablePictureInPicture = true;
  const scrim = document.createElement('div');
  scrim.className = 'bg-scrim';
  /* a soft shade down from the top, under the top bar and each page's
     heading, dark under light writing and light under dark (data-shade) */
  const shade = document.createElement('div');
  shade.className = 'bg-shade';
  wrap.append(v, scrim, shade);
  document.body.prepend(wrap);
  layer = wrap;
  if (!videoLayer.listening) {
    videoLayer.listening = true;
    document.addEventListener('visibilitychange', syncBgPlay);
  }
  return wrap;
}
/* Still while the window is hidden, and for Motion: Off or a system that
   asks for less motion — the first frame stays, as a picture. */
export function syncBgPlay() {
  const v = layer?.querySelector('video');
  if (!v || !v.getAttribute('src')) return;
  const still = document.hidden || document.documentElement.dataset.motion === 'off'
    || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (still) v.pause(); else v.play().catch(() => {});
}
/* ---------- the writing on the picture ----------
   The top bar and each page's heading sit on the video, not on a panel. Its
   colour is a setting (Appearance → Custom → Text): 'auto' reads how bright
   the top of the picture is (its still, after Dim) and writes white on a
   dark one and black on a light one; 'grey' does the same, softer; 'white'
   and 'black' are what they say; 'theme' leaves the theme's own. The result
   is data-pic-ink on <html> (look.css has the colours), and data-shade, the
   soft shade behind it. */
export const PIC_INKS = ['auto', 'white', 'black', 'grey', 'theme'];
const lumas = new Map();   // still url -> Promise<{ top, all }|null>, 0 black … 1 white
function topLuma(src) {
  if (!src) return Promise.resolve(null);
  if (!lumas.has(src)) lumas.set(src, new Promise(res => {
    const im = new Image();
    im.onload = () => {
      try {
        const W = 48, H = 27, c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(im, 0, 0, W, H);
        /* the top third (where the top bar and the heading are), and the whole (where the panels are) */
        const d = g.getImageData(0, 0, W, H).data, cut = Math.round(H * 0.36) * W;
        let top = 0, all = 0;
        for (let i = 0, n = 0; i < d.length; i += 4, n++) {
          const y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          all += y; if (n < cut) top += y;
        }
        res({ top: top / cut, all: all / (d.length / 4) });
      } catch { res(null); }
    };
    im.onerror = () => res(null);
    im.src = src;
  }));
  return lumas.get(src);
}
/* the picture as it is seen: Dim lays black over it (a pale wash on a paper look) */
const seenOf = (luma, paper, scrim) => (paper ? luma * (1 - 0.7 * scrim) + 0.93 * 0.7 * scrim : luma * (1 - scrim));
/** Which writing a picture wants: 'white' | 'black' | 'grey-l' | 'grey-d', or null for the theme's.
    `luma` is how bright the part of the picture in question is (0 black … 1 white), null if unknown. */
export function picInkFor(mode, luma, paper, scrim) {
  if (mode === 'theme') return null;
  if (mode === 'white' || mode === 'black') return mode;
  /* nothing to read yet: the theme's side */
  const light = luma == null ? paper : seenOf(luma, paper, scrim) > 0.5;
  if (mode === 'grey') return light ? 'grey-d' : 'grey-l';
  return light ? 'black' : 'white';
}
/* The heading's writing is read off the top of the picture; whether Clear's
   see-through panels are drawn the other way round from the theme (data-pic-
   flip, look.js → clearFlip) off the whole of it — or, when you chose the
   writing yourself, off your choice. */
function paintPicInk(bg, mode, scrim) {
  const root = document.documentElement;
  const want = PIC_INKS.includes(mode) ? mode : 'auto';
  const lightInk = k => k === 'white' || k === 'grey-l';
  const set = L => {
    if (root.dataset.bg !== bg.id) return;               // another background since
    const paper = root.dataset.paper === 'on';
    const ink = picInkFor(want, L ? L.top : null, paper, scrim);
    if (ink) root.dataset.picInk = ink; else root.removeAttribute('data-pic-ink');
    root.dataset.shade = ink ? (lightInk(ink) ? 'dark' : 'light') : (paper ? 'light' : 'dark');
    /* Read off the picture, the panels only turn when it is well over on the
       other side — a busy picture in between is better on the theme's own;
       chosen by you, they follow your choice. */
    let flip;
    if (want === 'auto' || want === 'grey') {
      const seen = L ? seenOf(L.all, paper, scrim) : null;
      flip = seen != null && (paper ? seen < 0.38 : seen > 0.62);
    } else flip = !!ink && (paper ? lightInk(ink) : !lightInk(ink));
    if (flip) root.dataset.picFlip = ''; else root.removeAttribute('data-pic-flip');
  };
  if (want !== 'auto' && want !== 'grey') return set(null);
  const src = bg.poster || null;
  if (lumas.has(src)) lumas.get(src).then(set); else { set(null); topLuma(src).then(set); }
}

/** How clear Clear glass is by default: 0 is nearly frosted, 1 is bare. */
export const CLARITY = 0.65;
export function applySurface(background, glass, theme, dim = null, clarity = CLARITY, picInk = 'auto') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const bg = findBackground(background) || yourBackground(background);
  root.dataset.glass = glass ? 'on' : 'off';
  root.dataset.glassKind = glass === 'clear' ? 'clear' : glass ? 'frosted' : 'off';
  /* the tint and blur of Clear are worked out from this in CSS (look.js) */
  root.style.setProperty('--clear-k', String(clampClarity(clarity)));
  if (!bg) {
    root.removeAttribute('data-bg');
    root.removeAttribute('data-pic-ink'); root.removeAttribute('data-shade'); root.removeAttribute('data-pic-flip');
    root.style.removeProperty('--bg-scrim');
    if (layer) {
      const v = layer.querySelector('video');
      v.pause(); v.removeAttribute('src'); v.removeAttribute('poster'); v.load();
      layer.hidden = true;
    }
    return;
  }
  root.dataset.bg = bg.id;
  const scrim = dim == null ? scrimFor(bg) : Math.max(0, Math.min(0.9, Number(dim)));
  root.style.setProperty('--bg-scrim', String(scrim));
  paintPicInk(bg, picInk, scrim);
  const L = videoLayer();
  L.hidden = false;
  const v = L.querySelector('video');
  if (v.dataset.want !== bg.src) {
    v.dataset.want = bg.src;
    if (bg.poster) v.setAttribute('poster', bg.poster); else v.removeAttribute('poster');
    playable(bg.src).then(url => {
      if (v.dataset.want !== bg.src) return;            // another was chosen meanwhile
      if (v.getAttribute('src') !== url) v.setAttribute('src', url);
      syncBgPlay();
    });
  }
  syncBgPlay();
}

/** The time now, HH:MM:SS — so two things done on one day keep their order. */
const nowHMS = () => { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, '0')).join(':'); };
export const clampClarity = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? CLARITY : Math.max(0, Math.min(1, Number(v))));

/* In the desktop app a clip of ours is read whole into memory and played
   from there: the app's own file server does not answer the partial
   requests a <video> makes to loop and seek. A browser plays it as it is. */
const fetched = new Map();
export function playable(src) {
  if (!src || /^(blob:|data:)/.test(src) || !isTauri()) return Promise.resolve(src);
  if (!fetched.has(src)) {
    fetched.set(src, fetch(src).then(r => (r.ok ? r.blob() : null))
      .then(b => (b ? URL.createObjectURL(b) : src)).catch(() => src));
  }
  return fetched.get(src);
}

/* A video of your own: kept in the vault (screenshots/bgvideo-*), read back
   once into a url. */
const yourUrls = new Map();
/* your picture and banner, read from the vault once: file -> object url */
const profileUrls = new Map();
/* the share sheet's own clips, read once: src -> Promise<Blob|null> */
const builtinBlobs = new Map();
export function rememberYourBackground(id, url, poster) { yourUrls.set(id, { url, poster }); }
function yourBackground(value) {
  const id = String(value || '').startsWith('yours:') ? String(value).slice(6) : null;
  const got = id && yourUrls.get(id);
  return got ? { id: 'yours', src: got.url, poster: got.poster, scrim: 0.4 } : null;
}

/* `pale` says what the pale cards are in this look: pale on Graphite, dark on
   everything else — which decides how a profit is written on one. */
export function applyTheme(theme, colours, pale = theme !== 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const dark = !pale;
  root.dataset.theme = theme === 'dark' ? 'dark' : 'light';

  const { profit, loss, flat } = { ...DEFAULT_COLOURS, ...(colours || {}) };
  if (flat) root.style.setProperty('--flat', flat); else root.style.removeProperty('--flat');
  root.style.setProperty('--green', profit);
  root.style.setProperty('--orange', loss);
  root.style.setProperty('--profit', profit);
  root.style.setProperty('--loss', loss);
  root.style.setProperty('--profit-rgb', rgbTriplet(profit));
  root.style.setProperty('--loss-rgb', rgbTriplet(loss));
  // The pale cards are pale in light mode and dark in dark mode, so the
  // readable variant flips with the theme.
  root.style.setProperty('--pos-light', readableOn(profit, dark ? 'dark' : 'light'));
  root.style.setProperty('--neg-light', readableOn(loss, dark ? 'dark' : 'light'));
  /* For writing laid over a tint of its own colour. The calendar's cells are
     dark in both themes, so this one does not flip. */
  root.style.setProperty('--profit-ink', lift(profit));
  root.style.setProperty('--loss-ink', lift(loss));
  /* And for a cell at full strength, where the tint is nearly the colour
     itself and the writing has to go the other way. */
  root.style.setProperty('--profit-deep', sink(profit));
  root.style.setProperty('--loss-deep', sink(loss));
}

/* ---------- the store ---------- */
class Store {
  constructor() {
    this.data = null;          // { accounts, trades, playbook, replay }
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(fn => fn(this.data)); }

  /* Try to reconnect to the folder chosen last time, without prompting.
     Returns 'connected' | 'needs-permission' | 'none'. */
  async tryRestore() {
    const state = await fs.tryRestore();
    if (state === 'connected') await this.load();
    return state;
  }

  /* Re-ask for permission on the remembered folder (needs a user gesture). */
  async regrant() {
    if (!(await fs.regrant())) return false;
    await this.load();
    return true;
  }

  /* Pick a folder (needs a user gesture). */
  /**
   * Move the journal somewhere else.
   *
   * Everything it holds is named here and carried across, because "choose a
   * folder" has to mean moving house rather than starting over — a button
   * that silently left a year of trades behind would be the worst thing in
   * the app. Pointing at a folder that already HOLDS a journal opens that one
   * instead; the filesystem layer decides which case it is by looking.
   */
  async connect() {
    const carry = this.data
      ? [...Object.values(FILES),
         ...this.trades.flatMap(t => [...tradeShotsOf(t), ...reviewShotsOf(t)])]
      : [];
    /* A folder that already holds a vault — this shape or the older one — is
       opened rather than written over. */
    if (!(await fs.connect({ carry, probes: [FILES.trades, LEGACY.trades] }))) return false;
    await this.load();
    return true;
  }

  async forget() { await fs.forget(); this.data = null; }

  /* The first run, when there is no vault yet: either take the suggestion or
     go and find a folder. */
  async suggestedVault() { return fs.suggest(); }
  async createVault(path) {
    if (!(await fs.adopt(path))) return false;
    await this.load();
    return true;
  }
  async revealVault() { return fs.reveal(); }

  get folderName() { return fs.folderName; }
  get folderPath() { return fs.folderPath; }
  get isNative()   { return fs.kind === 'native'; }
  get canChooseFolder() { return fs.canChooseFolder; }
  get isLocal()    { return fs.kind === 'local'; }
  get isPreview()  { return fs.kind === 'memory'; }

  /* ---------- files ----------
     A name may carry folder segments, e.g. 'replay/weeks.json'. A file that
     is not there yet, or that somebody has emptied or mangled by hand, comes
     back as the fallback rather than throwing — the folder is the user's to
     poke at, and a bad file should not brick the app. */
  async readJSON(name, fallback) {
    let text;
    try { text = await fs.readText(name); }
    catch { return structuredClone(fallback); }
    if (!text || !text.trim()) return structuredClone(fallback);
    try { return JSON.parse(text); }
    catch { return structuredClone(fallback); }
  }

  async writeJSON(name, value) { return fs.writeText(name, JSON.stringify(value, null, 2)); }
  async writeText(name, text)  { return fs.writeText(name, text); }
  async ensureDir(name)        { return fs.ensureDir(name); }
  async exists(name)           { return fs.exists(name); }

  /* ---------- load / save ---------- */
  async load() {
    await this.tidyVault();
    await this.ensureDir('data');
    const [accounts, trades, playbook, replay, outlooks, news, wire, lab, review, drawings] = await Promise.all([
      this.readJSON(FILES.accounts, defaultAccounts()),
      this.readJSON(FILES.trades,   { version: 1, trades: [] }),
      this.readJSON(FILES.playbook, defaultPlaybook()),
      this.readJSON(FILES.replay,   { version: 1, weeks: {} }),
      this.readJSON(FILES.outlooks, { version: 1, days: {} }),
      this.readJSON(FILES.news,     { version: 1, fetchedAt: null, events: [] }),
      this.readJSON(FILES.wire,     { version: 1, fetchedAt: null, seenAt: null, items: [] }),
      this.readJSON(FILES.lab,      defaultLab()),
      this.readJSON(FILES.review,   { version: 1, weeks: {} }),
      this.readJSON(FILES.drawings, { version: 1, lines: {} }),
    ]);
    this.data = { accounts, trades, playbook, replay, outlooks, news, wire, lab, review, drawings };
    this.heal();
    this.migrate();
    this.applyLookNow();
    this.loadBgVideo();

    // A brand new folder gets its scaffolding written out immediately, so the
    // user can see real files appear rather than wondering if it worked.
    await Promise.all([
      this.writeJSON(FILES.accounts, accounts),
      this.writeJSON(FILES.trades, trades),
      this.writeJSON(FILES.playbook, playbook),
      this.writeJSON(FILES.replay, replay),
      this.writeJSON(FILES.outlooks, outlooks),
      this.writeJSON(FILES.news, news),
      this.writeJSON(FILES.wire, wire),
      this.writeJSON(FILES.lab, this.data.lab),
      this.writeJSON(FILES.review, this.data.review),
      this.writeJSON(FILES.drawings, this.data.drawings),
      this.ensureDir(SHOTS),
      this.writeText(MANIFEST, JSON.stringify({
        kind: 'quire-vault', version: 1, app: 'Laminar',
        note: 'Your journal. data/ holds the trades, screenshots/ holds the charts.',
      }, null, 2)),
    ]);
    if (this.pendingMigration) { this.pendingMigration = false; }
    this.emit();
  }

  /**
   * Bring an older vault's shape up to date.
   *
   * The four files used to sit loose at the top of the folder. They are moved
   * into data/ and the originals removed, so nobody ends up with two copies
   * and no way to tell which one the app is reading. A file that will not
   * move is left exactly where it is: a tidier folder is not worth a lost
   * trade.
   */
  async tidyVault() {
    try {
      if (await this.exists(FILES.trades)) return;      // already in its new shape
      if (!(await this.exists(LEGACY.trades))) return;  // nothing to move
      await this.ensureDir('data');
      for (const key of Object.keys(FILES)) {
        try {
          const text = await fs.readText(LEGACY[key]);
          await fs.writeText(FILES[key], text);
          await fs.remove(LEGACY[key]);
        } catch { /* not there, or not movable — leave it alone */ }
      }
    } catch { /* a vault that cannot be tidied still opens */ }
  }

  /* ============================================================
     Exporting and importing a whole vault

     One ZIP with the folder inside it, screenshots and all, so a backup is a
     single file you can copy to a drive and a restore is that file coming
     back. It is a real ZIP: you can open it and look, which is the only way a
     backup is worth anything.
     ============================================================ */
  /* Every picture the journal owns, wherever it is referenced from. The vault
     walks this list, so a chart that is not named here is a chart a restore
     silently loses — which is why the outlooks are read here and not only the
     trades. */
  shotNames() {
    const fromTrades = this.trades.flatMap(t => [...tradeShotsOf(t), ...reviewShotsOf(t)]);
    const fromOutlooks = Object.values(this.data.outlooks?.days || {})
      .flatMap(day => (day.instruments || []).flatMap(i => outlookShotsOf(i)));
    const fromLook = this.data.accounts?.ownBackground ? [this.data.accounts.ownBackground] : [];
    const fromShare = (this.data.accounts?.share?.clips || []).map(c => c.file);
    const fromBg = (this.data.accounts?.bgVideos || []).map(v => v.file);
    const fromProfile = [this.data.accounts?.avatar?.file, this.data.accounts?.banner?.file, ...Object.values(this.data.accounts?.firmLogos || {})];
    return [...fromTrades, ...fromOutlooks, ...fromLook, ...fromShare, ...fromBg, ...fromProfile].filter(Boolean);
  }

  async exportVault() {
    const entries = [{
      name: MANIFEST,
      bytes: bytesOfText(JSON.stringify({
        kind: 'quire-vault', version: 1, app: 'Laminar',
        exported: new Date().toISOString(),
        accounts: this.allAccounts.length,
        trades: this.trades.length,
      }, null, 2)),
    }];

    for (const [key, name] of Object.entries(FILES)) {
      entries.push({ name, bytes: bytesOfText(JSON.stringify(this.data[key], null, 2)) });
    }

    let missing = 0;
    for (const name of new Set(this.shotNames())) {
      const blob = await fs.readImage(name).catch(() => null);
      if (!blob) { missing++; continue; }
      entries.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
    }

    const file = await zip(entries);
    return { file, entries: entries.length, missing,
             name: `quire-vault-${todayISO()}.zip` };
  }

  /**
   * Read a vault file and see what is in it, without writing anything.
   * Importing replaces what you have, so it is worth being told first.
   */
  async inspectVault(blob) {
    const files = await unzip(blob);
    /* A vault someone unzipped, looked at and zipped again can come back with
       its files at the top rather than under data/. Both are the same vault. */
    const find = tail => files.find(f => f.name === tail || f.name.endsWith('/' + tail)
      || f.name.replace(/^[^/]+\//, '') === tail);
    /* A vault exported before the app was called Quire says ledger-vault
       inside and is otherwise identical. It is the same journal, so it opens.
       Nothing checks the manifest's name — the two JSON files are what make a
       vault a vault — but it is worth saying out loud that old backups keep
       working, because that is the whole point of having them. */
    const trades = find('data/trades.json') || find('trades.json');
    const accounts = find('data/accounts.json') || find('accounts.json');
    if (!trades || !accounts) throw new Error('That file is not a Laminar vault.');

    const t = JSON.parse(textOfBytes(trades.bytes));
    const a = JSON.parse(textOfBytes(accounts.bytes));
    const shots = files.filter(f => /(^|\/)screenshots\//.test(f.name));
    return { files, trades: (t.trades || []).length, accounts: (a.accounts || []).length, shots: shots.length };
  }

  /** Replace this vault with the one in the file. */
  async importVault(blob) {
    const { files } = await this.inspectVault(blob);
    const tail = name => name.replace(/^.*?((data|screenshots)\/)/, '$1');

    /* Everything the old vault had that the new one does not is cleared out
       first, so a restore leaves the folder as it was on the day it was
       exported rather than mixing two journals together. */
    for (const name of new Set(this.shotNames())) await fs.remove(name).catch(() => {});

    let damaged = 0;
    for (const f of files) {
      const name = tail(f.name);
      if (/^data\/.+\.json$/.test(name)) {
        /* Written only if it is really JSON. A truncated file skipped here
           becomes a default on load; a truncated file written here would be
           read back as nothing at all. */
        const text = textOfBytes(f.bytes);
        try { JSON.parse(text); } catch { damaged++; continue; }
        await fs.writeText(name, text);
      }
      else if (/^screenshots\/./.test(name)) await fs.writeImage(name, new Blob([f.bytes], { type: 'image/jpeg' }));
      else if (name === MANIFEST) await fs.writeText(MANIFEST, textOfBytes(f.bytes));
    }
    await this.load();
    return { trades: this.trades.length, accounts: this.allAccounts.length, damaged };
  }

  /* ============================================================
     Making a vault whole before anything reads it.

     A vault can arrive with a key missing: an older version wrote it, a write
     was cut off half way, or somebody unzipped it, edited the JSON by hand
     and zipped it again — which the format deliberately allows. A missing key
     has to cost that one key and nothing else. Before this, a playbook with
     no tagGroups took every trade page down with it, which is the worst
     possible time to find out: the moment after a restore.
     ============================================================ */
  heal() {
    const d = this.data;
    const def = defaultPlaybook();
    const note = () => { this.pendingMigration = true; };

    if (!d.accounts || typeof d.accounts !== 'object') { d.accounts = defaultAccounts(); note(); }
    if (!Array.isArray(d.accounts.accounts)) { d.accounts.accounts = []; note(); }
    d.accounts.accounts = d.accounts.accounts.filter(a => a && a.id);
    /* a clip left at the old ten-second default trim plays whole now */
    for (const cl of Array.isArray(d.accounts.share?.clips) ? d.accounts.share.clips : []) {
      const dur = Number(cl?.dur) || 0;
      if (cl && dur > 10.05 && !(Number(cl.start) > 0) && Math.abs((Number(cl.len) || 0) - 10) < 0.01) { cl.len = dur; note(); }
    }
    /* names your own videos were given from a wallpaper site's file name, tidied once */
    for (const list of [d.accounts.bgVideos, d.accounts.share?.clips]) {
      for (const v of Array.isArray(list) ? list : []) {
        const tidy = v && tidyName(v.name);
        if (v && tidy && tidy !== v.name) { v.name = tidy; note(); }
      }
    }

    if (!d.trades || typeof d.trades !== 'object') { d.trades = { version: 1, trades: [] }; note(); }
    if (!Array.isArray(d.trades.trades)) { d.trades.trades = []; note(); }
    /* A row with no id cannot be opened, edited or deleted, so it is not a
       trade — it is a hole that swallows clicks. */
    const kept = d.trades.trades.filter(t => t && t.id);
    if (kept.length !== d.trades.trades.length) { d.trades.trades = kept; note(); }

    if (!d.playbook || typeof d.playbook !== 'object') { d.playbook = def; note(); }
    const pb = d.playbook;
    if (!Array.isArray(pb.setups)) { pb.setups = []; note(); }
    if (!Array.isArray(pb.tagGroups)) {
      /* A flat list of tags is the shape from before groups existed. It is
         kept, under one group, rather than thrown away. */
      pb.tagGroups = Array.isArray(pb.tags) && pb.tags.length
        ? [{ id: 'g_tags', name: 'Tags', tags: pb.tags.filter(t => t && t.id) }]
        : def.tagGroups;
      note();
    }
    for (const g of pb.tagGroups) if (!Array.isArray(g.tags)) { g.tags = []; note(); }
    if (!Array.isArray(pb.sessions)) { pb.sessions = DEFAULT_SESSIONS(); note(); }
    if (!pb.rules  || typeof pb.rules  !== 'object') { pb.rules  = def.rules;  note(); }
    if (!pb.replay || typeof pb.replay !== 'object') { pb.replay = def.replay; note(); }

    if (!d.replay || typeof d.replay !== 'object') { d.replay = { version: 1, weeks: {} }; note(); }
    if (!d.replay.weeks || typeof d.replay.weeks !== 'object') { d.replay.weeks = {}; note(); }
    /* Replay's sessions, groups and settings (replaysessions.js) */
    if (healReplay(d.replay)) note();

    if (!d.news || typeof d.news !== 'object') { d.news = { version: 1, fetchedAt: null, events: [] }; note(); }
    if (!Array.isArray(d.news.events)) { d.news.events = []; note(); }
    /* kept before a clock change was told apart from a bank holiday */
    { const ok = d.news.events.filter(e => !(e?.impact === 'Holiday' && !/holiday/i.test(e?.title || '')));
      if (ok.length !== d.news.events.length) { d.news.events = ok; note(); } }
    /* the stretches of time the calendar has been read for — so a day it was
       never read for is "not known", not "nothing on" */
    if (!Array.isArray(d.news.spans)) {
      const ats = d.news.events.map(e => e?.at).filter(x => typeof x === 'string').sort();
      d.news.spans = ats.length ? [{ from: ats[0], to: ats[ats.length - 1] }] : [];
      if (!d.news.span && ats.length) d.news.span = d.news.spans[0];
      note();
    }

    /* Two fixed chart slots became a list. The old fields are read once,
       turned into a list in the order they were shown, and dropped — so a
       trade logged last week opens with its charts still on it. */
    for (const t of d.trades.trades) {
      if (!Array.isArray(t.shots)) { t.shots = [t.shotLtf, t.shotHtf].filter(Boolean); note(); }
      else { const n = t.shots.length; t.shots = t.shots.filter(Boolean); if (t.shots.length !== n) note(); }
      if ('shotLtf' in t || 'shotHtf' in t) { delete t.shotLtf; delete t.shotHtf; note(); }
    }

    if (!d.wire || typeof d.wire !== 'object') { d.wire = { version: 1, fetchedAt: null, seenAt: null, items: [] }; note(); }
    if (!Array.isArray(d.wire.items)) { d.wire.items = []; note(); }
    /* An item with no time cannot be put in order, which on a page whose
       whole promise is newest-first is worse than not being there at all. */
    { const n = d.wire.items.length;
      d.wire.items = d.wire.items.filter(x => x && x.id && x.title && x.at && !isNaN(new Date(x.at)))
        /* Only the newest are kept; a vault saved when the wire held more is trimmed on open. */
        .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, KEEP_ITEMS);
      if (d.wire.items.length !== n) note(); }

    /* The Lab's rule sheets. A sheet saved by an older copy, or edited by
       hand, is filled out to the current shape field by field — anything
       it had is kept, anything it lacks arrives empty rather than guessed. */
    /* The weekly review: notes per week, keyed '2026-W38'. What you said
       about each trade lives on the trade itself, as `review`. */
    if (!d.review || typeof d.review !== 'object') { d.review = { version: 1, weeks: {} }; note(); }
    /* Lines drawn on the trade charts, kept per instrument so a level marked
       on one gold trade is there on the next. */
    if (!d.drawings || typeof d.drawings !== 'object') { d.drawings = { version: 1, lines: {} }; note(); }
    if (!d.drawings.lines || typeof d.drawings.lines !== 'object' || Array.isArray(d.drawings.lines)) { d.drawings.lines = {}; note(); }
    for (const [k, list] of Object.entries(d.drawings.lines)) {
      /* a line from the old Line tool (t1, t2, p), or a drawing: a type and two points */
      const ok = Array.isArray(list) ? list.filter(x => x && x.id && (typeof x.type === 'string'
        ? Array.isArray(x.pts) && x.pts.length === 2 && x.pts.every(pt => pt && Number.isFinite(pt.t) && Number.isFinite(pt.p))
          && (x.type !== 'long' && x.type !== 'short' || [x.tp, x.sl].every(Number.isFinite))
        : [x.t1, x.t2, x.p].every(Number.isFinite))) : [];
      if (!Array.isArray(list) || ok.length !== list.length) { d.drawings.lines[k] = ok; note(); }
    }
    if (!d.review.weeks || typeof d.review.weeks !== 'object' || Array.isArray(d.review.weeks)) { d.review.weeks = {}; note(); }
    for (const t of d.trades.trades) {
      if (t.review != null && (typeof t.review !== 'object' || Array.isArray(t.review))) { delete t.review; note(); }
      /* "Trailed" was an exit reason for a while and was taken out; a trade
         that carries it reads as not answered. */
      if (t.exitReason === 'trailed') { t.exitReason = null; note(); }
      else if (t.review && t.review.after != null && !Array.isArray(t.review.after)) { t.review.after = []; note(); }
    }
    if (!d.lab || typeof d.lab !== 'object') { d.lab = defaultLab(); note(); }
    if (!Array.isArray(d.lab.firms)) { d.lab.firms = []; note(); }
    d.lab.firms = d.lab.firms.filter(f => f && typeof f === 'object' && f.id);
    for (const f of d.lab.firms) {
      const blank = blankSheet(f.name || 'Firm');
      for (const k of Object.keys(blank)) if (!(k in f)) { f[k] = blank[k]; note(); }
      for (const part of ['eval', 'funded']) {
        if (!f[part] || typeof f[part] !== 'object') { f[part] = blank[part]; note(); }
        for (const k of Object.keys(blank[part])) if (!(k in f[part])) { f[part][k] = blank[part][k]; note(); }
      }
    }
    if (!['live', 'forward', 'both'].includes(d.lab.source)) { d.lab.source = 'live'; note(); }
    if (!d.lab.plan || typeof d.lab.plan !== 'object') { d.lab.plan = defaultLab().plan; note(); }
    if (d.lab.firmId && !d.lab.firms.some(f => f.id === d.lab.firmId)) { d.lab.firmId = d.lab.firms[0]?.id || null; note(); }
    /* The ghost's rules: whatever is missing starts off, and a list that is
       not a list becomes an empty one rather than a page that throws. */
    if (!d.lab.ghost || typeof d.lab.ghost !== 'object') { d.lab.ghost = blankRules(); note(); }
    /* The Monte Carlo's three settings: risk a trade (null = the account's
       own), how many trades ahead, and the drawdown you would accept. */
    if (!d.lab.mc || typeof d.lab.mc !== 'object') { d.lab.mc = defaultLab().mc; note(); }
    if (d.lab.mc.risk != null && !(Number(d.lab.mc.risk) > 0)) { d.lab.mc.risk = null; note(); }
    if (![50, 100, 250, 500].includes(d.lab.mc.horizon)) { d.lab.mc.horizon = 100; note(); }
    if (!(Number(d.lab.mc.ddLimit) > 0 && Number(d.lab.mc.ddLimit) <= 90)) { d.lab.mc.ddLimit = 10; note(); }
    /* Quant's saved versions: each a name, the prompt that describes it, its settings */
    if (!d.lab.quant || typeof d.lab.quant !== 'object') { d.lab.quant = defaultLab().quant; note(); }
    if (!Array.isArray(d.lab.quant.versions)) { d.lab.quant.versions = []; note(); }
    d.lab.quant.versions = d.lab.quant.versions.filter(v => v && typeof v === 'object' && v.id && v.settings && typeof v.settings === 'object');
    for (const [k, v] of Object.entries(blankRules())) {
      if (!(k in d.lab.ghost)) { d.lab.ghost[k] = v; note(); }
      else if (Array.isArray(v) && !Array.isArray(d.lab.ghost[k])) { d.lab.ghost[k] = []; note(); }
    }

    if (!d.outlooks || typeof d.outlooks !== 'object') { d.outlooks = { version: 1, days: {} }; note(); }
    if (!d.outlooks.days || typeof d.outlooks.days !== 'object') { d.outlooks.days = {}; note(); }
    /* A day whose instrument list is missing is a day with nothing written,
       not a reason for the page to throw. */
    for (const [date, day] of Object.entries(d.outlooks.days)) {
      if (!day || typeof day !== 'object') { delete d.outlooks.days[date]; note(); continue; }
      if (!Array.isArray(day.instruments)) { day.instruments = []; note(); }
      day.instruments = day.instruments.filter(x => x && x.id);
      /* An instrument used to hold one chart, in `shot`. It holds a list now.
         The old field is read once, turned into a list of one, and dropped —
         so a morning written last week opens with its chart still on it. */
      for (const i of day.instruments) {
        if (!Array.isArray(i.shots)) { i.shots = i.shot ? [i.shot] : []; note(); }
        if ('shot' in i) { delete i.shot; note(); }
        i.shots = i.shots.filter(Boolean);
      }
    }
  }

  /* Folders written by an earlier version get brought up to date in place.
     Sessions are replaced wholesale and every trade's session is worked out
     again from its open time, so nothing ends up pointing at an id that has
     gone. Setups, tags and rules are left exactly as they are. */
  migrate() {
    const pb = this.data.playbook;
    if ((pb.version || 1) < 2) {
      pb.sessions = DEFAULT_SESSIONS();
      pb.version = 2;
      for (const t of this.data.trades.trades) {
        t.sessionId = t.timeOpen ? (sessionFor(pb, t.timeOpen)?.id ?? null) : null;
      }
      this.pendingMigration = true;
    }
    // Accounts v2 — a display unit for the whole app, and a weekly target
    // per account (kept as a percentage so it scales with the account's size).
    const ac = this.data.accounts;
    if ((ac.version || 1) < 2) {
      ac.displayUnit = ac.displayUnit || '$';
      for (const a of ac.accounts) if (a.weeklyTargetPercent == null) a.weeklyTargetPercent = 0;
      ac.version = 2;
      this.pendingMigration = true;
    }
    // v3 — replay comparison settings live beside the sessions they depend on.
    if ((pb.version || 1) < 3) {
      pb.replay = pb.replay || { windowMins: 15, csvClock: 'local' };
      pb.version = 3;
      this.pendingMigration = true;
    }
    /* v4 — a CSV is read as being on your clock or on UTC, rather than by a
       number of hours to add. The old number said what it meant: anything but
       zero meant "this file is UTC, move it". Weeks already imported have the
       old shift baked into their times, so they are flagged rather than left
       to disagree quietly with the file they came from. */
    if (pb.replay && pb.replay.csvClock == null) {
      const shifted = Number(pb.replay.csvOffsetHours) || 0;
      pb.replay.csvClock = shifted ? 'utc' : 'local';
      delete pb.replay.csvOffsetHours;
      if (shifted) for (const w of Object.values(this.data.replay?.weeks || {})) w.staleClock = true;
      this.pendingMigration = true;
    }
  }

  async save(which) {
    const map = { accounts: FILES.accounts, trades: FILES.trades, playbook: FILES.playbook,
                  replay: FILES.replay, outlooks: FILES.outlooks, news: FILES.news,
                  wire: FILES.wire, lab: FILES.lab, review: FILES.review, drawings: FILES.drawings };
    await this.writeJSON(map[which], this.data[which]);
    this.emit();
  }

  /* ============================================================
     The morning's outlook

     One entry per day, holding a block per instrument: a bias, what you wrote
     and one chart. Kept in its own file rather than on the trades, because an
     outlook is written before there are any trades to hang it on — and
     because a day you planned and then did not trade is a real day, worth
     keeping.

     A day with nothing written is not stored at all. An empty key for every
     date you ever opened the page would make the file grow with your
     attention rather than your work.
     ============================================================ */
  outlookFor(date) {
    return this.data.outlooks.days[date] || null;
  }

  /** The day, ready to edit — created in memory, written only once it holds
      something worth keeping. */
  draftOutlook(date) {
    const found = this.outlookFor(date);
    if (found) return structuredClone(found);
    return { date, instruments: [], updatedAt: null };
  }

  /** True when there is anything in this day worth a line in the file. */
  static outlookHasContent(day) {
    return (day.instruments || []).some(i =>
      (i.notes || '').trim() || outlookShotsOf(i).length || (i.bias && i.bias !== 'neutral') || (i.pair || '').trim());
  }

  /* ---------- lines drawn on the charts ---------- */
  drawingsFor(inst) { return this.data.drawings?.lines?.[inst] || []; }
  async putDrawing(inst, line) {
    const all = this.data.drawings.lines;
    const list = all[inst] || (all[inst] = []);
    const at = list.findIndex(x => x.id === line.id);
    if (at >= 0) list[at] = line; else list.push(line);
    await this.save('drawings');
  }
  async dropDrawing(inst, id) {
    const list = this.data.drawings.lines[inst];
    if (!list) return;
    this.data.drawings.lines[inst] = list.filter(x => x.id !== id);
    await this.save('drawings');
  }

  async saveOutlook(day) {
    const date = day.date;
    if (!date) return null;
    if (Store.outlookHasContent(day)) {
      day.updatedAt = new Date().toISOString();
      this.data.outlooks.days[date] = day;
    } else {
      /* Everything was cleared out. Delete the day rather than keep a husk,
         and take its pictures with it so the folder does not fill up with
         charts nothing points at. */
      const old = this.data.outlooks.days[date];
      for (const i of (old?.instruments || [])) for (const n of outlookShotsOf(i)) await this.dropImage(n);
      delete this.data.outlooks.days[date];
    }
    await this.save('outlooks');
    return this.data.outlooks.days[date] || null;
  }

  /** Which days have an outlook, newest first. */
  outlookDates() {
    return Object.keys(this.data.outlooks.days).sort().reverse();
  }

  /** Where one of an instrument's charts lives. Named off the day, the block
      and the chart, so the folder reads as a diary, a second chart never
      writes over the first, and a deleted block orphans nothing. */
  outlookShotName(date, instrumentId, shotId) {
    return `${SHOTS}/outlook-${date}-${instrumentId}${shotId ? '-' + shotId : ''}.jpg`;
  }

  async putOutlookShot(date, instrumentId, blob, shotId) {
    const name = this.outlookShotName(date, instrumentId, shotId);
    await fs.ensureDir(SHOTS);
    await fs.writeImage(name, blob);
    forgetUrl(name);
    return name;
  }

  /** Remove a picture from the folder. Used when a block is deleted or its
      chart replaced; failing to delete is not worth losing the edit over. */
  async dropImage(name) {
    if (!name) return;
    try { await fs.deleteImage(name); } catch { /* the record matters more */ }
    forgetUrl(name);
  }

  /** The trades taken on a day, for reading an outlook back against what you
      actually did. Closed trades only — an open one has no verdict yet. */
  tradesOn(accountId, date) {
    return this.tradesFor(accountId).filter(t => t.date === date);
  }

  /* ============================================================
     The economic calendar

     Held like everything else: a file in the vault, read at startup, written
     when it changes. Nothing here decides when to fetch — the page that shows
     it does, because a background timer in a journal is a thing that runs on
     a plane and fails silently.
     ============================================================ */
  get news() { return this.data.news; }

  /** Minutes since the feed was last read, or null if it never has been. */
  newsAge() {
    const at = this.data.news.fetchedAt;
    if (!at) return null;
    const mins = Math.round((Date.now() - new Date(at)) / 60000);
    return isFinite(mins) ? mins : null;
  }

  /** The feed only ever carries this week. What it says replaces what was
      held for the same stretch of time; earlier weeks are kept, so a trade
      logged later — or the News card in Analytics — can still see the red
      folders and bank holidays of the day it was taken. */
  async saveNews(events) {
    /* a clock change comes in the bank-holiday folder; it is neither */
    events = events.filter(e => !(e?.impact === 'Holiday' && !/holiday/i.test(e?.title || '')));
    const held = this.data.news?.events || [];
    let kept = held, span = this.data.news?.span || null;
    if (events.length) {
      const ats = events.map(e => e.at).sort();
      span = { from: ats[0], to: ats[ats.length - 1] };
      kept = held.filter(e => e.at < span.from || e.at > span.to);
    }
    const all = [...kept, ...events].sort((a, b) => a.at.localeCompare(b.at));
    const spans = [...(this.data.news?.spans || [])];
    if (events.length && !spans.some(x => x.from === span.from && x.to === span.to)) spans.push(span);
    this.data.news = { version: 1, fetchedAt: new Date().toISOString(), span, spans, events: all };
    await this.save('news');
    return this.data.news;
  }

  /** A failed fetch is recorded, so the page can say so without guessing. */
  async newsFailed(reason) {
    this.data.news.lastError = String(reason || 'could not be reached');
    this.data.news.lastTriedAt = new Date().toISOString();
    await this.save('news');
  }

  /* ============================================================
     The newswire

     Headlines are merged into what is already held rather than replacing it,
     because two feeds carry the same item on purpose and because a refresh
     that emptied the page every time one failed would be worse than no
     refresh at all. Ordering and the cap are wire.js's; the store's job is
     only to keep what it is given.
     ============================================================ */
  get wire() { return this.data.wire; }

  /** Minutes since the wire was last read, or null if it never has been. */
  wireAge() {
    const at = this.data.wire.fetchedAt;
    if (!at) return null;
    const mins = Math.round((Date.now() - new Date(at)) / 60000);
    return isFinite(mins) ? mins : null;
  }

  async saveWire(items) {
    const next = { ...this.data.wire, version: 1, fetchedAt: new Date().toISOString(), items };
    delete next.lastError;
    this.data.wire = next;
    await this.save('wire');
    return this.data.wire;
  }

  /** Where you had read up to, so the page can mark what arrived since. */
  async markWireSeen(at) {
    this.data.wire.seenAt = at || new Date().toISOString();
    await this.save('wire');
  }

  async wireFailed(reason) {
    this.data.wire.lastError = String(reason || 'could not be reached');
    this.data.wire.lastTriedAt = new Date().toISOString();
    await this.save('wire');
  }

  /* ---------- accessors ---------- */
  get accounts()      { return this.data.accounts.accounts.filter(a => !a.archived); }
  get allAccounts()   { return this.data.accounts.accounts; }
  get activeAccount() {
    const id = this.data.accounts.activeAccountId;
    return this.accounts.find(a => a.id === id) || this.accounts[0] || null;
  }
  get trades()        { return this.data.trades.trades; }
  get playbook()      { return this.data.playbook; }
  get lab()           { return this.data.lab; }
  get replayWeeks()   { return this.data.replay.weeks; }

  /* ============================================================
     Closed trades, and trades still running

     A trade with no result is not a break-even trade. It has no outcome, no R
     and no place in a win rate, so `tradesFor` — which every screen in the app
     is built on — hands back only the finished ones. Nothing had to be
     changed anywhere else for the statistics to stay honest, which is the
     whole reason the filter lives here rather than in each view.

     Open trades are asked for by name, by the one screen that wants them.
     ============================================================ */
  static isOpen = t => t && t.status === 'open';

  tradesFor(accountId) {
    return this.allTradesFor(accountId).filter(t => t.status !== 'open');
  }

  /** Still running. Oldest first — the one you opened longest ago is the one
      you have most likely forgotten to close. */
  openFor(accountId) {
    return this.trades
      .filter(t => t.accountId === accountId && t.status === 'open' && this.inScope(t))
      .sort((a, b) => (a.date + (a.timeOpen || '')).localeCompare(b.date + (b.timeOpen || '')));
  }

  allTradesFor(accountId) {
    return this.trades
      .filter(t => t.accountId === accountId && this.inScope(t))
      .sort((a, b) => (b.date + (b.timeClose || '')).localeCompare(a.date + (a.timeClose || '')));
  }

  /* Every trade on the account, live and forward test, open and closed,
     whatever the Live / Forward test / All switch says.

     One page asks for this: Weekly winrate, which exists to put your live
     trading and your testing side by side, never added together. Following
     the switch there would leave one of its two columns empty however it was
     set — so it reads both and keeps them apart itself. Everything else still
     goes through `tradesFor`. */
  everyTradeFor(accountId) {
    return this.trades.filter(t => t.accountId === accountId);
  }

  /* ============================================================
     Live, or live and the tests as well

     A forward test is a real decision and a fake dollar. Counting it in a
     funded account's balance would be a lie; throwing it away would lose the
     only record of a decision you actually made. So both are kept and one
     switch decides which the app is currently talking about.

     Filtering here, at the single place every page asks for its trades, is
     why the dashboard, calendar, analytics, playbook and the account balance
     all follow it without a line of their own. A trade saved before this
     existed has no mode at all, and reads as live — so nothing you have
     already logged moves.
     ============================================================ */
  inScope(t) {
    const scope = this.tradeScope;
    if (scope === 'all') return true;
    const fwd = t.mode === 'forward';
    return scope === 'forward' ? fwd : !fwd;
  }

  /* live — what you took for real. forward — the tests on their own, which is
     how you read a week of testing without a funded account's numbers in the
     way. all — both, counted together.

     Journals written before this was a choice carry a true/false instead, and
     true meant live and tests together. */
  get tradeScope() {
    const a = this.data.accounts;
    if (a.tradeScope === 'live' || a.tradeScope === 'forward' || a.tradeScope === 'all') return a.tradeScope;
    return a.includeTests ? 'all' : 'live';
  }

  async setTradeScope(scope) {
    this.data.accounts.tradeScope = scope === 'forward' ? 'forward' : scope === 'all' ? 'all' : 'live';
    /* Kept in step so a vault opened by an older copy of the app still reads
       the same way rather than silently reverting to live only. */
    this.data.accounts.includeTests = this.data.accounts.tradeScope === 'all';
    await this.save('accounts');
  }

  get includeTests() { return this.tradeScope === 'all'; }

  async setIncludeTests(on) { await this.setTradeScope(on ? 'all' : 'live'); }

  /** How many forward tests are being left out right now. */
  testCountFor(accountId) {
    return this.trades.filter(t => t.accountId === accountId && t.mode === 'forward').length;
  }

  /* Which unit every figure is read in. A display preference, so it lives
     with the account list rather than with any one account. */
  get displayUnit() { return this.data.accounts.displayUnit || '$'; }

  /* Whose journal this is. Only ever shown at the foot of the sidebar, and
     empty is a perfectly good answer — the row just reads Settings then. */
  get userName() { return this.data.accounts.userName || ''; }
  async setUserName(name) {
    this.data.accounts.userName = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 32);
    await this.save('accounts');
  }

  /* The colour behind your initials. A display preference like the theme, so
     it sits with the account list rather than inside any one account — the
     name at the foot of the sidebar is yours, not the account's. Journals
     written before this existed have no colour saved and get the one they
     have always had. */
  get userColour() { return this.data.accounts.userColour || USER_COLOUR; }
  get userInk() { return inkOn(this.userColour); }
  async setUserColour(hex) {
    this.data.accounts.userColour = /^#[0-9a-f]{6}$/i.test(String(hex)) ? String(hex) : USER_COLOUR;
    await this.save('accounts');
  }

  /* Your picture and your banner: a picture or a video of your own (a video
     loops, muted), kept in the vault as screenshots/avatar-<id>.<ext> and
     banner-<id>.<ext> so they go wherever the journal goes. Without one, the
     initials on your colour and the drawn banner stand in.
       accounts.avatar / accounts.banner = { file, kind: 'image'|'video', type, thumb } */
  profileMedia(which) {
    const m = this.data.accounts?.[which === 'banner' ? 'banner' : 'avatar'];
    return m && m.file ? m : null;
  }
  /** Its url if it has been read already, else null (see profileUrl). */
  profileUrlNow(which) { const m = this.profileMedia(which); return m ? profileUrls.get(m.file) || null : null; }
  async profileUrl(which) {
    const m = this.profileMedia(which);
    if (!m) return null;
    if (profileUrls.has(m.file)) return profileUrls.get(m.file);
    try {
      const b = await fs.readImage(m.file);
      if (!b) return null;
      const url = URL.createObjectURL(new Blob([b], { type: m.type || (m.kind === 'video' ? 'video/mp4' : 'image/jpeg') }));
      profileUrls.set(m.file, url);
      return url;
    } catch { return null; }
  }
  async setProfileMedia(which, blob, meta = {}) {
    const key = which === 'banner' ? 'banner' : 'avatar';
    const kind = meta.kind === 'video' ? 'video' : 'image';
    const ext = String(meta.ext || (kind === 'video' ? 'mp4' : 'jpg')).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
    const file = `${SHOTS}/${key}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await fs.ensureDir(SHOTS);
    await fs.writeImage(file, blob);
    const old = this.data.accounts[key];
    this.data.accounts[key] = { file, kind, type: meta.type || blob.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'), thumb: meta.thumb || '' };
    profileUrls.set(file, URL.createObjectURL(new Blob([blob], { type: this.data.accounts[key].type })));
    await this.save('accounts');
    if (old?.file) await this.dropProfileFile(old.file);
    return this.data.accounts[key];
  }
  async removeProfileMedia(which) {
    const key = which === 'banner' ? 'banner' : 'avatar';
    const old = this.data.accounts[key];
    delete this.data.accounts[key];
    await this.save('accounts');
    if (old?.file) await this.dropProfileFile(old.file);
  }
  async dropProfileFile(file) {
    const url = profileUrls.get(file);
    if (url) { try { URL.revokeObjectURL(url); } catch { /* fine */ } profileUrls.delete(file); }
    await this.dropImage(file);
  }

  /* Light or dark. A display preference, so it sits with the account list
     rather than inside any one account, and it is applied before the first
     paint so the app never flashes the wrong theme. */
  get theme() { return this.lookIsDark ? 'dark' : 'light'; }

  /* ============================================================
     The look — theme, accent, text, lines, font and motion (look.js).
     Journals from before it have only `theme`: dark becomes Midnight, and
     everything else opens on Light.
     ============================================================ */
  get look() { return normaliseLook(this.data.accounts.look, this.data.accounts.theme); }
  get savedLooks() { return Array.isArray(this.data.accounts.looks) ? this.data.accounts.looks : []; }
  get lookSchedule() { return { on: false, dayAt: '07:00', nightAt: '19:00', ...(this.data.accounts.lookSchedule || {}) }; }
  /** The look on screen: the saved one, or the one the clock asks for. */
  get effectiveLook() {
    const s = scheduledLook(this.lookSchedule, this.savedLooks);
    return s ? normaliseLook(s.look) : this.look;
  }
  get lookIsDark() { const th = themeOf(this.effectiveLook.theme); return !th.paper && !th.classic; }

  applyLookNow() {
    const eff = this.effectiveLook;
    const s = scheduledLook(this.lookSchedule, this.savedLooks);
    const colours = s?.colours ? { ...this.colours, ...s.colours } : this.colours;
    const th = themeOf(eff.theme);
    applyTheme(this.lookIsDark ? 'dark' : 'light', colours, !!th.classic);
    /* the look first: it sets data-motion, which decides whether the video plays */
    applyLook(eff, { glass: this.glassMode === 'clear' ? 'clear' : this.glass, bg: this.hasBackground });
    applySurface(this.background, this.glassMode === 'clear' ? 'clear' : this.glass, this.theme, this.bgDim, this.clarity, this.picInk);
  }

  async setLook(patch) {
    this.data.accounts.look = normaliseLook({ ...this.look, ...patch });
    this.data.accounts.theme = this.lookIsDark ? 'dark' : 'light';
    this.applyLookNow();
    await this.save('accounts');
  }
  /** Everything a saved look carries, in one object. */
  snapshotLook() {
    return { look: this.look, colours: { ...this.colours }, background: this.background, glass: this.data.accounts.glass === 'clear' ? 'clear' : this.glass,
             clarity: this.clarity, picInk: this.picInk };
  }
  async restoreLook(snap) {
    if (!snap) return;
    this.data.accounts.look = normaliseLook(snap.look);
    if (snap.colours) this.data.accounts.colours = { ...DEFAULT_COLOURS, ...snap.colours };
    if (snap.background !== undefined) this.data.accounts.background = snap.background || '';
    if (snap.glass !== undefined) this.data.accounts.glass = snap.glass === 'clear' ? 'clear' : !!snap.glass;
    if (snap.clarity != null) this.data.accounts.clarity = clampClarity(snap.clarity);
    if (PIC_INKS.includes(snap.picInk)) this.data.accounts.picInk = snap.picInk;
    this.data.accounts.theme = this.lookIsDark ? 'dark' : 'light';
    this.applyLookNow();
    await this.loadBgVideo();
    await this.save('accounts');
  }
  async saveLook(name) {
    const entry = { id: 'look_' + crypto.randomUUID().slice(0, 8), name: String(name || 'My look').trim().slice(0, 40) || 'My look',
                    ...this.snapshotLook(), savedAt: new Date().toISOString() };
    this.data.accounts.looks = [...this.savedLooks, entry];
    await this.save('accounts');
    return entry;
  }
  async importLook(obj) {
    const src = obj && obj.look ? obj : null;
    if (!src) throw new Error('That file is not a Laminar look');
    const entry = { id: 'look_' + crypto.randomUUID().slice(0, 8), name: String(src.name || 'Imported look').slice(0, 40),
                    look: normaliseLook(src.look), colours: { ...DEFAULT_COLOURS, ...(src.colours || {}) },
                    background: /^(own|yours):/.test(String(src.background || '')) ? '' : (src.background || ''),
                    glass: src.glass === 'clear' ? 'clear' : !!src.glass, savedAt: new Date().toISOString() };
    this.data.accounts.looks = [...this.savedLooks, entry];
    await this.save('accounts');
    return entry;
  }
  async deleteLook(id) {
    this.data.accounts.looks = this.savedLooks.filter(l => l.id !== id);
    const sch = this.lookSchedule;
    if (sch.day === id || sch.night === id) this.data.accounts.lookSchedule = { ...sch, on: false };
    this.applyLookNow();
    await this.save('accounts');
  }
  async setLookSchedule(patch) {
    this.data.accounts.lookSchedule = { ...this.lookSchedule, ...patch };
    this.applyLookNow();
    await this.save('accounts');
  }
  async resetLook() {
    this.data.accounts.look = normaliseLook({});
    this.data.accounts.colours = { ...DEFAULT_COLOURS };
    this.data.accounts.background = '';
    this.data.accounts.glass = false;
    this.data.accounts.theme = 'light';
    this.applyLookNow();
    await this.save('accounts');
  }

  /* ============================================================
     Sharing a trade (views/share.js). Your own clips and pictures are kept
     in the vault as screenshots/share-*.mp4 / .gif / .jpg, so they go
     wherever the journal goes and a vault backup carries them. Each keeps
     how you left it — trim, crop, dim, volume. The sheet's own choices
     (size, style…) are kept beside them.
     ============================================================ */
  get share() {
    const sh = this.data.accounts.share || {};
    return { prefs: { ...SHARE_DEFAULTS, ...(sh.prefs || {}) }, clips: Array.isArray(sh.clips) ? sh.clips : [] };
  }
  async setSharePrefs(patch) {
    const cur = this.share;
    this.data.accounts.share = { ...cur, prefs: { ...cur.prefs, ...patch } };
    await this.save('accounts');
  }
  /** Keep a clip or picture: `meta` is { name, kind: 'video'|'image', type, ext, dur, thumb }. */
  async addShareClip(blob, meta) {
    const id = 'clip_' + crypto.randomUUID().slice(0, 8);
    const ext = String(meta.ext || 'mp4').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp4';
    const file = `${SHOTS}/share-${id.slice(5)}.${ext}`;
    await fs.ensureDir(SHOTS);
    await fs.writeImage(file, blob);
    const dur = Number(meta.dur) || 0;
    const clip = {
      id, file, name: String(meta.name || 'Clip').slice(0, 40), kind: meta.kind === 'image' ? 'image' : 'video',
      type: meta.type || (meta.kind === 'image' ? 'image/jpeg' : 'video/mp4'), dur, thumb: meta.thumb || '',
      start: 0, len: dur || 6, fx: 0.5, fy: 0.5, dim: 0.25, sound: 0.7, addedAt: new Date().toISOString(),   // the whole clip
    };
    const cur = this.share;
    this.data.accounts.share = { ...cur, clips: [...cur.clips, clip], prefs: { ...cur.prefs, bg: id } };
    await this.save('accounts');
    return clip;
  }
  /** The clips with sound that come with Laminar (share/clips.js), as he has left each one. */
  get builtinClips() {
    const set = this.share.prefs.builtin || {};
    return BUILTIN_CLIPS.map(b => ({ ...b, kind: 'video', type: 'video/mp4', builtin: true,
      start: 0, len: b.dur, fx: 0.5, fy: 0.5, dim: 0.25, sound: 0.7, ...(set[b.id] || {}), id: b.id, src: b.src }));
  }
  async updateShareClip(id, patch) {
    if (isBuiltinClip(id)) {
      const cur = this.share, set = { ...(cur.prefs.builtin || {}) };
      const { id: _, file: __, src: ___, ...keep } = patch;
      set[id] = { ...(set[id] || {}), ...keep };
      this.data.accounts.share = { ...cur, prefs: { ...cur.prefs, builtin: set } };
      await this.save('accounts');
      return;
    }
    const cur = this.share;
    this.data.accounts.share = { ...cur, clips: cur.clips.map(c => (c.id === id ? { ...c, ...patch, id, file: c.file } : c)) };
    await this.save('accounts');
  }
  async removeShareClip(id) {
    const cur = this.share;
    const gone = cur.clips.find(c => c.id === id);
    const prefs = cur.prefs.bg === id ? { ...cur.prefs, bg: SHARE_DEFAULTS.bg } : cur.prefs;
    this.data.accounts.share = { ...cur, clips: cur.clips.filter(c => c.id !== id), prefs };
    await this.save('accounts');
    if (gone) await this.dropImage(gone.file);
  }
  /** The clip's bytes, typed as what they are (the vault hands back pictures as JPEG). */
  async shareClipBlob(clip) {
    if (clip?.builtin) {
      if (!builtinBlobs.has(clip.src)) builtinBlobs.set(clip.src, fetch(clip.src).then(r => (r.ok ? r.blob() : null)).catch(() => null));
      const b = await builtinBlobs.get(clip.src);
      if (!b) builtinBlobs.delete(clip.src);
      return b ? new Blob([b], { type: 'video/mp4' }) : null;
    }
    if (!clip?.file) return null;
    try {
      const b = await fs.readImage(clip.file);
      return b ? new Blob([b], { type: clip.type || 'video/mp4' }) : null;
    } catch { return null; }
  }

  /* ============================================================
     Your own background videos (Appearance → Custom). Kept in the vault as
     screenshots/bgvideo-<id>.<ext> so they go wherever the journal goes and
     a backup carries them; listed in accounts.json → bgVideos with a name, a
     still (`thumb`) and how long they run. The background's value for one
     is 'yours:<id>'.
     ============================================================ */
  get bgVideos() { return Array.isArray(this.data.accounts.bgVideos) ? this.data.accounts.bgVideos : []; }
  /** The url a video of yours plays from, read from the vault once. */
  async bgVideoUrl(id) {
    const v = this.bgVideos.find(x => x.id === id);
    if (!v) return null;
    if (yourUrls.has(id)) return yourUrls.get(id).url;
    try {
      const b = await fs.readImage(v.file);
      if (!b) return null;
      const url = URL.createObjectURL(new Blob([b], { type: v.type || 'video/mp4' }));
      rememberYourBackground(id, url, v.thumb || '');
      return url;
    } catch { return null; }
  }
  async loadBgVideo() {
    const b = this.background;
    if (!b.startsWith('yours:')) return;
    if (await this.bgVideoUrl(b.slice(6))) this.applyLookNow();
  }
  /** Keep a video and put it behind the journal. `meta` is { name, type, ext, dur, thumb }. */
  async addBgVideo(blob, meta = {}) {
    const id = 'bgv_' + crypto.randomUUID().slice(0, 8);
    const ext = String(meta.ext || 'mp4').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp4';
    const file = `${SHOTS}/bgvideo-${id.slice(4)}.${ext}`;
    await fs.ensureDir(SHOTS);
    await fs.writeImage(file, blob);
    const entry = { id, file, name: String(meta.name || 'Video').slice(0, 40), type: meta.type || 'video/mp4',
                    dur: Number(meta.dur) || 0, thumb: meta.thumb || '', addedAt: new Date().toISOString() };
    this.data.accounts.bgVideos = [...this.bgVideos, entry];
    rememberYourBackground(id, URL.createObjectURL(new Blob([blob], { type: entry.type })), entry.thumb);
    const introduced = await this.setBackground('yours:' + id);
    return { entry, introduced };
  }
  async removeBgVideo(id) {
    const gone = this.bgVideos.find(v => v.id === id);
    this.data.accounts.bgVideos = this.bgVideos.filter(v => v.id !== id);
    if (this.background === 'yours:' + id) this.data.accounts.background = '';
    const got = yourUrls.get(id);
    if (got) { try { URL.revokeObjectURL(got.url); } catch { /* fine */ } yourUrls.delete(id); }
    this.applyLookNow();
    await this.save('accounts');
    if (gone) await this.dropImage(gone.file);
  }
  /** Whether something is actually behind the app right now. */
  get hasBackground() { return !!(findBackground(this.background) || yourBackground(this.background)); }
  /** The writing on the picture: 'auto' | 'white' | 'black' | 'grey' | 'theme'. */
  get picInk() { const v = this.data.accounts.picInk; return PIC_INKS.includes(v) ? v : 'auto'; }
  async setPicInk(v) {
    this.data.accounts.picInk = PIC_INKS.includes(v) ? v : 'auto';
    this.applyLookNow();
    await this.save('accounts');
  }
  /** How clear Clear glass is, 0–1 (1 is barely there). */
  get clarity() { return clampClarity(this.data.accounts.clarity); }
  async setClarity(v) {
    this.data.accounts.clarity = clampClarity(v);
    this.applyLookNow();
    await this.save('accounts');
  }
  /** How dark the video sits behind the writing; null = the video's own. */
  get bgDim() { const d = this.data.accounts.bgDim; return d == null || d === '' ? null : Number(d); }
  async setBgDim(v) {
    this.data.accounts.bgDim = v == null ? null : Math.max(0, Math.min(0.9, Number(v)));
    this.applyLookNow();
    await this.save('accounts');
  }

  get colours() { return { ...DEFAULT_COLOURS, ...(this.data.accounts.colours || {}) }; }

  /* What is behind the app, and whether the panels are see-through. Display
     preferences, so they live with the account list rather than inside any one
     account. */
  get background() { return this.data.accounts.background || ''; }
  get glass()      { return !!this.data.accounts.glass; }
  /** 'off', 'frosted' or 'clear'. */
  get glassMode()  { const g = this.data.accounts.glass; return g === 'clear' ? 'clear' : g ? 'frosted' : 'off'; }

  /* Light or dark, the old two-way switch: dark is Midnight, light is Light. */
  async setTheme(t) {
    await this.setLook({ theme: t === 'dark' ? 'midnight' : 'light' });
  }
  async setColour(which, hex) {
    this.data.accounts.colours = { ...this.colours, [which]: hex };
    this.applyLookNow();
    await this.save('accounts');
  }
  /**
   * Choose a picture — and, the very first time one is ever chosen, turn the
   * glass on with it.
   *
   * A picture behind solid panels only shows in the gutters, which is not what
   * anyone is picturing when they pick one. So the first choice makes the
   * introduction, once, and says so. After that the two are independent and
   * nothing touches the glass again: switching pictures later is switching
   * pictures, and a setting you have had an opinion about is yours.
   *
   * Returns true when it did that, so the view can mention it rather than
   * changing something behind your back.
   */
  async setBackground(id) {
    const introduce = !!id && !this.data.accounts.glassNudged && !this.glass;
    this.data.accounts.background = id || '';
    if (id) this.data.accounts.glassNudged = true;
    if (introduce) this.data.accounts.glass = 'clear';   // the first video comes with the glass you can see it through
    this.applyLookNow();
    await this.save('accounts');
    return introduce;
  }
  async setGlass(on) {
    this.data.accounts.glass = on === 'clear' ? 'clear' : on === 'frosted' ? true : on === 'off' ? false : !!on;
    /* Having an opinion about the glass counts as having met it. */
    this.data.accounts.glassNudged = true;
    this.applyLookNow();
    await this.save('accounts');
  }
  async setDisplayUnit(u) {
    this.data.accounts.displayUnit = UNITS.includes(u) ? u : '$';
    await this.save('accounts');
  }

  async setActiveAccount(id) {
    this.data.accounts.activeAccountId = id;
    await this.save('accounts');
  }

  async addAccount(acc) {
    const account = {
      id: 'acc_' + crypto.randomUUID().slice(0, 8),
      name: acc.name.trim(),
      currency: acc.currency || 'USD',
      startingBalance: Number(acc.startingBalance) || 0,
      defaultRiskPercent: Number(acc.defaultRiskPercent) || 1,
      color: acc.color || '#0988F0',
      openedAt: acc.openedAt || todayISO(),
      weeklyTargetPercent: Number(acc.weeklyTargetPercent) || 0,   // 0 = no target set
      archived: false,
      /* what kind of account, and where (acctfirms.js) */
      kind: ['eval', 'funded', 'live'].includes(acc.kind) ? acc.kind : undefined,
      firm: acc.firm || undefined, firmName: acc.firm === 'other' ? String(acc.firmName || '').trim().slice(0, 40) : undefined,
      payouts: [], adjustments: [],
    };
    for (const k of ['kind', 'firm', 'firmName']) if (account[k] === undefined) delete account[k];
    this.data.accounts.accounts.push(account);
    this.data.accounts.activeAccountId = account.id;
    await this.save('accounts');
    return account;
  }

  async updateAccount(id, patch) {
    const a = this.data.accounts.accounts.find(x => x.id === id);
    if (!a) return;
    Object.assign(a, patch);
    await this.save('accounts');
  }

  /* ============================================================
     An account's money: its trades, what has been paid out of it, and any
     corrections made to match the firm's or the broker's own figure. Live
     trades only — a forward test is not money. (calc.accountMoney)
     ============================================================ */
  liveClosedFor(accountId) {
    return this.trades.filter(t => t.accountId === accountId && t.status !== 'open' && t.mode !== 'forward');
  }
  moneyOf(a) { return accountMoney(a, a ? this.liveClosedFor(a.id) : []); }
  /** What the account holds now: the start, plus the P&L, less what has been paid out. */
  balanceOf(a) { return this.moneyOf(a).balance; }

  async addPayout(id, { amount, date, note } = {}) {
    const a = this.data.accounts.accounts.find(x => x.id === id);
    const v = Math.abs(Number(amount));
    if (!a || !(v > 0)) return null;
    const p = { id: 'po_' + crypto.randomUUID().slice(0, 8), amount: Math.round(v * 100) / 100, date: date || todayISO(),
                at: nowHMS(), note: String(note || '').trim().slice(0, 80) };
    a.payouts = [...(Array.isArray(a.payouts) ? a.payouts : []), p];
    await this.save('accounts');
    return p;
  }
  async removePayout(id, payoutId) {
    const a = this.data.accounts.accounts.find(x => x.id === id);
    if (!a) return;
    a.payouts = (a.payouts || []).filter(p => p.id !== payoutId);
    await this.save('accounts');
  }
  /** Make the balance read what the firm or broker says it is, by a dated correction. Returns the difference. */
  async setBalance(id, actual, date) {
    const a = this.data.accounts.accounts.find(x => x.id === id);
    const want = Number(actual);
    if (!a || !isFinite(want)) return 0;
    const diff = Math.round((want - this.balanceOf(a)) * 100) / 100;
    if (Math.abs(diff) < 0.005) return 0;
    a.adjustments = [...(Array.isArray(a.adjustments) ? a.adjustments : []),
      { id: 'adj_' + crypto.randomUUID().slice(0, 8), amount: diff, date: date || todayISO(), at: nowHMS() }];
    await this.save('accounts');
    return diff;
  }
  async removeAdjustment(id, adjId) {
    const a = this.data.accounts.accounts.find(x => x.id === id);
    if (!a) return;
    a.adjustments = (a.adjustments || []).filter(x => x.id !== adjId);
    await this.save('accounts');
  }
  /* An evaluation passed: it is put away as passed, and the funded account
     it earned starts fresh beside it (same firm, size, risk), and is the one
     you are on. Returns the new account. */
  async passEval(id) {
    const a = this.data.accounts.accounts.find(x => x.id === id);
    if (!a) return null;
    const base = String(a.name).replace(/\s*\b(eval(uation)?|challenge|combine|phase ?\d|step ?\d)\b\s*/ig, ' ').replace(/\s+/g, ' ').trim() || a.name;
    const taken = new Set(this.allAccounts.map(x => x.name.toLowerCase()));
    let name = base;
    for (let i = 2; taken.has(name.toLowerCase()) && i < 200; i++) name = `${base} #${i}`;
    a.archived = true; a.status = 'passed'; a.closedAt = todayISO();
    const fresh = await this.addAccount({ name, kind: 'funded', firm: a.firm, firmName: a.firmName, currency: a.currency,
      startingBalance: a.startingBalance, defaultRiskPercent: a.defaultRiskPercent, color: a.color,
      weeklyTargetPercent: a.weeklyTargetPercent });
    this.data.accounts.activeAccountId = fresh.id;
    await this.save('accounts');
    return fresh;
  }
  /** Blown: put away, marked as blown, every trade kept. */
  async blowAccount(id) {
    const a = this.data.accounts.accounts.find(x => x.id === id);
    if (!a) return;
    a.archived = true; a.status = 'blown'; a.closedAt = todayISO();
    if (this.data.accounts.activeAccountId === id) this.data.accounts.activeAccountId = this.accounts[0]?.id || null;
    await this.save('accounts');
  }

  /* ============================================================
     The firms' logos: his own image of each, squared and centred (logo.js),
     kept in the vault as screenshots/logo-<firm>-*.png and listed in
     accounts.firmLogos by firm key (acctfirms.firmKey). Every account at
     that firm wears it.
     ============================================================ */
  get firmLogos() { const m = this.data.accounts.firmLogos; return m && typeof m === 'object' ? m : {}; }
  firmLogoUrlNow(key) { const f = key && this.firmLogos[key]; return f ? profileUrls.get(f) || null : null; }
  async firmLogoUrl(key) {
    const f = key && this.firmLogos[key];
    if (!f) return null;
    if (profileUrls.has(f)) return profileUrls.get(f);
    try {
      const b = await fs.readImage(f);
      if (!b) return null;
      const url = URL.createObjectURL(new Blob([b], { type: 'image/png' }));
      profileUrls.set(f, url);
      return url;
    } catch { return null; }
  }
  async setFirmLogo(key, blob) {
    if (!key || !blob) return null;
    const file = `${SHOTS}/logo-${key.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}-${crypto.randomUUID().slice(0, 6)}.png`;
    await fs.ensureDir(SHOTS);
    await fs.writeImage(file, blob);
    const old = this.firmLogos[key];
    this.data.accounts.firmLogos = { ...this.firmLogos, [key]: file };
    profileUrls.set(file, URL.createObjectURL(new Blob([blob], { type: 'image/png' })));
    await this.save('accounts');
    if (old) await this.dropProfileFile(old);
    return file;
  }
  async removeFirmLogo(key) {
    const old = this.firmLogos[key];
    if (!old) return;
    const m = { ...this.firmLogos }; delete m[key];
    this.data.accounts.firmLogos = m;
    await this.save('accounts');
    await this.dropProfileFile(old);
  }

  /* An account, for good — with every trade in it and every chart those
     trades carry. Archiving is how an account is put away; this is for one
     you want gone. A trade left pointing at an account that no longer exists
     would be a trade no page could show and no page could delete, so none
     is left. Returns how many trades went with it. */
  async deleteAccount(id) {
    const doomed = this.trades.filter(t => t.accountId === id);
    for (const t of doomed) for (const name of [...tradeShotsOf(t), ...reviewShotsOf(t)]) await this.dropImage(name);
    this.data.trades.trades = this.trades.filter(t => t.accountId !== id);
    this.data.accounts.accounts = this.allAccounts.filter(a => a.id !== id);
    if (this.data.accounts.activeAccountId === id) this.data.accounts.activeAccountId = this.accounts[0]?.id || null;
    await this.save('trades');
    await this.save('accounts');
    return doomed.length;
  }

  async addTrade(t) {
    const trade = { id: 't_' + crypto.randomUUID().slice(0, 8), createdAt: new Date().toISOString(), ...t };
    this.data.trades.trades.push(trade);
    await this.save('trades');
    return trade;
  }

  async updateTrade(id, patch) {
    const t = this.trades.find(x => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    await this.save('trades');
  }

  async deleteTrade(id) {
    /* The charts go with the trade. Leaving them behind would quietly grow a
       folder of pictures of trades that no longer exist. */
    const t = this.trades.find(x => x.id === id);
    if (t) for (const name of [...tradeShotsOf(t), ...reviewShotsOf(t)]) await this.dropImage(name);
    this.data.trades.trades = this.trades.filter(x => x.id !== id);
    await this.save('trades');
  }

  /* ============================================================
     Screenshots

     The picture is written to the journal and the trade keeps only its name,
     which is why a screenshot never bloats trades.json and why the folder
     stays browsable. Writing happens after the trade has an id, so the two
     can never disagree about what a file is called.
     ============================================================ */
  /* A trade used to hold exactly two charts, in shotLtf and shotHtf. It holds
     a list now, so a setup that needs four timeframes can have four. The old
     names are kept exactly as they are — the file on disk does not move, only
     the field that points at it. */
  async putShot(tradeId, blob, shotId) {
    const name = shotName(tradeId, shotId || newShotId());
    await fs.ensureDir('screenshots');
    await fs.writeImage(name, blob);
    forgetUrl(name);                    // any cached url now points at the old picture
    const t = this.trades.find(x => x.id === tradeId);
    if (t) {
      t.shots = tradeShotsOf(t);
      if (!t.shots.includes(name)) t.shots.push(name);
      await this.save('trades');
    }
    return name;
  }

  /* ============================================================
     The weekly review
     ============================================================ */
  get reviewWeeks() { return this.data.review.weeks; }

  /** What you said about one trade, after the fact. Merged, not replaced. */
  async setTradeReview(id, patch) {
    const t = this.data.trades.trades.find(x => x.id === id);
    if (!t) return;
    t.review = { ...(t.review || {}), ...patch, at: new Date().toISOString() };
    await this.save('trades');
  }

  /** Notes for one week: what worked, what to fix, one focus, and done. */
  async setWeekNote(week, patch) {
    this.data.review.weeks[week] = { ...(this.data.review.weeks[week] || {}), ...patch };
    await this.save('review');
  }

  /** A picture of what price did after the trade. Kept apart from the trade's
      own charts, which show what you saw when you took it. */
  async putReviewShot(tradeId, blob) {
    const name = `screenshots/${tradeId}-after-${newShotId()}.jpg`;
    await fs.ensureDir('screenshots');
    await fs.writeImage(name, blob);
    forgetUrl(name);
    const t = this.data.trades.trades.find(x => x.id === tradeId);
    if (t) {
      t.review = { ...(t.review || {}) };
      t.review.after = [...reviewShotsOf(t), name];
      await this.save('trades');
    }
    return name;
  }

  async dropReviewShot(trade, name) {
    if (!trade?.review || !reviewShotsOf(trade).includes(name)) return;
    await this.dropImage(name);
    trade.review.after = reviewShotsOf(trade).filter(n => n !== name);
    await this.save('trades');
  }

  async clearShot(trade, name) {
    if (!trade || !name) return;
    const held = tradeShotsOf(trade);
    if (!held.includes(name)) return;
    try { await fs.deleteImage(name); } catch { /* the record matters more than the file */ }
    forgetUrl(name);
    trade.shots = held.filter(n => n !== name);
    delete trade.shotLtf; delete trade.shotHtf;
    await this.save('trades');
  }

  /** A url the app can put in an <img>, or null if the picture has gone. */
  async shotUrl(name) {
    if (!name) return null;
    try {
      const blob = await fs.readImage(name);
      return blob ? urlFor(name, blob) : null;
    } catch { return null; }
  }
}

/* One trade's charts, however old the record is. A trade logged before this
   existed says shotLtf and shotHtf; every one since says shots. Both are
   read, so nothing has to be migrated before it can be shown. */
export function tradeShotsOf(trade) {
  if (!trade) return [];
  if (Array.isArray(trade.shots)) return trade.shots.filter(Boolean);
  return [trade.shotLtf, trade.shotHtf].filter(Boolean);
}

/** The "after" pictures added while reviewing a trade. */
export function reviewShotsOf(trade) {
  return Array.isArray(trade?.review?.after) ? trade.review.after.filter(Boolean) : [];
}

/** A short, unrepeatable name for one chart. */
export const newShotId = () => crypto.randomUUID().slice(0, 8);

/* One instrument's charts, however old the record is. A morning written
   before an instrument could hold more than one chart says `shot`; every one
   written since says `shots`. Both are read, so nothing has to be migrated
   before it can be shown. */
export function outlookShotsOf(instrument) {
  if (!instrument) return [];
  if (Array.isArray(instrument.shots)) return instrument.shots.filter(Boolean);
  return instrument.shot ? [instrument.shot] : [];
}

/** The colour the sidebar's initials have always sat on. */
export const USER_COLOUR = '#F4624A';

function defaultAccounts() {
  return { version: 2, accounts: [], activeAccountId: null, displayUnit: '$' };
}

/* Sessions are Perth-anchored by default; every one of these is editable
   in the playbook, and nothing in the app hardcodes them. */
/* ICT killzones, expressed on a Perth (AWST, UTC+8) clock.
   These are the New-York-on-EDT figures. When New York goes back to EST the
   whole set shifts one hour later in Perth — every one of these is editable
   in the playbook, so that is a one-off nudge twice a year.

     Kill zone      New York        Perth (EDT)     Perth (EST)
     Asia           20:00-00:00     08:00-12:00     09:00-13:00
     London Open    02:00-05:00     14:00-17:00     15:00-18:00
     New York Open  07:00-10:00     19:00-22:00     20:00-23:00
     London Close   10:00-12:00     22:00-00:00     23:00-01:00

   A pre-session is the hour before its killzone opens. Pre-London Close sits
   inside the New York Open window; the first match in this list wins, so a
   trade at 21:30 is labelled New York Open. Reorder them to change that. */
export function DEFAULT_SESSIONS() {
  return [
    { id: 'ses_pre_asia',   name: 'Pre-Asia',         start: '07:00', end: '08:00' },
    { id: 'ses_asia',       name: 'Asia',             start: '08:00', end: '12:00' },
    { id: 'ses_pre_london', name: 'Pre-London',       start: '13:00', end: '14:00' },
    { id: 'ses_london',     name: 'London Open',      start: '14:00', end: '17:00' },
    { id: 'ses_pre_ny',     name: 'Pre-NY',           start: '18:00', end: '19:00' },
    { id: 'ses_ny',         name: 'New York Open',    start: '19:00', end: '22:00' },
    { id: 'ses_pre_lc',     name: 'Pre-London Close', start: '21:00', end: '22:00' },
    { id: 'ses_lc',         name: 'London Close',     start: '22:00', end: '00:00' },
  ];
}

const PLAYBOOK_VERSION = 3;

/* The Lab starts with no firms at all: the rules are yours to type in, and a
   guessed firm would be a wrong number that looks right. */
function defaultLab() {
  return { version: 1, firms: [], firmId: null, source: 'live',
           plan: { riskEval: null, riskFunded: null, months: 6 }, ghost: blankRules(),
           mc: { risk: null, horizon: 100, ddLimit: 10 }, quant: { versions: [], current: null } };
}

function defaultPlaybook() {
  return {
    version: PLAYBOOK_VERSION,
    setups: [],
    tagGroups: [
      { id: 'g_exec',    name: 'Execution', tags: [] },
      { id: 'g_mistake', name: 'Mistakes',  tags: [] },
      { id: 'g_context', name: 'Context',   tags: [] },
    ],
    sessions: DEFAULT_SESSIONS(),
    rules: { maxTradesPerDay: 3, dailyLossCapPercent: 3 },
    replay: { windowMins: 15, csvClock: 'local' },
  };
}

export const store = new Store();
