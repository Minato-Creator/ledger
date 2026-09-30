/* ============================================================
   store.js — the journal as plain files in a folder.

   Where those files physically live, and how they are read, is fs.js's
   problem: native through Rust, or the browser's File System Access API.
   This file only knows about accounts, trades, playbook and replay.
   ============================================================ */

import { sessionFor, UNITS, todayISO, readableOn, lift, sink, inkOn } from './calc.js';
import { findBackground, scrimFor } from './backgrounds.js';
import { shotName, urlFor, forgetUrl } from './shots.js';
import { fs, isTauri } from './fs.js';
import { zip, unzip, bytesOfText, textOfBytes } from './vault.js';
import { blankSheet } from './lab.js';
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
/* The picture behind everything, and whether the panels let it through.

   Both are written onto the root element so every screen inherits them without
   a single view knowing they exist. A background is held down by a scrim tuned
   to the picture and to the theme — a bright photo under a dark interface needs
   more holding down than a dark one does. */
export function applySurface(background, glass, theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const bg = findBackground(background);
  root.dataset.glass = glass ? 'on' : 'off';
  if (!bg) {
    root.removeAttribute('data-bg');
    root.style.removeProperty('--bg-image');
    root.style.removeProperty('--bg-scrim');
    return;
  }
  /* Enough to hold the picture down behind small text, not so much that the
     picture stops being a picture. It does not depend on the theme: Quire's
     panels are dark and its writing is light in both, so what the scrim has to
     protect is the same either way. */
  const scrim = scrimFor(bg);
  root.dataset.bg = bg.id;
  root.style.setProperty('--bg-image', `url("${bg.url}")`);
  root.style.setProperty('--bg-scrim', String(scrim));
}

export function applyTheme(theme, colours) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const dark = theme === 'dark';
  root.dataset.theme = dark ? 'dark' : 'light';

  const { profit, loss } = { ...DEFAULT_COLOURS, ...(colours || {}) };
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
         ...this.trades.flatMap(t => tradeShotsOf(t))]
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
    const [accounts, trades, playbook, replay, outlooks, news, wire, lab] = await Promise.all([
      this.readJSON(FILES.accounts, defaultAccounts()),
      this.readJSON(FILES.trades,   { version: 1, trades: [] }),
      this.readJSON(FILES.playbook, defaultPlaybook()),
      this.readJSON(FILES.replay,   { version: 1, weeks: {} }),
      this.readJSON(FILES.outlooks, { version: 1, days: {} }),
      this.readJSON(FILES.news,     { version: 1, fetchedAt: null, events: [] }),
      this.readJSON(FILES.wire,     { version: 1, fetchedAt: null, seenAt: null, items: [] }),
      this.readJSON(FILES.lab,      defaultLab()),
    ]);
    this.data = { accounts, trades, playbook, replay, outlooks, news, wire, lab };
    this.heal();
    this.migrate();
    applyTheme(this.theme, this.colours);
    applySurface(this.background, this.glass, this.theme);

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
      this.ensureDir(SHOTS),
      this.writeText(MANIFEST, JSON.stringify({
        kind: 'quire-vault', version: 1, app: 'Quire',
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
    const fromTrades = this.trades.flatMap(t => tradeShotsOf(t));
    const fromOutlooks = Object.values(this.data.outlooks?.days || {})
      .flatMap(day => (day.instruments || []).flatMap(i => outlookShotsOf(i)));
    return [...fromTrades, ...fromOutlooks].filter(Boolean);
  }

  async exportVault() {
    const entries = [{
      name: MANIFEST,
      bytes: bytesOfText(JSON.stringify({
        kind: 'quire-vault', version: 1, app: 'Quire',
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
    if (!trades || !accounts) throw new Error('That file is not a Quire vault.');

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

    if (!d.news || typeof d.news !== 'object') { d.news = { version: 1, fetchedAt: null, events: [] }; note(); }
    if (!Array.isArray(d.news.events)) { d.news.events = []; note(); }

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
      d.wire.items = d.wire.items.filter(x => x && x.id && x.title && x.at && !isNaN(new Date(x.at)));
      if (d.wire.items.length !== n) note(); }

    /* The Lab's rule sheets. A sheet saved by an older copy, or edited by
       hand, is filled out to the current shape field by field — anything
       it had is kept, anything it lacks arrives empty rather than guessed. */
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
                  wire: FILES.wire, lab: FILES.lab };
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

  async saveNews(events) {
    this.data.news = { version: 1, fetchedAt: new Date().toISOString(), events };
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

  /* Light or dark. A display preference, so it sits with the account list
     rather than inside any one account, and it is applied before the first
     paint so the app never flashes the wrong theme. */
  get theme() { return this.data.accounts.theme === 'dark' ? 'dark' : 'light'; }
  get colours() { return { ...DEFAULT_COLOURS, ...(this.data.accounts.colours || {}) }; }

  /* What is behind the app, and whether the panels are see-through. Display
     preferences, so they live with the account list rather than inside any one
     account. */
  get background() { return this.data.accounts.background || ''; }
  get glass()      { return !!this.data.accounts.glass; }

  async setTheme(t) {
    this.data.accounts.theme = t === 'dark' ? 'dark' : 'light';
    applyTheme(this.theme, this.colours);
    applySurface(this.background, this.glass, this.theme);
    await this.save('accounts');
  }
  async setColour(which, hex) {
    this.data.accounts.colours = { ...this.colours, [which]: hex };
    applyTheme(this.theme, this.colours);
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
    if (introduce) this.data.accounts.glass = true;
    applySurface(this.background, this.glass, this.theme);
    await this.save('accounts');
    return introduce;
  }
  async setGlass(on) {
    this.data.accounts.glass = !!on;
    /* Having an opinion about the glass counts as having met it. */
    this.data.accounts.glassNudged = true;
    applySurface(this.background, this.glass, this.theme);
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
    };
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

  /* An account, for good — with every trade in it and every chart those
     trades carry. Archiving is how an account is put away; this is for one
     you want gone. A trade left pointing at an account that no longer exists
     would be a trade no page could show and no page could delete, so none
     is left. Returns how many trades went with it. */
  async deleteAccount(id) {
    const doomed = this.trades.filter(t => t.accountId === id);
    for (const t of doomed) for (const name of tradeShotsOf(t)) await this.dropImage(name);
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
    if (t) for (const name of tradeShotsOf(t)) await this.dropImage(name);
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
           plan: { riskEval: null, riskFunded: null, months: 6 } };
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
