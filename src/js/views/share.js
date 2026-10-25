/* ============================================================
   share.js — a trade as a card, a video or a GIF.

   Opened from a trade (its page, or the share icon on its row). The sheet
   is a live preview of the card with three tabs under it:

     Background  your own clips and pictures (kept in the vault, see
                 store.addShareClip) and five made here
     Adjust      trim the clip, where it sits behind the card, how dark,
                 how loud
     Format      $ / % / R, candles or a line or neither, the figure's
                 colour, the numbers boxed or plain, corners, size, quality

   and three ways out: Video (with the clip's sound), GIF and Photo.

   The preview and every export are drawn by the same function
   (share/card.js), so what you set up is what you get.

   The candles are OANDA's, read the same way as the trade's own chart:
   the day files the vault already keeps, OANDA only for what it does not.
   ============================================================ */
import { el, icon, toast, confirmButton } from '../ui.js';
import * as c from '../calc.js';
import * as cd from '../candles.js';
import { sheet } from '../sheet.js';
import { glide } from '../shell.js';
import { isTauri } from '../fs.js';
import { prepare as prepareImage } from '../shots.js';
import { drawCard, loadAssets, chartFrom, autoTf, ANIM, SIZES, sizeOf, QUALITIES, pixelsFor, TFS, ORIGINALS, originalThumb, nudgeFocus } from '../share/card.js';
import { gifWriter } from '../share/gif.js';
import { seek, probeVideo, probeImage, stills, nameFrom } from '../clip.js';
import { encodeMp4, canEncode } from '../share/encode.js';

const TABS = [['background', 'Background'], ['adjust', 'Adjust'], ['format', 'Format']];
let lastTab = 'background';
const MAX_CLIP = 80 * 1024 * 1024;
/* the card comes in over ANIM seconds; a video is never shorter than that and a beat */
const MIN_LEN = ANIM + 1.2;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/* Clips already opened this session, so going back to one does not read it again. */
const media = new Map();          // clip id -> { el, url, kind, audio }
let audioCtx = null;

export const canShare = t => !!t && t.status !== 'open';

export function openShare(store, nav, tradeId) {
  const trade = store.trades.find(x => x.id === tradeId);
  if (!canShare(trade)) { toast('Close the trade first, then share it'); return null; }
  const account = store.allAccounts.find(a => a.id === trade.accountId) || store.activeAccount;
  const st = {
    prefs: { ...store.share.prefs },
    tab: lastTab,
    load: 'loading', loadMsg: '', rows: null, win: null,
    chart: null, assets: null,
    cur: null,                    // the background in use: { id, kind, el, clip }
    t0: performance.now(), raf: 0,
    busy: null, progress: 0, stop: false,
    monitor: false,               // the preview's own sound
    strip: new Map(),             // clip id -> filmstrip images
  };
  if (!st.prefs.unit) st.prefs.unit = store.displayUnit;
  /* your picture on the card, when you have one: a still, or a video playing along */
  st.avatar = null;
  const pf = store.profileMedia('avatar');
  if (pf) store.profileUrl('avatar').then(url => {
    if (!url) return;
    if (pf.kind === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.src = url; v.play().catch(() => {});
      st.avatar = v;
    } else { const im = new Image(); im.src = url; st.avatar = im; }
  });

  const body = el('div', { class: 'sh' });
  const api = sheet({ cls: 'is-share', body, label: 'Share trade', onClose: () => { cancelAnimationFrame(st.raf); st.stop = true; pauseAll(); for (const id of [...media.keys()]) dropMedia(id); st.avatar?.pause?.(); } });

  /* ---------- the parts that stay put ---------- */
  const replayBtn = el('button', { class: 'sh-replay', onClick: () => restart() }, icon('refresh', 13, 'currentColor', 2), 'Replay');
  const head = el('div', { class: 'sh-head' },
    el('h2', {}, 'Share trade'),
    el('div', { class: 'spacer' }),
    replayBtn,
    el('button', { class: 'sheet-x', 'aria-label': 'Close', onClick: () => api.close() }, icon('close', 14, 'currentColor', 2)));
  const tfRow = el('div', { class: 'sh-tf' });
  const tfNote = el('div', { class: 'sh-tfnote' });
  const canvas = el('canvas', { class: 'sh-canvas' });
  const g = canvas.getContext('2d');
  const soundBtn = el('button', { class: 'sh-sound', title: 'Hear the clip', onClick: () => setMonitor(!st.monitor) });
  const stage = el('div', { class: 'sh-stage' }, canvas, soundBtn);
  const tabsBar = el('div', { class: 'subnav sh-tabs', role: 'tablist' });
  const tabBody = el('div', { class: 'sh-body' });
  const scroll = el('div', { class: 'sh-scroll' }, tfRow, tfNote, stage, tabsBar, tabBody);
  const outBtns = {
    video: el('button', { class: 'sh-out is-main', 'data-out': 'video', onClick: () => out('video') }),
    gif: el('button', { class: 'sh-out', 'data-out': 'gif', onClick: () => out('gif') }),
    photo: el('button', { class: 'sh-out', 'data-out': 'photo', onClick: () => out('photo') }),
  };
  const foot = el('div', { class: 'sh-foot' }, outBtns.video, outBtns.gif, outBtns.photo);
  body.append(head, scroll, foot);

  /* ============================================================
     What the card says
     ============================================================ */
  const net = Number(trade.netResult);
  const r = c.rMultiple(account, trade);
  const tone = (() => { const o = c.outcome(trade); return o === 'win' ? 'win' : o === 'loss' ? 'loss' : 'flat'; })();
  const fmtUnit = (u, k) => {
    if (u === 'R' || !Number.isFinite(net)) return c.rFmt(r == null ? null : r * k);
    if (u === '%') return c.pctSigned(c.asPercent(account, net * k));
    return c.money(net * k, { currency: account.currency });
  };
  const sizeText = () => {
    if (!trade.size) return '';
    let unit = String(trade.sizeUnit || '').trim();
    if (Number(trade.size) === 1) unit = unit.replace(/s$/, '');
    return `${trade.size} ${unit}`.trim();
  };
  /* A video of yours draws its chart as a line unless you have said
     otherwise for videos (clipStyle); the drawn backgrounds keep `style`. */
  const onVideo = () => st.cur?.kind === 'video';
  const styleKey = () => (onVideo() ? 'clipStyle' : 'style');
  const styleNow = () => st.prefs[styleKey()] || (onVideo() ? 'line' : 'candles');
  function model() {
    const p = { ...st.prefs, style: styleNow() };
    const u = p.unit || store.displayUnit;
    const stats = [];
    if (trade.entryPrice != null && trade.entryPrice !== '') stats.push(['Entry', String(trade.entryPrice)]);
    if (trade.exitPrice != null && trade.exitPrice !== '') stats.push(['Exit', String(trade.exitPrice)]);
    if (sizeText()) stats.push(['Size', sizeText()]);
    if (u === 'R') { if (Number.isFinite(net)) stats.push(['Result', c.money(net, { currency: account.currency })]); }
    else if (r != null) stats.push(['Return', c.rFmt(r)]);
    const [, mo, d] = String(trade.date).split('-').map(Number);
    const setup = store.playbook.setups.find(s => s.id === trade.setupId)?.name;
    const session = trade.sessionId ? c.sessionLabel(store.playbook, trade.sessionId) : '';
    const who = store.userName || '';
    return {
      symbol: trade.pair || '—',
      meta: `${trade.side === 'sell' ? 'SHORT' : 'LONG'} · ${MONTHS[(mo || 1) - 1]} ${d || ''}`,
      figure: fmtUnit(u, 1), figAt: k => fmtUnit(u, k), tone, stats,
      tagline: [setup, session].filter(Boolean).join(' · '),
      name: who, initials: who.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase(),
      userColour: store.userColour, userInk: store.userInk, avatar: st.avatar,
      colours: store.colours, font: fontFamily(),
      chart: p.style === 'none' || p.style === 'pnl' ? null : st.chart,
      opts: p, assets: st.assets,
      bg: bgModel(),
    };
  }
  function bgModel() {
    const b = st.cur;
    if (!b) return { kind: 'original', id: 'night' };
    if (b.kind === 'original') return { kind: 'original', id: b.id };
    return { kind: b.kind, el: b.el, fx: b.clip.fx ?? 0.5, fy: b.clip.fy ?? 0.5, dim: b.clip.dim ?? 0.25 };
  }
  const fontFamily = () => getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';

  /* ============================================================
     The candles
     ============================================================ */
  async function loadChart() {
    const inst = cd.oandaInstrument(trade.pair);
    if (!inst) return setLoad('noinst', `OANDA has no chart for ${trade.pair || 'this instrument'}, so the card goes without candles.`);
    if (!trade.timeOpen || !trade.timeClose) return setLoad('notimes', 'Add the entry and exit times to this trade to draw its candles.');
    const cred = await cd.getKey();
    if (!cred) return setLoad('nokey', 'Add your OANDA key in Settings to draw the candles.');
    try {
      const w = cd.tradeWindow(trade);
      const rows = await cd.loadDays(store, inst, w.days, cred);
      st.rows = rows.filter(x => x[0] >= w.from && x[0] <= w.to);
      st.win = w;
      if (!st.rows.length) return setLoad('empty', 'OANDA has no prices for this time — the market may have been closed.');
      setLoad('ok', '');
    } catch (e) { setLoad('error', cd.explain(e)); }
  }
  function setLoad(state, msg) {
    st.load = state; st.loadMsg = msg;
    rebuildChart(); paintTf(); restart();
  }
  const tfMinutes = () => (st.prefs.tf === 'auto' || !TFS.some(([k]) => k === st.prefs.tf)
    ? (st.win ? autoTf(st.win.entry, st.win.exit) : 5)
    : TFS.find(([k]) => k === st.prefs.tf)[1]);
  function rebuildChart() {
    st.chart = st.load === 'ok' ? chartFrom(st.rows, tfMinutes(), st.win.entry, st.win.exit, trade.entryPrice, trade.exitPrice) : null;
  }
  function paintTf() {
    const on = st.prefs.tf;
    const auto = st.win ? autoTf(st.win.entry, st.win.exit) : null;
    tfRow.replaceChildren(el('div', { class: 'sh-seg' },
      el('button', { class: on === 'auto' ? 'is-on' : '', 'data-tf': 'auto', onClick: () => setPref({ tf: 'auto' }, true) },
        'Auto', auto ? el('span', {}, ' · ' + (TFS.find(([, m]) => m === auto)?.[0] || '')) : null),
      ...TFS.map(([k]) => el('button', { class: on === k ? 'is-on' : '', 'data-tf': k, onClick: () => setPref({ tf: k }, true) }, k))));
    const msg = st.load === 'loading' ? 'Getting the prices…'
      : st.load === 'ok' ? (st.chart?.crowded ? 'A long trade for this timeframe — a bigger one fits it better.' : '')
      : st.loadMsg;
    tfNote.replaceChildren(...[msg ? el('span', {}, msg) : null,
      st.load === 'nokey' ? el('button', { class: 'sh-link', onClick: () => { api.close(); nav.go('#/settings/charts'); } }, 'Open Settings') : null].filter(Boolean));
    tfNote.hidden = !msg;
    tfRow.classList.toggle('is-off', st.load !== 'ok');
  }

  /* ============================================================
     The background
     ============================================================ */
  const clipOf = id => store.share.clips.find(x => x.id === id) || store.builtinClips.find(x => x.id === id);
  async function useBg(id, { quiet = false } = {}) {
    pauseAll();
    if (String(id).startsWith('original:')) {
      st.cur = { id: id.slice(9), kind: 'original' };
    } else {
      const clip = clipOf(id);
      if (!clip) return useBg('original:night');
      st.cur = { id, kind: clip.kind, clip, el: null };
      const m = await openMedia(clip);
      if (st.cur?.id !== id) return;          // chose another while this one loaded
      if (!m) { toast('That clip could not be read', 'warn'); return useBg('original:night'); }
      st.cur.el = m.el;
    }
    if (st.prefs.bg !== id) { st.prefs.bg = id; store.setSharePrefs({ bg: id }); }
    applySound(); paintSound(); paintOut();
    if (!quiet) { paintTab(); }
    restart();
  }
  async function openMedia(clip) {
    if (media.has(clip.id)) return media.get(clip.id);
    const blob = await store.shareClipBlob(clip);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    let node;
    if (clip.kind === 'video') {
      node = document.createElement('video');
      node.muted = true; node.playsInline = true; node.preload = 'auto'; node.src = url;
      const ok = await new Promise(res => {
        const done = v => { node.removeEventListener('loadeddata', yes); node.removeEventListener('error', no); res(v); };
        const yes = () => done(true), no = () => done(false);
        node.addEventListener('loadeddata', yes); node.addEventListener('error', no);
        setTimeout(() => done(node.readyState >= 2), 8000);
      });
      if (!ok) { URL.revokeObjectURL(url); return null; }
    } else {
      node = new Image(); node.src = url;
      try { await node.decode(); } catch { URL.revokeObjectURL(url); return null; }
    }
    const m = { el: node, url, kind: clip.kind, audio: null };
    media.set(clip.id, m);
    return m;
  }
  function pauseAll() { for (const m of media.values()) if (m.kind === 'video') { try { m.el.pause(); } catch { /* fine */ } } }

  /* the clip's sound runs through Web Audio: one branch to the speakers
     (the preview, when asked for), one to the recording */
  function audioFor(m) {
    if (m.audio) return m.audio;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaElementSource(m.el);
      const monitor = audioCtx.createGain(), rec = audioCtx.createGain();
      const dest = audioCtx.createMediaStreamDestination();
      monitor.gain.value = 0; rec.gain.value = 0;
      src.connect(monitor); monitor.connect(audioCtx.destination);
      src.connect(rec); rec.connect(dest);
      m.el.muted = false;
      m.audio = { monitor, rec, dest };
    } catch { m.audio = null; }
    return m.audio;
  }
  function setMonitor(on) {
    st.monitor = on;
    applySound();
    paintSound();
  }
  /* What is heard: the clip on the card, at its level, when the speaker is
     on — and nothing from any other clip. Run on every change of clip, so a
     new clip is heard straight away and an old one never lingers. */
  function applySound() {
    const curId = st.cur?.kind === 'video' ? st.cur.clip.id : null;
    for (const [id, m] of media) {
      if (m.kind !== 'video') continue;
      if (id !== curId) { if (m.audio) m.audio.monitor.gain.value = 0; continue; }
      if (!st.monitor) { if (m.audio) m.audio.monitor.gain.value = 0; continue; }
      const a = audioFor(m);
      if (a) { audioCtx.resume?.(); m.el.muted = false; a.monitor.gain.value = st.cur.clip.sound ?? 0.7; }
    }
  }
  /* Let a clip go entirely: stopped, unhooked, its memory handed back. */
  function dropMedia(id) {
    const m = media.get(id);
    if (!m) return;
    media.delete(id);
    if (m.kind === 'video') {
      try { m.el.pause(); } catch { /* fine */ }
      try { m.audio?.monitor.disconnect(); m.audio?.rec.disconnect(); } catch { /* fine */ }
      m.el.removeAttribute('src'); try { m.el.load(); } catch { /* fine */ }
    }
    try { URL.revokeObjectURL(m.url); } catch { /* fine */ }
  }
  function paintSound() {
    const isVideo = st.cur?.kind === 'video';
    soundBtn.hidden = !isVideo;
    soundBtn.classList.toggle('is-on', st.monitor);
    soundBtn.replaceChildren(icon(st.monitor ? 'volume' : 'mute', 15, 'currentColor', 1.9));
    soundBtn.title = st.monitor ? 'Mute the preview' : 'Hear the clip';
  }

  /* ============================================================
     The preview: drawn every frame while the sheet is open
     ============================================================ */
  /* The clip's own stretch (its trim), and the card's: never shorter than
     the card takes to come in and settle — a short clip loops under it. */
  const clipWin = () => {
    const clip = st.cur?.clip;
    if (clip?.kind !== 'video') return null;
    const a = clip.start || 0;
    return { a, len: Math.max(0.5, Math.min(clip.len || clip.dur || 6, (clip.dur || 999) - a)) };
  };
  const lengthOf = () => {
    const w = clipWin();
    if (w) return Math.max(w.len, MIN_LEN);
    return Math.max(MIN_LEN, Math.min(20, Number(st.prefs.length) || 6));
  };
  function restart() {
    st.t0 = performance.now();
    const w = clipWin();
    if (w && st.cur.el) {
      const v = st.cur.el;
      try { v.currentTime = w.a; } catch { /* fine */ }
      v.play().catch(e => { if (e?.name === 'NotAllowedError') { v.muted = true; v.play().catch(() => {}); } });
    }
  }
  const nowT = () => (performance.now() - st.t0) / 1000;
  /* keep the clip inside its trim while the card plays on */
  function loopClip() {
    const w = clipWin(), v = st.cur?.el;
    if (!w || !v) return;
    if (v.ended || v.currentTime >= w.a + w.len - 0.02) { try { v.currentTime = w.a; } catch { /* fine */ } v.play().catch(() => {}); }
    else if (v.paused && !st.busy) v.play().catch(() => {});
  }
  function size() {
    const [, , w, h] = sizeOf(st.prefs.size);
    const avail = Math.max(240, stage.clientWidth - 28);
    const maxH = Math.max(220, Math.min(460, window.innerHeight * 0.48));
    let cw = avail, ch = cw * h / w;
    if (ch > maxH) { ch = maxH; cw = ch * w / h; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    canvas.style.width = Math.round(cw) + 'px'; canvas.style.height = Math.round(ch) + 'px';
    return { W, H };
  }
  function frame() {
    if (!api.panel.isConnected) return;
    st.raf = requestAnimationFrame(frame);
    if (st.busy === 'gif') return;
    if (st.busy === 'video' && st.rec) {
      const { W, H } = size();
      g.clearRect(0, 0, W, H);
      g.drawImage(st.rec.canvas, 0, 0, W, H);
      return;
    }
    let tt = nowT();
    if (tt >= lengthOf()) { restart(); tt = 0; }
    loopClip();
    const { W, H } = size();
    drawCard(g, W, H, tt, model());
  }

  /* drag the card to move the background */
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    if (!st.cur?.el || st.busy) return;
    drag = { x: e.clientX, y: e.clientY, fx: st.cur.clip.fx ?? 0.5, fy: st.cur.clip.fy ?? 0.5 };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const k = canvas.width / canvas.clientWidth;
    const b = { el: st.cur.el, fx: drag.fx, fy: drag.fy };
    const n = nudgeFocus(b, canvas.width, canvas.height, (e.clientX - drag.x) * k, (e.clientY - drag.y) * k);
    if (n) { st.cur.clip.fx = n.fx; st.cur.clip.fy = n.fy; }
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null; canvas.classList.remove('is-dragging');
    store.updateShareClip(st.cur.clip.id, { fx: st.cur.clip.fx, fy: st.cur.clip.fy });
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  /* ============================================================
     The tabs
     ============================================================ */
  function paintTabs() {
    const glider = el('span', { class: 'sn-glide', 'aria-hidden': 'true' });
    const links = TABS.map(([k, label]) => el('button', { class: 'sn-tab' + (st.tab === k ? ' is-on' : ''), role: 'tab', 'data-tab': k,
      'aria-selected': String(st.tab === k), onClick: () => { if (st.tab !== k) { st.tab = k; lastTab = k; paintTabs(); paintTab(); } } }, label));
    tabsBar.replaceChildren(glider, ...links);
    glide(tabsBar, 'share-tabs', links.find(l => l.classList.contains('is-on')), glider);
  }
  function paintTab() {
    tabBody.replaceChildren(st.tab === 'adjust' ? adjustTab() : st.tab === 'format' ? formatTab() : backgroundTab());
  }
  async function setPref(patch, chart = false) {
    Object.assign(st.prefs, patch);
    if (chart) { rebuildChart(); paintTf(); }
    paintTab();
    restart();
    await store.setSharePrefs(patch);
  }
  const seg = (key, options, { onPick, disabled } = {}) => el('div', { class: 'sh-seg' + (disabled ? ' is-dim' : ''), 'data-pref': key },
    ...options.map(([k, label, extra]) => el('button', { class: st.prefs[key] === k ? 'is-on' : '', 'data-v': k, disabled: !!disabled,
      onClick: () => { if (st.prefs[key] !== k) (onPick ? onPick(k) : setPref({ [key]: k })); } }, extra || null, label)));
  const row = (label, control, note) => el('div', { class: 'sh-row' },
    el('div', { class: 'sh-k' }, label, note ? el('span', {}, note) : null), control);

  /* ---------- Background ---------- */
  function backgroundTab() {
    const clips = store.share.clips;
    const pick = id => { if (st.prefs.bg !== id) useBg(id); };
    const file = el('input', { type: 'file', accept: 'video/*,image/*', multiple: true, hidden: true,
      onChange: e => { const fs = [...e.target.files]; e.target.value = ''; addFiles(fs); } });
    const tile = (id, name, thumb, extra) => el('button', { class: 'sh-tile' + (st.prefs.bg === id ? ' is-on' : ''), 'data-bg': id, title: name,
        style: thumb ? { backgroundImage: `url("${thumb}")` } : null, onClick: () => pick(id) },
      el('span', { class: 'sh-tn' }, name), extra || null);
    const yours = clips.map(cl => tile(cl.id, cl.name, cl.thumb,
      cl.kind === 'video' ? el('span', { class: 'sh-tdur' }, secs(cl.dur)) : null));
    const add = el('button', { class: 'sh-tile sh-add', onClick: () => file.click() }, icon('plus', 16, 'currentColor', 2), el('span', {}, 'Add video or picture'));
    const originals = ORIGINALS.map(([k, name]) => tile('original:' + k, name, originalThumb(k, store.colours, tone)));
    const builtins = store.builtinClips.map(cl => tile(cl.id, cl.name, cl.thumb, el('span', { class: 'sh-tdur' }, secs(cl.dur))));
    const on = store.share.clips.find(x => x.id === st.prefs.bg);    // only your own can be removed
    return el('div', { class: 'sh-pane' },
      el('div', { class: 'sh-sec' }, el('h3', {}, 'Yours'),
        el('p', {}, clips.length ? 'Kept in your journal folder, so they go wherever it goes.' : 'Your own clips and pictures — they stay in your journal folder.')),
      el('div', { class: 'sh-grid' }, ...yours, add, file),
      on ? el('div', { class: 'sh-under' },
        el('span', {}, on.name),
        confirmButton({ label: 'Remove', armedLabel: 'Remove it', className: 'btn btn-ghost sh-remove', armedClassName: 'btn btn-ghost is-armed sh-remove',
          onConfirm: async () => {
            /* off the card first, so the preview cannot start it again while it is being removed */
            if (st.cur?.id === on.id) st.cur = { id: 'night', kind: 'original' };
            dropMedia(on.id); paintSound();
            await store.removeShareClip(on.id);
            st.prefs.bg = store.share.prefs.bg; await useBg(st.prefs.bg); paintTab(); toast('Removed');
          } })) : null,
      builtins.length ? el('div', { class: 'sh-sec' }, el('h3', {}, 'With sound'), el('p', {}, 'Your clips, cut clean — they come with Laminar.')) : null,
      builtins.length ? el('div', { class: 'sh-grid', 'data-grid': 'builtin' }, ...builtins) : null,
      el('div', { class: 'sh-sec' }, el('h3', {}, 'Laminar'), el('p', {}, 'Drawn here, moving, no files.')),
      el('div', { class: 'sh-grid' }, ...originals));
  }
  async function addFiles(files) {
    let last = null;
    for (const f of files) {
      const kind = /^image\//.test(f.type) ? 'image' : /^video\//.test(f.type) ? 'video' : null;
      if (!kind) { toast(`${f.name} is not a video or a picture`, 'warn'); continue; }
      if (f.size > MAX_CLIP) { toast(`${f.name} is over 80 MB — trim it first`, 'warn'); continue; }
      toast(`Adding ${f.name}…`);
      try {
        let blob = f, type = f.type, ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase();
        if (kind === 'image' && type !== 'image/gif') { const p = await prepareImage(f); blob = p.blob; type = 'image/jpeg'; ext = 'jpg'; }
        const info = kind === 'video' ? await probeVideo(blob) : await probeImage(blob);
        if (!info) { toast(`${f.name} could not be played here`, 'warn'); continue; }
        last = await store.addShareClip(blob, { name: nameFrom(f.name), kind, type, ext, dur: info.dur, thumb: info.thumb });
      } catch (e) { toast(`${f.name}: ${e.message || 'could not be added'}`, 'warn'); }
    }
    if (last) { toast('Added'); await useBg(last.id); }
    paintTab();
  }

  /* ---------- Adjust ---------- */
  function adjustTab() {
    const clip = st.cur?.clip;
    if (!clip) {
      return el('div', { class: 'sh-pane' },
        row('Length', slider(5, 20, 0.5, Number(st.prefs.length) || 6, v => `${v.toFixed(1)}s`, v => { st.prefs.length = v; }, v => setPref({ length: v })),
          'how long the video runs'),
        el('p', { class: 'sh-hint' }, 'Add a clip of your own on Background to trim it, move it and use its sound.'));
    }
    const save = patch => store.updateShareClip(clip.id, patch);
    const parts = [];
    if (clip.kind === 'video') {
      const dur = clip.dur || 0, whole = !(clip.start > 0) && Math.abs((clip.len || dur) - dur) < 0.05;
      parts.push(row('Trim', trimmer(clip), whole ? 'the whole clip' : null));
      if (!whole) parts.push(row('', el('button', { class: 'btn btn-quiet sh-whole', onClick: () => {
        clip.start = 0; clip.len = dur; save({ start: 0, len: dur }); paintTab(); restart();
      } }, 'Use the whole clip')));
    }
    else parts.push(row('Length', slider(5, 20, 0.5, Number(st.prefs.length) || 6, v => `${v.toFixed(1)}s`, v => { st.prefs.length = v; }, v => setPref({ length: v })), 'how long the video runs'));
    parts.push(row('Position', el('div', { class: 'sh-posrow' },
      el('span', {}, 'Drag the card to move the background.'),
      el('button', { class: 'btn btn-quiet sh-center', onClick: () => { clip.fx = 0.5; clip.fy = 0.5; save({ fx: 0.5, fy: 0.5 }); } }, 'Center'))));
    parts.push(row('Dim', slider(0, 0.85, 0.01, clip.dim ?? 0.25, v => `${Math.round(v * 100)}%`, v => { clip.dim = v; }, v => save({ dim: v }))));
    if (clip.kind === 'video') parts.push(row('Sound', slider(0, 1, 0.01, clip.sound ?? 0.7, v => `${Math.round(v * 100)}%`,
      v => { clip.sound = v; if (st.monitor) setMonitor(true); }, v => save({ sound: v }))));
    return el('div', { class: 'sh-pane' }, ...parts);
  }
  function slider(min, max, step, value, label, onInput, onDone) {
    const out = el('span', { class: 'sh-val' }, label(value));
    const input = el('input', { type: 'range', min, max, step, value, class: 'sh-range',
      onInput: e => { const v = Number(e.target.value); out.textContent = label(v); paintRange(e.target); onInput(v); },
      onChange: e => onDone(Number(e.target.value)) });
    paintRange(input);
    return el('div', { class: 'sh-slider' }, input, out);
  }
  function paintRange(input) {
    const p = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
    input.style.setProperty('--p', p + '%');
  }

  /* a strip of the clip with a window over it: drag the window, or its ends */
  function trimmer(clip) {
    const dur = Math.max(0.5, clip.dur || 1);
    const strip = el('div', { class: 'sh-strip' });
    const win = el('div', { class: 'sh-win' }, el('i', { class: 'sh-h is-a' }), el('i', { class: 'sh-h is-z' }));
    const label = el('div', { class: 'sh-trimk' });
    const box = el('div', { class: 'sh-trim' }, strip, win);
    const paint = () => {
      const a = clip.start || 0, len = Math.min(clip.len || dur, dur - a);
      win.style.left = (a / dur * 100) + '%';
      win.style.width = (len / dur * 100) + '%';
      label.textContent = `${clock(a)} to ${clock(a + len)} · ${len.toFixed(1)}s${len < MIN_LEN - 0.05 ? ' · loops under the card' : ''}`;
    };
    paint();
    filmstrip(clip).then(imgs => { if (imgs.length) strip.replaceChildren(...imgs.map(src => el('span', { style: { backgroundImage: `url("${src}")` } }))); });
    let d = null;
    box.addEventListener('pointerdown', e => {
      const r = box.getBoundingClientRect();
      const h = e.target.closest('.sh-h');
      d = { r, x: e.clientX, a: clip.start || 0, len: Math.min(clip.len || dur, dur - (clip.start || 0)),
            mode: h ? (h.classList.contains('is-a') ? 'a' : 'z') : 'move' };
      if (!h && !e.target.closest('.sh-win')) {           // a press outside the window moves it there
        const at = (e.clientX - r.left) / r.width * dur;
        d.a = Math.max(0, Math.min(dur - d.len, at - d.len / 2));
        clip.start = d.a; paint();
      }
      box.setPointerCapture(e.pointerId);
    });
    box.addEventListener('pointermove', e => {
      if (!d) return;
      const dt = (e.clientX - d.x) / d.r.width * dur;
      if (d.mode === 'move') { clip.start = Math.max(0, Math.min(dur - d.len, d.a + dt)); clip.len = d.len; }
      else if (d.mode === 'a') {
        const a = Math.max(0, Math.min(d.a + d.len - 1, d.a + dt));
        clip.start = a; clip.len = d.a + d.len - a;
      } else clip.len = Math.max(1, Math.min(dur - d.a, d.len + dt));
      paint();
    });
    const end = () => { if (!d) return; d = null; store.updateShareClip(clip.id, { start: clip.start, len: clip.len }); restart(); };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    return el('div', { class: 'sh-trimwrap' }, box, label);
  }
  async function filmstrip(clip) {
    if (st.strip.has(clip.id)) return st.strip.get(clip.id);
    const blob = await store.shareClipBlob(clip);
    if (!blob) return [];
    const imgs = await stills(blob, 8, 96, 54);
    st.strip.set(clip.id, imgs);
    return imgs;
  }

  /* ---------- Format ---------- */
  function formatTab() {
    const p = st.prefs;
    const sizeIcon = k => { const [, , w, h] = sizeOf(k); const m = 14 / Math.max(w, h); return el('i', { class: 'sh-sz', style: { width: Math.round(w * m) + 'px', height: Math.round(h * m) + 'px' } }); };
    return el('div', { class: 'sh-pane' },
      row('Show', seg('unit', [['$', '$'], ['%', '%'], ['R', 'R']])),
      row('Style', seg(styleKey(), [['candles', 'Candles'], ['line', 'Line'], ['none', 'No chart'], ['pnl', 'P&L only']]), onVideo() ? 'on a video' : ''),
      row('Candles', seg('candles', [['colour', 'Colour'], ['white', 'White']], { disabled: styleNow() !== 'candles' })),
      row('Figure', seg('figure', [['white', 'White'], ['colour', 'Win / loss colour']])),
      row('Numbers', seg('stats', [['plain', 'Plain'], ['boxed', 'Boxed'], ['hidden', 'Hidden']], { disabled: styleNow() === 'pnl' })),
      row('Corners', seg('corners', [['rounded', 'Rounded'], ['straight', 'Straight']])),
      row('Size', seg('size', SIZES.map(([k, label]) => [k, label, sizeIcon(k)])), sizeHint(p.size)),
      row('Quality', seg('quality', QUALITIES.map(([k, label]) => [k, label])), (() => { const px = pixelsFor(p.size, p.quality); return `${px.w} × ${px.h}`; })()));
  }
  const sizeHint = k => ({ landscape: 'best for X and Discord', portrait: 'stories and reels', wide: 'YouTube', square: 'feeds', tall: 'Instagram' }[k] || '');

  /* ============================================================
     Out: video, GIF, photo
     ============================================================ */
  function paintOut() {
    const label = (k, ic, text) => {
      const b = outBtns[k];
      const busy = st.busy === k;
      b.disabled = !!st.busy && !busy;
      b.classList.toggle('is-busy', busy);
      b.style.setProperty('--p', Math.round(st.progress * 100) + '%');
      const words = busy ? (k === 'photo' ? 'Saving…' : `Making ${Math.round(st.progress * 100)}%`) : text;
      const loud = k === 'video' && !busy && st.cur?.kind === 'video' && (st.cur.clip.sound ?? 0.7) > 0;
      const key = `${busy}|${words}|${loud}|${b.disabled}`;
      if (b.__key === key) return;
      b.__key = key;
      b.replaceChildren(...[icon(busy ? 'close' : ic, 15, 'currentColor', 1.9), el('span', {}, words),
        loud ? icon('volume', 13, 'currentColor', 1.8) : null].filter(Boolean));
      b.title = busy ? 'Stop' : '';
    };
    label('video', 'film', 'Video'); label('gif', 'gif', 'GIF'); label('photo', 'download', 'Photo');
    replayBtn.disabled = !!st.busy;
  }
  async function out(kind) {
    if (st.busy) { if (st.busy === kind) st.stop = true; return; }
    st.busy = kind; st.progress = 0; st.stop = false; paintOut();
    try {
      if (kind === 'video') await makeVideo();
      else if (kind === 'gif') await makeGif();
      else await makePhoto();
    } catch (e) {
      toast(e?.message || 'That did not work', 'warn');
    } finally {
      st.busy = null; st.rec = null; st.progress = 0; paintOut(); restart();
    }
  }
  const baseName = () => `${String(trade.pair || 'trade').replace(/[^\w-]+/g, '')}-${trade.date}`;

  async function makePhoto() {
    const { w, h } = pixelsFor(st.prefs.size, st.prefs.quality);
    const cv = el('canvas', { width: w, height: h });
    drawCard(cv.getContext('2d'), w, h, Infinity, model());
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('The picture could not be made');
    await saveOut(blob, `${baseName()}.png`, 'Picture', 'png');
  }

  /* Frame by frame through the H.264 encoder where the window has one —
     smooth whatever the computer is doing; recorded as it plays where not. */
  async function makeVideo() {
    if (canEncode()) {
      const { w, h } = pixelsFor(st.prefs.size, st.prefs.quality);
      const cv = el('canvas', { width: w, height: h });
      const cg = cv.getContext('2d');
      const clip = st.cur?.clip;
      const m = clip?.kind === 'video' ? media.get(clip.id) : null;
      if (m) m.el.pause();
      const L = lengthOf();
      st.rec = { canvas: cv };
      if (m?.audio) m.audio.monitor.gain.value = 0;
      const blob = await encodeMp4({
        w, h, length: L, fps: 30, big: st.prefs.quality === '4k',
        frame: async tt => { drawCard(cg, w, h, tt, model()); return cv; },
        drive: m ? (each, total) => playFrames(m.el, clipWin(), total, 30, each) : null,
        sound: m && (clip.sound ?? 0.7) > 0 ? { blob: await store.shareClipBlob(clip), start: clipWin().a, len: clipWin().len, gain: clip.sound ?? 0.7 } : null,
        progress: p => { st.progress = p; paintOut(); },
        stopped: () => st.stop || !api.panel.isConnected,
      }).catch(() => null);
      if (st.stop || !api.panel.isConnected) { if (api.panel.isConnected) toast('Stopped'); return; }
      if (blob) { await saveOut(blob, `${baseName()}.mp4`, 'Video', 'mp4'); return; }
      st.rec = null; st.progress = 0;
    }
    await recordVideo();
  }

  async function recordVideo() {
    if (typeof MediaRecorder === 'undefined') throw new Error('This window cannot record video');
    const { w, h } = pixelsFor(st.prefs.size, st.prefs.quality);
    const cv = el('canvas', { width: w, height: h });
    const cg = cv.getContext('2d');
    drawCard(cg, w, h, 0, model());
    const stream = cv.captureStream(30);
    const clip = st.cur?.clip;
    const m = clip?.kind === 'video' ? media.get(clip.id) : null;
    let withSound = false;
    if (m && (clip.sound ?? 0.7) > 0) {
      const a = audioFor(m);
      if (a) {
        await audioCtx.resume?.();
        a.rec.gain.value = clip.sound ?? 0.7;
        const track = a.dest.stream.getAudioTracks()[0];
        if (track) { stream.addTrack(track); withSound = true; }
      }
    }
    const type = pickType(withSound, st.prefs.quality === '4k');
    const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}),
      videoBitsPerSecond: st.prefs.quality === '4k' ? 40e6 : 12e6, audioBitsPerSecond: 192000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(res => { rec.onstop = res; });
    const L = lengthOf();
    st.rec = { canvas: cv };
    /* start the clip from its trim, then record as it plays */
    if (m) {
      m.el.pause();
      await seek(m.el, clip.start || 0);
      await m.el.play().catch(() => { m.el.muted = true; return m.el.play(); });
    }
    const start = performance.now();
    rec.start(200);
    await new Promise(res => {
      const step = () => {
        const tt = (performance.now() - start) / 1000;
        loopClip();
        drawCard(cg, w, h, tt, model());
        st.progress = Math.min(1, tt / L);
        paintOut();
        if (tt >= L || st.stop || !api.panel.isConnected) return res();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    rec.stop();
    await stopped;
    if (m?.audio) m.audio.rec.gain.value = 0;
    stream.getVideoTracks().forEach(tr => tr.stop());
    if (st.stop && api.panel.isConnected) { toast('Stopped'); return; }
    if (!api.panel.isConnected) return;
    const blob = new Blob(chunks, { type: (rec.mimeType || type || 'video/webm').split(';')[0] });
    if (!blob.size) throw new Error('Nothing was recorded');
    const ext = /mp4/.test(blob.type) ? 'mp4' : 'webm';
    await saveOut(blob, `${baseName()}.${ext}`, 'Video', ext);
  }

  async function makeGif() {
    const [, , bw, bh] = sizeOf(st.prefs.size);
    const k = 720 / Math.max(bw, bh);
    const w = Math.round(bw * k / 2) * 2, h = Math.round(bh * k / 2) * 2;
    const cv = el('canvas', { width: w, height: h });
    const cg = cv.getContext('2d', { willReadFrequently: true });
    const fps = 15, L = Math.min(lengthOf(), ANIM + 1.8);
    const n = Math.max(2, Math.round(L * fps));
    const gw = gifWriter(w, h, { delay: Math.round(100 / fps) });
    const clip = st.cur?.clip;
    const m = clip?.kind === 'video' ? media.get(clip.id) : null;
    if (m?.audio) m.audio.monitor.gain.value = 0;
    let i = 0;
    const STOP = new Error('stopped');
    const each = async tt => {
      if (st.stop || !api.panel.isConnected) throw STOP;
      drawCard(cg, w, h, tt, model());
      gw.add(cg.getImageData(0, 0, w, h).data);
      i++; st.progress = i / n; paintOut();
      g.drawImage(cv, 0, 0, canvas.width, canvas.height);
      await new Promise(res => setTimeout(res, 0));
    };
    try {
      if (m) await playFrames(m.el, clipWin(), n, fps, each);
      else for (let k = 0; k < n; k++) await each(k / fps);
    } catch (e) { if (e !== STOP) throw e; }
    if (st.stop) { if (api.panel.isConnected) toast('Stopped'); return; }
    if (!api.panel.isConnected) return;
    await saveOut(new Blob([gw.finish()], { type: 'image/gif' }), `${baseName()}.gif`, 'GIF', 'gif');
  }

  /* ---------- start ---------- */
  paintTabs(); paintTab(); paintTf(); paintOut(); paintSound();
  loadAssets(trade.pair).then(a => { st.assets = a; });
  useBg(st.prefs.bg, { quiet: true }).then(() => paintTab());
  loadChart();
  st.raf = requestAnimationFrame(frame);
  api.__share = {
    get state() { return { load: st.load, tf: tfMinutes(), bars: st.chart?.bars.length || 0, bg: st.prefs.bg, busy: st.busy, prefs: { ...st.prefs }, length: lengthOf() }; },
    model, restart, useBg, addFiles, setMonitor,
    /* what is heard, for the tests: each clip open here, playing or not, and at what level */
    get sound() {
      return { monitor: st.monitor, on: st.cur?.id || null,
        clips: [...media].filter(([, m]) => m.kind === 'video').map(([id, m]) => ({ id, playing: !m.el.paused, muted: m.el.muted,
          gain: m.audio ? m.audio.monitor.gain.value : 0 })) };
    },
  };
  body.__share = api.__share;
  return api;
}

/* ============================================================
   Helpers
   ============================================================ */
/* MP4 where the window can write it (H.264 with AAC, or Opus where AAC is
   not on offer), WebM where it cannot. 4K needs a higher H.264 level. */
function pickType(sound, big) {
  const vids = big ? ['avc1.640033', 'avc1.4D4033', 'avc1'] : ['avc1.640028', 'avc1.4D4028', 'avc1'];
  const auds = sound ? ['mp4a.40.2', 'opus'] : [''];
  const list = [];
  for (const au of auds) for (const vc of vids) list.push(`video/mp4;codecs=${vc}${au ? ',' + au : ''}`);
  list.push('video/mp4', sound ? 'video/webm;codecs=vp9,opus' : 'video/webm;codecs=vp9', sound ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8', 'video/webm');
  return list.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || '';
}

/* Every frame of a clip, in order, without seeking to each one (a seek
   decodes from the last keyframe, which on a phone clip can be seconds
   back). The clip plays; each frame it shows is caught as it is shown, the
   clip waits while that frame is drawn and encoded, and goes on. If the
   clip stops showing frames, the rest are reached by seeking after all. */
async function playFrames(v, win, total, fps, each) {
  const { a: start, len } = win;
  let next = 0, base = 0;          // base: where the card was when this pass through the clip began
  await seek(v, start);
  const rate = v.playbackRate;
  /* at half speed every frame is shown long enough to be caught */
  v.playbackRate = 0.5;
  if (typeof v.requestVideoFrameCallback === 'function') {
    await new Promise((resolve, reject) => {
      let done = false, dog = 0;
      const end = err => { if (done) return; done = true; clearTimeout(dog); v.pause(); err ? reject(err) : resolve(); };
      const watch = () => { clearTimeout(dog); dog = setTimeout(() => end(), 2500); };
      const step = async (_now, meta) => {
        if (done) return;
        v.pause();
        const mt = (meta?.mediaTime ?? v.currentTime) - start;
        try {
          while (next < total && next / fps - base <= mt + 0.5 / fps) { await each(next / fps); next++; }
        } catch (e) { return end(e); }
        if (next >= total) return end();
        if (v.ended || mt >= len - 1 / fps) { base += len; await seek(v, start); }
        v.requestVideoFrameCallback(step); watch();
        v.play().catch(() => end());
      };
      v.requestVideoFrameCallback(step); watch();
      v.play().catch(() => end());
    });
  }
  v.playbackRate = rate;
  for (; next < total; next++) { await seek(v, start + ((next / fps) % len)); await each(next / fps); }
}


/** Save a file the way the app can: the desktop app asks where, a browser downloads it. */
async function saveOut(blob, name, label, ext) {
  if (isTauri() && window.__TAURI__?.dialog?.save) {
    try {
      const path = await window.__TAURI__.dialog.save({ defaultPath: name, filters: [{ name: label, extensions: [ext] }] });
      if (!path) return false;
      await window.__TAURI__.core.invoke('write_image', { path, data: await toBase64(blob) });
      toast(`Saved ${String(path).split(/[\\/]/).pop()}`);
      return true;
    } catch { /* an older desktop build: download it instead */ }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(`Saved ${name}`);
  return true;
}
function toBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

const secs = d => (d ? `${Math.round(d)}s` : '');
const clock = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
