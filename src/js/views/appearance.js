/* ============================================================
   appearance.js — the Appearance sheet.

   Everything about how Laminar looks, in one place, laid out in four tabs:
   Themes (the frame, page and cards, your saved looks, day and night),
   Colours (accent, text tone, lines, typeface), Custom (the video behind
   it all, glass, motion, the colours of your setups) and Money (what a win,
   a loss and a scratch are drawn in, and the guardrails).

   Every change is applied the moment it is made and kept in an undo trail
   for as long as the sheet is open. Nothing here is a draft: close the sheet
   and the look is the one you left it on.
   ============================================================ */
import { el, icon, toast, confirmButton } from '../ui.js';
import * as c from '../calc.js';
import { sheet } from '../sheet.js';
import { BACKGROUNDS, findBackground } from '../backgrounds.js';
import { probeVideo, nameFrom } from '../clip.js';
import { playable } from '../store.js';
import { glide } from '../shell.js';
import {
  THEMES, themeOf, ACCENTS, TONES, LINES, FONTS, fontOf, MOTIONS,
  tokensFor, swatchesOf, describeLook, isHex, inkFor,
} from '../look.js';

/* One palette for money colours. Any colour may be a win and any a loss —
   a red profit is your call. White and Black keep their old values so a
   colour saved before this sheet existed still finds its name. */
export const PALETTE = [
  ['Greens',  [['#34D399', 'Mint'], ['#22C55E', 'Bright green'], ['#18AC65', 'Green'], ['#00C48C', 'Emerald'],
               ['#84CC16', 'Lime'], ['#8FB996', 'Sage'], ['#6B8E23', 'Olive'], ['#15803D', 'Forest']]],
  ['Blues',   [['#2DD4BF', 'Aqua'], ['#0EA5A5', 'Teal'], ['#0F766E', 'Sea'], ['#06B6D4', 'Cyan'],
               ['#38BDF8', 'Sky'], ['#0988F0', 'Blue'], ['#2563EB', 'Royal'], ['#3B82F6', 'Cornflower'], ['#1E3A8A', 'Navy']]],
  ['Purples', [['#A78BFA', 'Lavender'], ['#7C5CFF', 'Purple'], ['#4F46E5', 'Indigo'], ['#6D28D9', 'Grape'],
               ['#A855F7', 'Violet'], ['#7E22CE', 'Plum'], ['#D946EF', 'Orchid'], ['#C084FC', 'Lilac']]],
  ['Pinks',   [['#F9A8D4', 'Blush'], ['#FB7185', 'Pink'], ['#EC4899', 'Hot pink'], ['#DB2777', 'Magenta'],
               ['#F43F5E', 'Rose'], ['#BE185D', 'Berry']]],
  ['Reds',    [['#FA8072', 'Salmon'], ['#F4624A', 'Coral'], ['#E5342B', 'Red'], ['#DC143C', 'Crimson'],
               ['#B3261E', 'Deep red'], ['#7F1D1D', 'Maroon']]],
  ['Oranges', [['#FDBA74', 'Peach'], ['#FB923C', 'Tangerine'], ['#F97316', 'Orange'], ['#C2410C', 'Rust'],
               ['#F59E0B', 'Amber'], ['#FFB800', 'Yellow'], ['#FDE047', 'Lemon'], ['#EAB308', 'Gold'], ['#CA8A04', 'Mustard']]],
  ['Browns',  [['#D2B48C', 'Tan'], ['#C2B280', 'Sand'], ['#A47148', 'Caramel'], ['#8C5A3C', 'Brown'], ['#5C3A21', 'Chocolate']]],
  ['Greys',   [['#F5F5F5', 'Snow'], ['#E9E9E9', 'White'], ['#D4D4D4', 'Silver'], ['#B0B0B0', 'Light grey'],
               ['#A8A29E', 'Warm grey'], ['#94A3B8', 'Cool grey'], ['#9A9A9A', 'Grey'], ['#888686', 'Ash'], ['#7A7A7A', 'Mid grey'],
               ['#64748B', 'Slate'], ['#5A5A5A', 'Steel'], ['#4A4A4A', 'Graphite'], ['#3D3D3D', 'Black'], ['#1F1F1F', 'Jet'], ['#000000', 'Ink']]],
];
export const nameOfColour = hex => PALETTE.flatMap(([, xs]) => xs).find(([h]) => h.toLowerCase() === String(hex).toLowerCase())?.[1];

/* Three sets of money colours worth one click. */
const MONEY_PRESETS = [
  ['Classic', { profit: '#18AC65', loss: '#F4624A', flat: '' }],
  ['Mono', { profit: '#000000', loss: '#888686', flat: '#3B82F6' }],
  ['Colour-blind safe', { profit: '#2563EB', loss: '#F97316', flat: '' }],
];

const TABS = [['themes', 'Themes'], ['colours', 'Colours'], ['custom', 'Custom'], ['money', 'Money']];
let lastTab = 'themes';

/* ============================================================ */
export function openAppearance(store, nav, { tab } = {}) {
  const st = { tab: tab || lastTab, past: [], future: [], naming: false, menu: null };
  const body = el('div', { class: 'lk' });
  let refreshTimer;
  const refreshApp = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => nav.refresh(), 140); };

  /* Every change goes through here: remember the look before it, make it,
     redraw. An origin (the click) makes a theme change spread from where you
     clicked, where the browser can. */
  async function change(fn, origin) {
    st.past.push(store.snapshotLook());
    if (st.past.length > 40) st.past.shift();
    st.future = [];
    await reveal(origin, fn);
    paint(); refreshApp();
  }
  async function travel(from, to) {
    if (!from.length) return;
    to.push(store.snapshotLook());
    const snap = from.pop();
    await reveal(null, () => store.restoreLook(snap));
    paint(); refreshApp();
  }

  function paint() {
    const look = store.look;
    const scroller = body.querySelector('.lk-scroll');
    const y = scroller ? scroller.scrollTop : 0;
    body.replaceChildren(
      hero(store, look),
      el('button', { class: 'sheet-x lk-close', 'aria-label': 'Close', title: 'Close', onClick: () => api?.close() },
        icon('close', 14, 'currentColor', 2)),
      el('div', { class: 'lk-scroll' },
        el('div', { class: 'lk-top' },
          el('h2', { class: 'lk-title' }, TABS.find(([k]) => k === st.tab)[1]),
          el('div', { class: 'lk-sub' }, describeLook(look)),
          el('div', { class: 'lk-actions' },
            el('button', { class: 'lk-icon', title: 'Undo', 'aria-label': 'Undo', disabled: !st.past.length,
              onClick: () => travel(st.past, st.future) }, icon('undo', 15, 'currentColor', 1.8)),
            el('button', { class: 'lk-icon', title: 'Redo', 'aria-label': 'Redo', disabled: !st.future.length,
              onClick: () => travel(st.future, st.past) }, icon('redo', 15, 'currentColor', 1.8)),
            st.naming ? nameField() : el('button', { class: 'btn btn-primary lk-save', onClick: () => { st.naming = true; paint(); body.querySelector('.lk-name input')?.focus(); } },
              icon('bookmark', 14, 'currentColor', 1.8), 'Save this look')),
          tabsRow()),
        el('div', { class: 'lk-body', 'data-tab': st.tab },
          st.tab === 'themes' ? themesTab() : st.tab === 'colours' ? coloursTab()
          : st.tab === 'custom' ? customTab() : moneyTab()),
        el('div', { class: 'lk-foot' },
          el('span', {}, `${themeOf(look.theme).name} theme`),
          el('button', { class: 'lk-reset', onClick: e => change(() => store.resetLook(), e) },
            icon('refresh', 13, 'currentColor', 1.8), 'Reset to default'))));
    const sc = body.querySelector('.lk-scroll');
    if (sc) sc.scrollTop = y;
  }

  function nameField() {
    const input = el('input', { class: 'field', placeholder: 'Name this look', maxLength: 40,
      onKeydown: e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { e.stopPropagation(); st.naming = false; paint(); } } });
    async function commitName() {
      const v = input.value.trim() || `Look ${store.savedLooks.length + 1}`;
      await store.saveLook(v);
      st.naming = false; toast(`Saved “${v}”`); paint();
    }
    return el('div', { class: 'lk-name' }, input,
      el('button', { class: 'btn btn-primary', onClick: commitName }, 'Save'),
      el('button', { class: 'btn btn-quiet', onClick: () => { st.naming = false; paint(); } }, 'Cancel'));
  }

  function tabsRow() {
    const glider = el('span', { class: 'sn-glide', 'aria-hidden': 'true' });
    const links = TABS.map(([k, label]) => el('button', { class: 'sn-tab' + (st.tab === k ? ' is-on' : ''), role: 'tab',
      'aria-selected': String(st.tab === k), 'data-tab': k,
      onClick: () => { if (st.tab !== k) { st.tab = k; lastTab = k; paint(); body.querySelector('.lk-scroll').scrollTop = 0; } } }, label));
    const bar = el('div', { class: 'subnav lk-tabs', role: 'tablist' }, glider, ...links);
    glide(bar, 'look-tabs', links.find(l => l.classList.contains('is-on')), glider);
    return bar;
  }

  /* ---------------- Themes ---------------- */
  function themesTab() {
    const look = store.look;
    const cards = THEMES.map(th => {
      const on = look.theme === th.id;
      return el('button', { class: 'lk-theme' + (on ? ' is-on' : ''), 'data-theme-id': th.id, 'aria-pressed': String(on),
          onClick: e => { if (!on) change(() => store.setLook({ theme: th.id }), e); } },
        miniApp({ ...look, theme: th.id }, store),
        el('div', { class: 'lk-theme-t' },
          el('div', {}, el('div', { class: 'lk-theme-n' }, th.name), el('div', { class: 'lk-theme-d' }, th.note)),
          on ? el('span', { class: 'lk-check' }, icon('check', 12, 'currentColor', 2.6)) : null));
    });

    const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true,
      onChange: async e => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        try { const got = await store.importLook(JSON.parse(await f.text())); toast(`Imported “${got.name}”`); paint(); }
        catch (err) { toast(err.message || 'That file could not be read', 'bad'); }
      } });

    const saved = store.savedLooks;
    const sch = store.lookSchedule;
    const lookPick = (which) => el('select', { class: 'field lk-select', 'aria-label': which === 'day' ? 'Day look' : 'Night look',
        onChange: e => change(() => store.setLookSchedule({ [which]: e.target.value })) },
      el('option', { value: '' }, 'Choose a look'),
      ...saved.map(s => el('option', { value: s.id, selected: sch[which] === s.id }, s.name)));
    const timeIn = (which) => el('input', { type: 'time', class: 'field lk-time', value: sch[which + 'At'],
      'aria-label': which === 'day' ? 'Day starts' : 'Night starts',
      onChange: e => change(() => store.setLookSchedule({ [which + 'At']: e.target.value || (which === 'day' ? '07:00' : '19:00') })) });

    return el('div', {},
      el('div', { class: 'lk-themes' }, ...cards),

      section('Your looks', 'Saves the theme, the accent, the money colours and the background together.',
        el('div', { class: 'lk-row-btns' },
          el('button', { class: 'btn btn-quiet', onClick: () => file.click() }, icon('upload', 13, 'currentColor', 1.8), 'Import look'),
          el('button', { class: 'btn btn-quiet', onClick: () => { st.naming = true; paint(); body.querySelector('.lk-name input')?.focus(); } },
            icon('bookmark', 13, 'currentColor', 1.8), 'Save this look'), file),
        saved.length
          ? el('div', { class: 'lk-saved' }, ...saved.map(s => savedRow(s)))
          : el('div', { class: 'lk-empty' }, 'Nothing saved yet. Set a theme and colours you like, then save them here.')),

      section('Day and night', 'Your day look and your night look switch by themselves at the hours you set.',
        el('div', { class: 'lk-card' },
          toggleRow('Follow the clock', sch.on, v => {
            if (v && (!sch.day || !sch.night)) return toast('Choose a day look and a night look first', 'warn');
            change(() => store.setLookSchedule({ on: v }));
          }),
          saved.length < 1
            ? el('div', { class: 'lk-note' }, 'Save a look or two first — one for the day, one for the night.')
            : el('div', { class: 'lk-dn' },
                el('div', { class: 'lk-dn-col' }, el('span', { class: 'lk-dn-k' }, icon('sun', 14, 'currentColor', 1.8), 'Day from'), timeIn('day'), lookPick('day')),
                el('div', { class: 'lk-dn-col' }, el('span', { class: 'lk-dn-k' }, icon('moon', 14, 'currentColor', 1.8), 'Night from'), timeIn('night'), lookPick('night'))))));
  }

  function savedRow(s) {
    const sw = swatchesOf(s.look);
    let armed = false;
    const del = el('button', { class: 'lk-mini', title: 'Delete this look', onClick: async () => {
      if (!armed) { armed = true; del.classList.add('is-armed'); del.textContent = 'Delete?'; setTimeout(() => { if (del.isConnected) { armed = false; del.classList.remove('is-armed'); del.replaceChildren(icon('trash', 13, 'currentColor', 1.8)); } }, 3000); return; }
      await store.deleteLook(s.id); paint(); refreshApp();
    } }, icon('trash', 13, 'currentColor', 1.8));
    return el('div', { class: 'lk-saved-row' },
      el('span', { class: 'lk-strip' }, ...sw.slice(0, 5).map(h => el('i', { style: { background: h } }))),
      el('span', { class: 'lk-saved-n' }, s.name, el('span', { class: 'lk-saved-d' }, describeLook(s.look))),
      el('button', { class: 'lk-mini', title: 'Download as a file', onClick: () => download(s) }, icon('download', 13, 'currentColor', 1.8)),
      del,
      el('button', { class: 'btn btn-quiet lk-apply', onClick: e => change(() => store.restoreLook(s), e) }, 'Wear'));
  }

  /* ---------------- Colours ---------------- */
  function coloursTab() {
    const look = store.look;
    const th = themeOf(look.theme);
    const custom = (val, onPick, label) => {
      const input = el('input', { type: 'color', value: val, 'aria-label': label,
        onChange: e => onPick(e.target.value.toUpperCase()) });
      return input;
    };

    const accents = el('div', { class: 'lk-accents' }, ...ACCENTS.map(([k, name, hex]) => {
      const on = look.accent === k;
      const fill = k === 'mono' ? (th.paper ? tokensFor(look)['--ink'] : '#F4F4F6') : k === 'custom' ? null : hex;
      if (k === 'custom') {
        const pick = custom(look.accentCustom, v => change(() => store.setLook({ accent: 'custom', accentCustom: v })), 'Your own accent');
        return el('label', { class: 'lk-dot is-rainbow' + (on ? ' is-on' : ''), title: name },
          pick, on ? el('span', { class: 'lk-dot-fill', style: { background: look.accentCustom } }) : null,
          on ? icon('check', 13, inkFor(look.accentCustom), 2.6) : null);
      }
      return el('button', { class: 'lk-dot' + (on ? ' is-on' : ''), title: name, 'aria-label': name, style: { background: fill },
        onClick: e => { if (!on) change(() => store.setLook({ accent: k }), e); } },
        on ? icon('check', 13, inkFor(fill), 2.6) : null);
    }));

    const tones = el('div', { class: 'lk-opts lk-opts-3' + (th.paper ? '' : ' is-dim') }, ...TONES.map(([k, name, hex]) => {
      const on = look.text === k;
      if (k === 'custom') {
        return el('label', { class: 'lk-opt' + (on ? ' is-on' : '') },
          custom(look.textCustom, v => change(() => store.setLook({ text: 'custom', textCustom: v })), 'Your own text colour'),
          el('span', { class: 'lk-rainbow-s' }), el('span', {}, name));
      }
      return el('button', { class: 'lk-opt' + (on ? ' is-on' : ''), onClick: () => { if (!on) change(() => store.setLook({ text: k })); } },
        el('b', { style: { color: hex } }, 'Aa'), el('span', {}, name));
    }));

    const lines = el('div', { class: 'lk-opts lk-opts-2' }, ...LINES.map(([k, name]) => {
      const on = look.lines === k;
      const sample = tokensFor({ ...look, lines: k })['--line'];
      if (k === 'custom') {
        return el('label', { class: 'lk-opt' + (on ? ' is-on' : '') },
          custom(look.linesCustom, v => change(() => store.setLook({ lines: 'custom', linesCustom: v })), 'Your own line colour'),
          el('i', { class: 'lk-line', style: { background: look.linesCustom } }), el('span', {}, name));
      }
      return el('button', { class: 'lk-opt' + (on ? ' is-on' : ''), onClick: () => { if (!on) change(() => store.setLook({ lines: k })); } },
        el('i', { class: 'lk-line', style: { background: sample } }), el('span', {}, name));
    }));

    const fonts = el('div', { class: 'lk-opts lk-opts-2 lk-fonts' }, ...FONTS.map(f => {
      const on = look.font === f.id;
      return el('button', { class: 'lk-font' + (on ? ' is-on' : ''), style: { fontFamily: f.stack },
          onClick: () => { if (!on) change(() => store.setLook({ font: f.id })); } },
        el('span', { class: 'lk-font-aa' }, 'Aa'),
        el('span', { class: 'lk-font-n' }, f.name),
        el('span', { class: 'lk-font-x' }, '+$4,320'));
    }));

    return el('div', {},
      section('Accent', 'Buttons, highlights and the page you are on.', accents),
      section('Text', th.paper ? 'For Light and Platinum. Every tone is checked to stay easy to read.'
                               : 'For Light and Platinum — the dark themes keep their own white.', tones),
      section('Lines', 'The fading lines between rows and sections.', lines),
      section('Font', 'For the whole journal.', fonts));
  }

  /* ---------------- Custom ---------------- */
  function customTab() {
    const look = store.look;
    const bg = store.hasBackground ? store.background : '';
    const mine = store.bgVideos;
    const upload = el('input', { type: 'file', accept: 'video/*', multiple: true, hidden: true,
      onChange: async e => {
        const files = [...e.target.files]; e.target.value = '';
        for (const f of files) {
          if (!/^video\//.test(f.type)) { toast(`${f.name} is not a video`, 'warn'); continue; }
          if (f.size > 100 * 1024 * 1024) { toast(`${f.name} is over 100 MB — trim it first`, 'warn'); continue; }
          toast(`Adding ${f.name}…`);
          try {
            const info = await probeVideo(f);
            if (!info) { toast(`${f.name} could not be played here`, 'bad'); continue; }
            const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'mp4').toLowerCase();
            let introduced = false;
            await change(async () => { ({ introduced } = await store.addBgVideo(f, { name: nameFrom(f.name), type: f.type, ext, dur: info.dur, thumb: info.thumb })); });
            toast(introduced ? 'Playing behind Laminar — Clear glass is on so you can see it' : 'Playing behind Laminar now');
          } catch (err) { toast(err.message || 'That video could not be added', 'bad'); }
        }
      } });

    /* a tile: its still, and the clip itself playing while the pointer is on it */
    const tile = (id, label, poster, src, extra = {}) => {
      const node = el('button', {
          class: 'lk-bg' + (bg === id ? ' is-on' : '') + (extra.cls || ''), title: label, 'data-bgid': id,
          style: poster ? { backgroundImage: `url("${poster}")` } : {},
          onClick: e => { if (e.target.closest('.lk-bg-x')) return; if (bg !== id) change(async () => {
            const introduced = await store.setBackground(id);
            if (introduced) toast('Clear glass turned on so the video shows through — change it under Glass');
          }, e); } },
        el('span', { class: 'lk-bg-n' }, label), extra.remove || null);
      if (src) {
        let v = null;
        node.addEventListener('pointerenter', async () => {
          const url = typeof src === 'function' ? await src() : src;
          if (!url || v || !node.matches(':hover')) return;
          v = el('video', { class: 'lk-bg-v', muted: true, loop: true, playsinline: true, src: url });
          v.muted = true;
          node.prepend(v);
          v.play().catch(() => {});
        });
        node.addEventListener('pointerleave', () => { if (v) { v.pause(); v.remove(); v = null; } });
      }
      return node;
    };
    const removeBtn = v => confirmButton({ label: icon('close', 11, 'currentColor', 2.2), armedLabel: 'Remove', title: 'Remove this video',
      className: 'lk-bg-x', armedClassName: 'lk-bg-x is-armed',
      onConfirm: () => change(async () => { await store.removeBgVideo(v.id); toast('Removed'); }) });

    const dim = store.bgDim ?? findBackground(store.background)?.scrim ?? 0.4;
    const dimOut = el('span', { class: 'lk-val' }, Math.round(dim * 100) + '%');
    const dimRange = el('input', { type: 'range', min: 0, max: 0.85, step: 0.01, value: dim, class: 'sh-range lk-range',
      onInput: e => { const v = Number(e.target.value); dimOut.textContent = Math.round(v * 100) + '%'; e.target.style.setProperty('--p', (v / 0.85 * 100) + '%');
        document.documentElement.style.setProperty('--bg-scrim', String(v)); },
      onChange: e => store.setBgDim(Number(e.target.value)) });
    dimRange.style.setProperty('--p', (dim / 0.85 * 100) + '%');

    /* what Auto (or Grey) settled on for this picture, said plainly */
    function picInkNote() {
      const k = document.documentElement.dataset.picInk;
      const now = k === 'white' ? 'white' : k === 'black' ? 'black' : k === 'grey-l' ? 'light grey' : k === 'grey-d' ? 'dark grey' : 'the theme’s';
      return store.picInk === 'auto' || store.picInk === 'grey' ? `On this picture that is ${now}.` : '';
    }
    /* How clear Clear is: the panels' tint and blur, live as you drag */
    function clarityRow() {
      const k = store.clarity;
      const out = el('span', { class: 'lk-val' }, Math.round(k * 100) + '%');
      const range = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: k, class: 'sh-range lk-range lk-clarity',
        'aria-label': 'Clarity',
        onInput: e => { const v = Number(e.target.value); out.textContent = Math.round(v * 100) + '%'; e.target.style.setProperty('--p', (v * 100) + '%');
          document.documentElement.style.setProperty('--clear-k', String(v)); },
        onChange: e => store.setClarity(Number(e.target.value)) });
      range.style.setProperty('--p', (k * 100) + '%');
      return el('div', { class: 'lk-dim' }, el('span', { class: 'lk-dim-k' }, 'Clarity'), range, out);
    }

    const setups = store.playbook.setups || [];
    return el('div', {},
      section('Background', 'A video on a loop behind the whole journal, muted.',
        el('div', { class: 'lk-bgprev' }, miniApp(look, store, { picture: true })),
        el('div', { class: 'lk-bgs' },
          tile('', 'None', null, null, { cls: ' is-none' }),
          ...BACKGROUNDS.map(b => tile(b.id, b.name, b.poster, () => playable(b.src))),
          ...mine.map(v => tile('yours:' + v.id, v.name, v.thumb, () => store.bgVideoUrl(v.id), { remove: removeBtn(v) })),
          el('button', { class: 'lk-bg is-add', onClick: () => upload.click(), title: 'Add a video of your own' },
            icon('plus', 18, 'currentColor', 1.8), el('span', { class: 'lk-bg-n' }, 'Add video')),
          upload),
        mine.length ? el('div', { class: 'lk-note' }, 'Yours are kept in your journal folder, so they go wherever it goes.') : null,
        bg ? el('div', { class: 'lk-dim' }, el('span', { class: 'lk-dim-k' }, 'Dim'), dimRange, dimOut) : null),
      bg ? section('Text', 'For the writing on the picture — the top bar, the top of every page and, with Clear glass, the panels too. Auto reads the picture and picks white or black; Grey is the softer of the two; Theme keeps the theme’s own.',
        el('div', { class: 'lk-pic-ink' }, segRow(PIC_INK_LABELS, store.picInk, v => change(() => store.setPicInk(v)))),
        (() => { const n = el('div', { class: 'lk-note lk-pic-note' }, picInkNote()); setTimeout(() => { n.textContent = picInkNote(); }, 450); return n; })()) : null,
      section('Glass', 'Frosted blurs the video behind the panels; Clear lets it show through.',
        segRow([['off', 'Solid'], ['frosted', 'Frosted'], ['clear', 'Clear']], store.glassMode, v => change(() => store.setGlass(v))),
        store.glassMode === 'clear' ? clarityRow() : null),
      section('Motion', 'Pages arriving, figures writing themselves in, tabs that slide.',
        segRow(MOTIONS, look.motion, v => change(() => store.setLook({ motion: v }))),
        el('div', { class: 'lk-note' }, look.motion === 'calm' ? 'Cards still arrive; figures stay put.'
          : look.motion === 'off' ? 'Everything appears at once.' : 'Everything moves, briefly.')),
      setups.length ? section('Setup colours', 'The chip each setup wears on a trade, in the calendar and in Analytics.',
        el('div', { class: 'lk-chips' }, ...setups.map(su => el('label', { class: 'lk-chip' },
          el('input', { type: 'color', value: isHex(su.color) ? su.color : '#9A9A9A', 'aria-label': `${su.name} colour`,
            onChange: async e => { su.color = e.target.value.toUpperCase(); await store.save('playbook'); paint(); refreshApp(); } }),
          el('i', { style: { background: su.color } }), el('span', {}, su.name))))) : null);
  }

  /* ---------------- Money ---------------- */
  function moneyTab() {
    const col = store.colours;
    const flat = col.flat || '';
    const row = (which, label, note) => {
      const hex = which === 'flat' ? (flat || '#9A9A9A') : col[which];
      const open = st.menu === which;
      return el('div', { class: 'lk-money-row' + (open ? ' is-open' : '') },
        el('button', { class: 'lk-money-b', onClick: () => { st.menu = open ? null : which; paint(); } },
          el('span', { class: 'lk-money-dot', style: { background: hex } }),
          el('span', { class: 'lk-money-t' }, el('b', {}, label), el('span', {}, note)),
          el('span', { class: 'lk-money-hex' }, which === 'flat' && !flat ? 'Theme grey' : (nameOfColour(hex) || hex.toUpperCase())),
          icon('chevdown', 12, 'currentColor', 2)),
        open ? el('div', { class: 'lk-palette' },
          which === 'flat' ? el('button', { class: 'lk-pal-reset', onClick: () => { st.menu = null; change(() => store.setColour('flat', '')); } }, 'Theme grey') : null,
          ...PALETTE.map(([fam, xs]) => el('div', { class: 'lk-pal-fam' },
            el('span', { class: 'lk-pal-k' }, fam),
            el('div', { class: 'lk-pal-grid' }, ...xs.map(([h, n]) => el('button', { class: 'lk-pal' + (h.toLowerCase() === String(hex).toLowerCase() ? ' is-on' : ''),
              title: n, 'aria-label': n, style: { background: h },
              onClick: () => { st.menu = null; change(() => store.setColour(which, h)); } },
              h.toLowerCase() === String(hex).toLowerCase() ? icon('check', 11, c.inkOn(h), 2.6) : null)))))) : null);
    };
    const pb = store.playbook;
    const stepper = (v, onSet, fmt, step, min = 0) => el('div', { class: 'stepper lk-stepper' },
      el('button', { 'aria-label': 'Less', onClick: async () => { await onSet(Math.max(min, +(v - step).toFixed(2))); paint(); refreshApp(); } }, icon('minus', 12, 'currentColor', 2.2)),
      el('span', { class: 'val' }, v ? fmt(v) : 'none'),
      el('button', { 'aria-label': 'More', onClick: async () => { await onSet(+(v + step).toFixed(2)); paint(); refreshApp(); } }, icon('plus', 12, 'currentColor', 2.2)));
    const savePb = () => store.save('playbook');

    return el('div', {},
      section('Money colours', 'Your P&L, win rate and calendar use them.',
        el('div', { class: 'lk-card lk-money' },
          row('profit', 'Win', 'Any day or trade in profit'),
          row('loss', 'Loss', 'Any day or trade in loss'),
          row('flat', 'Break-even', 'Exactly zero')),
        el('div', { class: 'lk-presets' }, el('span', { class: 'lk-dn-k' }, 'Sets'),
          ...MONEY_PRESETS.map(([name, set]) => el('button', { class: 'lk-preset', onClick: () => change(async () => {
              for (const [k, v] of Object.entries(set)) await store.setColour(k, v);
            }) },
            el('span', { class: 'lk-strip' }, el('i', { style: { background: set.profit } }), el('i', { style: { background: set.loss } }),
              el('i', { style: { background: set.flat || 'var(--grey-4)' } })), name)))),
      section('Figures read in', 'What every page shows a result as. The trade form always takes money.',
        segRow(c.UNITS.map(u => [u, u === '$' ? 'Money' : u === '%' ? 'Percent' : 'R multiple']), store.displayUnit,
          v => change(() => store.setDisplayUnit(v)))),
      section('Guardrails', 'Your limits for a day. The same rules as the Playbook’s, kept in one place.',
        el('div', { class: 'lk-card' },
          el('div', { class: 'lk-guard' }, el('span', {}, el('b', {}, 'Daily loss cap'), el('span', {}, 'Percent of the starting balance')),
            stepper(Number(pb.rules.dailyLossCapPercent) || 0, async v => { pb.rules.dailyLossCapPercent = v; await savePb(); }, v => v.toFixed(2) + '%', 0.25)),
          el('div', { class: 'lk-guard' }, el('span', {}, el('b', {}, 'Max trades a day'), el('span', {}, 'The trade after it is the one to skip')),
            stepper(Number(pb.rules.maxTradesPerDay) || 0, async v => { pb.rules.maxTradesPerDay = Math.round(v); await savePb(); }, v => String(Math.round(v)), 1)))));
  }

  /* ---------------- pieces ---------------- */
  function segRow(options, current, onPick) {
    return el('div', { class: 'seg lk-seg' }, ...options.map(([v, label]) =>
      el('button', { class: v === current ? 'is-on' : '', onClick: () => { if (v !== current) onPick(v); } }, label)));
  }
  function toggleRow(label, on, onSet) {
    return el('div', { class: 'lk-toggle-row' }, el('span', {}, label),
      el('button', { class: 'lk-toggle' + (on ? ' is-on' : ''), role: 'switch', 'aria-checked': String(on), 'aria-label': label,
        onClick: () => onSet(!on) }, el('i')));
  }

  let api = null;
  paint();
  api = sheet({ cls: 'is-look', body, label: 'Appearance', onClose: () => nav.refresh() });
}

/* ---------- the hero: the font, and the look fanned out as cards ---------- */
function hero(store, look) {
  const sw = swatchesOf(look);
  const tok = tokensFor(look);
  const all = [...sw, tok['--ink-4'] || '#888888'];
  const font = fontOf(look.font);
  return el('div', { class: 'lk-hero' },
    el('div', { class: 'lk-aa', style: { fontFamily: font.stack } }, 'Aa', el('span', {}, font.name.toUpperCase())),
    el('div', { class: 'lk-fan', 'aria-hidden': 'true' }, ...all.slice(0, 7).map((h, i) => el('span', {
      class: 'lk-fan-c', style: { background: h, color: isHex(h) ? inkFor(h) : 'var(--ink)', '--k': String(i) } },
      String(h).replace('#', '')))));
}

/* A tiny Laminar in a given look, drawn with that look's own colours. */
function miniApp(look, store, { picture = false } = {}) {
  const th = themeOf(look.theme);
  const t = tokensFor(look);
  const page = th.page === 'transparent' ? th.frame : th.page;
  const col = store.colours;
  const acc = t['--accent'];
  const bars = [0.62, 0.34, 0.86, 0.22, 0.74, 0.46, 0.9];
  const bg = picture && store.hasBackground ? store.background : '';
  const ours = bg && !bg.startsWith('yours:') ? findBackground(bg) : null;
  const pic = !bg ? null : ours ? (ours.poster || null) : (store.bgVideos.find(v => 'yours:' + v.id === bg)?.thumb || null);
  /* The still, filling the frame once (backgroundColor, not the shorthand,
     which would put the size back to auto and tile a small still), and the
     video itself over it, playing the way it plays behind the journal. */
  let clip = null;
  if (bg && picture) {
    clip = el('video', { class: 'lk-ma-v', muted: true, loop: true, playsinline: true, 'aria-hidden': 'true' });
    clip.muted = true;
    const want = ours ? playable(ours.src) : store.bgVideoUrl(bg.slice(6));
    Promise.resolve(want).then(url => {
      if (!url || !clip.isConnected && !clip.parentNode) return;
      clip.src = url;
      if (document.documentElement.dataset.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches) clip.play().catch(() => {});
    });
  }
  /* Clear's tint follows the same --clear-k the journal does, so the Clarity
     slider moves this card as it moves the real ones */
  const clearTint = th.paper ? 'rgba(255,255,255,calc(.66 - .6 * var(--clear-k, .65)))' : 'rgba(10,10,12,calc(.55 - .51 * var(--clear-k, .65)))';
  return el('div', { class: 'lk-mini-app' + (pic ? ' has-pic' : ''),
      style: { backgroundColor: th.frame, backgroundImage: pic ? `url("${pic}")` : 'none' } },
    clip, clip ? el('i', { class: 'lk-ma-scrim', 'aria-hidden': 'true' }) : null,
    el('div', { class: 'lk-ma-top' }, ...[0, 1, 2, 3, 4].map(i => el('i', { style: { background: i === 1 ? t['--ink'] : t['--ink-4'], opacity: i === 1 ? 0.9 : 0.5 } }))),
    el('div', { class: 'lk-ma-body', style: { background: picture && store.glass ? 'transparent' : page } },
      el('div', { class: 'lk-ma-side' }, ...[0, 1, 2, 3].map(i => el('i', { style: { background: t['--ink-4'], width: (80 - i * 12) + '%' } }))),
      el('div', { class: 'lk-ma-card', style: { background: picture && store.glass ? (store.glassMode === 'clear' ? clearTint : (th.paper ? 'rgba(255,255,255,.6)' : 'rgba(12,12,14,.55)')) : th.card,
          backdropFilter: picture && store.glass ? (store.glassMode === 'clear' ? 'blur(calc(4px - 3.5px * var(--clear-k, .65)))' : 'blur(8px)') : 'none',
          color: t['--ink'], fontFamily: fontOf(look.font).stack, boxShadow: th.paper ? '0 1px 2px rgba(0,0,0,.06)' : 'none' } },
        el('i', { class: 'lk-ma-k', style: { background: t['--ink-4'] } }),
        el('b', {}, '+$16,480'),
        el('div', { class: 'lk-ma-bars', style: { background: t['--grey-9'] || 'transparent' } },
          ...bars.map((h, i) => el('i', { style: { height: (h * 100) + '%',
            background: i === 3 ? acc : i % 3 === 1 ? col.loss : col.profit } })))),
      el('div', { class: 'lk-ma-side' }, ...[0, 1, 2].map(i => el('i', { style: { background: t['--ink-4'], width: (70 - i * 14) + '%' } })))));
}

const PIC_INK_LABELS = [['auto', 'Auto'], ['white', 'White'], ['black', 'Black'], ['grey', 'Grey'], ['theme', 'Theme']];

function section(title, note, ...content) {
  return el('section', { class: 'lk-sec' },
    el('h3', {}, title), note ? el('p', { class: 'lk-p' }, note) : null, ...content);
}

function download(s) {
  const text = JSON.stringify({ app: 'Laminar', kind: 'look', name: s.name, look: s.look, colours: s.colours,
                                background: /^(own|yours):/.test(String(s.background || '')) ? '' : s.background, glass: s.glass }, null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a', { href: url, download: `${s.name.replace(/[^\w\- ]+/g, '').trim() || 'look'}.laminar-look.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* The look spreads out from where you clicked, as a circle, where the
   browser can do that; elsewhere it simply changes. */
async function reveal(origin, fn) {
  const root = document.documentElement;
  const quiet = root.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!origin || quiet || !document.startViewTransition) { await fn(); return; }
  const x = origin.clientX ?? innerWidth / 2, y = origin.clientY ?? innerHeight / 2;
  root.style.setProperty('--vt-x', x + 'px');
  root.style.setProperty('--vt-y', y + 'px');
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.style.setProperty('--vt-r', r + 'px');
  try {
    const vt = document.startViewTransition(() => fn());
    await vt.updateCallbackDone;
    await vt.finished.catch(() => {});
  } catch { await fn(); }
}

