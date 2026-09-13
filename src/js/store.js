/* ============================================================
   store.js — the journal as plain files in a folder.

   Where those files physically live, and how they are read, is fs.js's
   problem: native through Rust, or the browser's File System Access API.
   This file only knows about accounts, trades, playbook and replay.
   ============================================================ */

import { sessionFor, UNITS, todayISO, readableOn, lift, sink } from './calc.js';
import { findBackground, scrimFor } from './backgrounds.js';
import { SLOTS, shotName, urlFor, forgetUrl } from './shots.js';
import { fs, isTauri } from './fs.js';
import { zip, unzip, bytesOfText, textOfBytes } from './vault.js';
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
     picture stops being a picture. It does not depend on the theme: Ledger's
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
         ...this.trades.flatMap(t => [t.shotLtf, t.shotHtf]).filter(Boolean)]
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
    const [accounts, trades, playbook, replay] = await Promise.all([
      this.readJSON(FILES.accounts, defaultAccounts()),
      this.readJSON(FILES.trades,   { version: 1, trades: [] }),
      this.readJSON(FILES.playbook, defaultPlaybook()),
      this.readJSON(FILES.replay,   { version: 1, weeks: {} }),
    ]);
    this.data = { accounts, trades, playbook, replay };
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
      this.ensureDir(SHOTS),
      this.writeText(MANIFEST, JSON.stringify({
        kind: 'ledger-vault', version: 1, app: 'Ledger',
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
  shotNames() {
    return this.trades.flatMap(t => [t.shotLtf, t.shotHtf]).filter(Boolean);
  }

  async exportVault() {
    const entries = [{
      name: MANIFEST,
      bytes: bytesOfText(JSON.stringify({
        kind: 'ledger-vault', version: 1, app: 'Ledger',
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
             name: `ledger-vault-${todayISO()}.zip` };
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
    const trades = find('data/trades.json') || find('trades.json');
    const accounts = find('data/accounts.json') || find('accounts.json');
    if (!trades || !accounts) throw new Error('That file is not a Ledger vault.');

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

     A vault can arrive with a key missing: an older Ledger wrote it, a write
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
      pb.replay = pb.replay || { windowMins: 15, csvOffsetHours: 8 };
      pb.version = 3;
      this.pendingMigration = true;
    }
  }

  async save(which) {
    const map = { accounts: FILES.accounts, trades: FILES.trades, playbook: FILES.playbook, replay: FILES.replay };
    await this.writeJSON(map[which], this.data[which]);
    this.emit();
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
      .filter(t => t.accountId === accountId && t.status === 'open')
      .sort((a, b) => (a.date + (a.timeOpen || '')).localeCompare(b.date + (b.timeOpen || '')));
  }

  allTradesFor(accountId) {
    return this.trades
      .filter(t => t.accountId === accountId)
      .sort((a, b) => (b.date + (b.timeClose || '')).localeCompare(a.date + (a.timeClose || '')));
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
    if (t) for (const slot of SLOTS) await this.clearShot(t, slot.key);
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
  async putShot(tradeId, slot, blob) {
    const name = shotName(tradeId, slot);
    await fs.ensureDir('screenshots');
    await fs.writeImage(name, blob);
    forgetUrl(name);                    // any cached url now points at the old picture
    const field = SLOTS.find(s => s.key === slot)?.field;
    const t = this.trades.find(x => x.id === tradeId);
    if (t && field) { t[field] = name; await this.save('trades'); }
    return name;
  }

  async clearShot(trade, slot) {
    const field = SLOTS.find(s => s.key === slot)?.field;
    if (!trade || !field || !trade[field]) return;
    const name = trade[field];
    try { await fs.deleteImage(name); } catch { /* the record matters more than the file */ }
    forgetUrl(name);
    trade[field] = null;
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
    replay: { windowMins: 15, csvOffsetHours: 8 },
  };
}

export const store = new Store();
