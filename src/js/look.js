/* ============================================================
   look.js — what the app looks like, as data.

   One object decides the whole look: a theme (the frame, the page and the
   cards), an accent, a text tone, how the lines are drawn, the typeface and
   how much things move. It lives in accounts.json beside the profit and loss
   colours, so it travels with the vault like every other preference.

   applyLook() turns it into CSS custom properties. The views never learn a
   look exists: they keep writing var(--ink), var(--grey-7) and var(--card),
   and this file decides what those mean today.

   The grey ramp is the one subtle part. Laminar's screens were drawn for dark
   cards, so --grey-1 is "the palest thing" and --grey-9 is "a well inside a
   card". On the paper themes (Light, Platinum) the ramp is mirrored around
   the card: --grey-1 becomes the darkest ink and --grey-8 the white of the
   card. Every inline colour in every view then lands the right way round
   without the view being touched.
   ============================================================ */

export const THEMES = [
  { id: 'light',    name: 'Light',    note: 'White pages on a pale grey frame.',
    paper: true,  frame: '#EBEDF1', page: '#F4F6F9', card: '#FFFFFF', well: '#F3F4F7', field: '#ECEEF2', inset2: '#E1E4EA',
    cell: '#F1F3F6', cellQuiet: '#F8F9FB', cardLight: '#111214' },
  { id: 'platinum', name: 'Platinum', note: 'Ash frame, platinum page. Matte grey.',
    paper: true,  frame: '#A8AAAF', page: '#C9CBCF', card: '#DADCDF', well: '#D0D2D6', field: '#CDCFD3', inset2: '#C1C3C8',
    cell: '#D1D3D7', cellQuiet: '#D6D8DB', cardLight: '#1C1D20' },
  { id: 'midnight', name: 'Midnight', note: 'Pure black. Nothing but the work.',
    paper: false, frame: '#000000', page: '#070708', card: '#0E0E10', well: '#141417', field: '#17171A', inset2: '#232327',
    cell: '#141417', cellQuiet: '#0A0A0C', cardLight: '#18181B' },
  { id: 'onyx',     name: 'Onyx',     note: 'Jet black frame, onyx grey page.',
    paper: false, frame: '#0B0B0C', page: '#161618', card: '#1E1E21', well: '#27272B', field: '#2A2A2E', inset2: '#36363B',
    cell: '#242427', cellQuiet: '#1B1B1E', cardLight: '#29292D' },
  { id: 'graphite', name: 'Graphite', note: 'Grey frame, black cards. The original Laminar.',
    paper: false, classic: true, frame: '#9A9A9A', page: 'transparent', card: '#202020', well: '#2A2A2A', field: '#363636', inset2: '#4F4F4F',
    cell: '#2A2A2A', cellQuiet: '#262626', cardLight: '#E9E9E9' },
];
export const themeOf = id => THEMES.find(t => t.id === id) || THEMES[0];

/* Buttons, highlights and the page you are on. Mono is the theme's own ink. */
export const ACCENTS = [
  ['mono', 'Mono', null], ['blue', 'Blue', '#2563EB'], ['cyan', 'Cyan', '#06B6D4'], ['sky', 'Sky', '#0284C7'],
  ['slate', 'Slate', '#64748B'], ['teal', 'Teal', '#14B8A6'], ['green', 'Green', '#10B981'], ['lime', 'Lime', '#84CC16'],
  ['amber', 'Amber', '#F59E0B'], ['orange', 'Orange', '#F97316'], ['red', 'Red', '#EF4444'], ['custom', 'Your own', null],
];

/* The text tone on the paper themes. Each is checked to stay readable on both
   paper cards: the quietest step it makes still clears 3:1 on white. */
export const TONES = [
  ['ink', 'Ink', '#0E0F11'], ['graphite', 'Graphite', '#2E3036'], ['espresso', 'Espresso', '#2B1E17'],
  ['navy', 'Navy', '#0F1C36'], ['custom', 'Your own', null],
];

export const LINES = [['theme', 'Theme'], ['text', 'Text colour'], ['accent', 'Accent'], ['custom', 'Your own']];

export const FONTS = [
  { id: 'jakarta',    name: 'Jakarta',    stack: "'Plus Jakarta Sans Variable','Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif" },
  { id: 'geist',      name: 'Geist',      stack: "'Geist Variable','Geist',system-ui,-apple-system,'Segoe UI',sans-serif" },
  { id: 'inter',      name: 'Inter',      stack: "'Inter Variable','Inter',system-ui,-apple-system,'Segoe UI',sans-serif" },
  { id: 'manrope',    name: 'Manrope',    stack: "'Manrope Variable','Manrope',system-ui,-apple-system,'Segoe UI',sans-serif" },
  { id: 'plex',       name: 'IBM Plex Sans', stack: "'IBM Plex Sans Variable','IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif" },
];
export const fontOf = id => FONTS.find(f => f.id === id) || FONTS[0];

export const MOTIONS = [['full', 'Full'], ['calm', 'Calm'], ['off', 'Off']];

export const DEFAULT_LOOK = Object.freeze({
  theme: 'light', accent: 'mono', accentCustom: '#7C5CFF', text: 'ink', textCustom: '#1F2937',
  lines: 'theme', linesCustom: '#9CA3AF', font: 'jakarta', motion: 'full',
});

/** A look with every field present and every value one we know. */
export function normaliseLook(raw, legacyTheme) {
  const l = { ...DEFAULT_LOOK, ...(raw || {}) };
  if (!raw && legacyTheme === 'dark') l.theme = 'midnight';
  if (!THEMES.some(t => t.id === l.theme)) l.theme = DEFAULT_LOOK.theme;
  if (!ACCENTS.some(([k]) => k === l.accent)) l.accent = 'mono';
  if (!TONES.some(([k]) => k === l.text)) l.text = 'ink';
  if (!LINES.some(([k]) => k === l.lines)) l.lines = 'theme';
  if (!FONTS.some(f => f.id === l.font)) l.font = DEFAULT_LOOK.font;
  if (!MOTIONS.some(([k]) => k === l.motion)) l.motion = 'full';
  for (const k of ['accentCustom', 'textCustom', 'linesCustom']) if (!isHex(l[k])) l[k] = DEFAULT_LOOK[k];
  return pick(l, Object.keys(DEFAULT_LOOK));
}

export const isHex = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));

/* ---------- colour arithmetic ---------- */
export function rgbOf(hex) {
  const m = String(hex).replace('#', '');
  const n = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16));
}
const hexOf = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
/** a, moved toward b by t (0 = a, 1 = b). */
export function mix(a, b, t) { const A = rgbOf(a), B = rgbOf(b); return hexOf(A.map((v, i) => v + (B[i] - v) * t)); }
const lum = hex => {
  const [r, g, b] = rgbOf(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const inkFor = hex => (lum(hex) > 0.42 ? '#0B0B0C' : '#FFFFFF');
const rgba = (hex, a) => `rgba(${rgbOf(hex).join(', ')}, ${a})`;

/** The text tone itself, nudged darker until its quiet step reads on the card. */
function toneFor(look, theme) {
  let t = look.text === 'custom' ? look.textCustom : (TONES.find(([k]) => k === look.text)?.[2] || '#0E0F11');
  for (let i = 0; i < 8 && contrast(mix(t, theme.card, 0.52), theme.card) < 3; i++) t = mix(t, '#000000', 0.25);
  return t;
}

export function accentOf(look, theme, ink) {
  if (look.accent === 'mono') return theme.paper ? ink : '#F4F4F6';
  if (look.accent === 'custom') return look.accentCustom;
  return ACCENTS.find(([k]) => k === look.accent)?.[2] || ink;
}

/* ---------- the tokens ---------- */
export function tokensFor(look, { glass = false, bg = false } = {}) {
  const th = themeOf(look.theme);
  const v = {};
  const ink = th.paper ? toneFor(look, th) : '#F4F4F6';

  v['--frame'] = th.frame;
  v['--page'] = th.page;
  v['--ground'] = th.frame;
  v['--card'] = th.card;
  v['--card-light'] = th.cardLight;
  v['--inset'] = th.field;
  v['--inset-2'] = th.inset2;
  v['--cell'] = th.cell;
  v['--cell-quiet'] = th.cellQuiet;

  if (th.paper) {
    const B = th.card, at = t => mix(ink, B, t);
    Object.assign(v, {
      '--ink': ink, '--ink-2': at(0.2), '--ink-3': at(0.4), '--ink-4': at(0.5), '--ink-5': at(0.58),
      '--grey-1': ink, '--grey-1_5': at(0.08), '--grey-1_7': at(0.16), '--grey-2': at(0.22),
      '--grey-3': at(0.4), '--grey-3_5': at(0.43), '--grey-4': at(0.46), '--grey-5': at(0.52),
      '--grey-6': at(0.72), '--grey-7': th.field, '--grey-8': th.card, '--grey-9': th.well,
      '--ink-on-light': ink, '--ink-on-light-2': mix(ink, th.page, 0.45),
      '--hi': 'rgba(0, 0, 0, .035)', '--hi-2': 'rgba(0, 0, 0, .06)',
      '--shadow-card': '0 1px 2px rgba(16,18,24,.05), 0 6px 22px -10px rgba(16,18,24,.14)',
      '--shadow-float': '0 2px 6px rgba(16,18,24,.06), 0 24px 60px -20px rgba(16,18,24,.28)',
      '--edge': rgba(ink, 0.07),
    });
  } else if (th.classic) {
    Object.assign(v, {
      '--ink': '#FFFFFF', '--ink-2': '#BBBBBB', '--ink-3': '#9A9A9A', '--ink-4': '#6C6C6C', '--ink-5': '#656565',
      '--grey-1': '#E9E9E9', '--grey-1_5': '#DEDEDE', '--grey-1_7': '#D0D0D0', '--grey-2': '#BBBBBB',
      '--grey-3': '#9A9A9A', '--grey-3_5': '#808080', '--grey-4': '#787878', '--grey-5': '#6C6C6C',
      '--grey-6': '#4F4F4F', '--grey-7': '#363636', '--grey-8': '#202020', '--grey-9': '#2A2A2A',
      '--ink-on-light': '#202020', '--ink-on-light-2': '#4F4F4F',
      '--hi': 'rgba(255, 255, 255, .04)', '--hi-2': 'rgba(255, 255, 255, .07)',
      '--shadow-card': '0 1px 2px rgba(0,0,0,.20), 0 10px 26px -12px rgba(0,0,0,.42)',
      '--shadow-float': '0 2px 6px rgba(0,0,0,.3), 0 30px 70px -20px rgba(0,0,0,.6)',
      '--edge': 'rgba(255,255,255,.04)',
    });
  } else {
    Object.assign(v, {
      '--ink': ink, '--ink-2': '#B9BAC0', '--ink-3': '#8E9097', '--ink-4': '#6E7077', '--ink-5': '#5B5D63',
      '--grey-1': '#ECECEF', '--grey-1_5': '#DEDEE2', '--grey-1_7': '#CFCFD4', '--grey-2': '#BBBBC1',
      '--grey-3': '#9A9AA1', '--grey-3_5': '#818188', '--grey-4': '#7A7A81', '--grey-5': '#6D6D74',
      '--grey-6': '#4E4E55', '--grey-7': th.field, '--grey-8': th.card, '--grey-9': th.well,
      '--ink-on-light': ink, '--ink-on-light-2': '#8E9097',
      '--hi': 'rgba(255, 255, 255, .035)', '--hi-2': 'rgba(255, 255, 255, .06)',
      '--shadow-card': '0 1px 2px rgba(0,0,0,.4), 0 12px 30px -16px rgba(0,0,0,.7)',
      '--shadow-float': '0 2px 8px rgba(0,0,0,.5), 0 30px 80px -20px rgba(0,0,0,.85)',
      '--edge': 'rgba(255,255,255,.055)',
    });
  }

  /* The frame: what the top bar and the window edge are drawn on. */
  if (th.paper) Object.assign(v, {
    '--frame-ink': ink, '--frame-ink-2': mix(ink, th.frame, 0.5), '--frame-pill': th.card, '--frame-pill-ink': ink,
    '--frame-hover': rgba(ink, 0.05), '--frame-ctl': rgba(ink, 0.06), '--float': th.card,
  });
  else if (th.classic) Object.assign(v, {
    '--frame-ink': bg ? '#F2F4F3' : '#1A1A1A', '--frame-ink-2': bg ? 'rgba(255,255,255,.62)' : 'rgba(0,0,0,.55)',
    '--frame-pill': '#202020', '--frame-pill-ink': '#FFFFFF',
    '--frame-hover': 'rgba(0,0,0,.08)', '--frame-ctl': 'rgba(0,0,0,.1)', '--float': '#202020',
    ...(bg ? { '--ink-on-light': '#F2F4F3', '--ink-on-light-2': 'rgba(255,255,255,.62)' } : {}),
  });
  else Object.assign(v, {
    '--frame-ink': ink, '--frame-ink-2': '#8E9097', '--frame-pill': 'rgba(255,255,255,.09)', '--frame-pill-ink': ink,
    '--frame-hover': 'rgba(255,255,255,.05)', '--frame-ctl': 'rgba(255,255,255,.06)', '--float': mix(th.card, '#FFFFFF', 0.04),
  });

  const acc = accentOf(look, th, ink);
  v['--accent'] = acc;
  v['--accent-on'] = inkFor(acc);
  v['--accent-rgb'] = rgbOf(acc).join(', ');
  v['--accent-wash'] = rgba(acc, th.paper ? 0.1 : 0.16);
  /* The accent as text: a pale accent on a white card is pushed darker until it reads. */
  let accText = acc;
  for (let i = 0; i < 6 && contrast(accText, th.card) < 3; i++) accText = mix(accText, th.paper ? '#000000' : '#FFFFFF', 0.25);
  v['--accent-text'] = accText;

  const lineBase = th.paper ? ink : '#FFFFFF';
  v['--line'] = look.lines === 'text' ? rgba(th.paper ? ink : '#F4F4F6', th.paper ? 0.22 : 0.2)
              : look.lines === 'accent' ? rgba(acc, 0.42)
              : look.lines === 'custom' ? look.linesCustom
              : th.classic ? 'rgba(255,255,255,.07)' : rgba(lineBase, th.paper ? 0.085 : 0.075);

  const font = fontOf(look.font);
  v['--mono'] = font.stack;
  v['--sans'] = font.stack;
  v['--font-name'] = `'${font.name}'`;

  /* Glass: the panels go translucent and everything inside them becomes a
     tint rather than a fixed grey, the same way the original glass did. */
  if (glass === 'clear') {
    /* Clear: thinly tinted, lightly blurred — the video behind is the point.
       How thin is --clear-k (0 nearly frosted … 1 bare), set by the Clarity
       slider straight onto <html>, so dragging it repaints without a pass
       through here. One quiet hairline for an edge (look.css). */
    const a = (hi, lo) => `calc(${hi} - ${(hi - lo).toFixed(3)} * var(--clear-k, .65))`;
    if (th.paper) {
      /* Over a picture the quiet greys lose their ground, so they are drawn
         a good deal nearer the ink (no shadow to prop them up any more). */
      const at = t => mix(ink, th.card, t);
      Object.assign(v, {
        '--ink-2': at(0.12), '--ink-3': at(0.24), '--ink-4': at(0.3), '--ink-5': at(0.36),
        '--grey-3': at(0.26), '--grey-3_5': at(0.28), '--grey-4': at(0.3), '--grey-5': at(0.32),
        '--ink-on-light-2': mix(ink, th.page, 0.25), '--frame-ink-2': mix(ink, th.frame, 0.3),
        '--glass-panel': `rgba(255,255,255,${a(.66, .06)})`, '--glass-raised': `rgba(255,255,255,${a(.58, .05)})`,
        '--glass-rim': 'rgba(255,255,255,.26)', '--glass-lip': 'rgba(255,255,255,.26)',
        '--glass-blur': `calc(18px - 16px * var(--clear-k, .65))`,
        '--sheet-glass': `rgba(255,255,255,${a(.78, .3)})`, '--sheet-top': 'rgba(246,247,249,.58)',
        '--inset': 'rgba(255,255,255,.34)', '--inset-2': 'rgba(255,255,255,.5)', '--grey-9': 'rgba(0,0,0,.05)',
        '--grey-7': 'rgba(0,0,0,.08)', '--cell': 'rgba(255,255,255,.3)', '--cell-quiet': 'rgba(255,255,255,.14)',
        '--page': 'transparent',
      });
    } else {
      Object.assign(v, {
        '--glass-panel': `rgba(8,8,10,${a(.55, .04)})`, '--glass-raised': `rgba(30,30,34,${a(.55, .06)})`,
        '--glass-rim': 'rgba(255,255,255,.09)', '--glass-lip': 'rgba(255,255,255,.09)',
        '--glass-blur': `calc(16px - 14px * var(--clear-k, .65))`,
        '--sheet-glass': `rgba(14,14,17,${a(.7, .22)})`, '--sheet-top': 'rgba(14,14,17,.56)',
        '--inset': 'rgba(255,255,255,.09)', '--inset-2': 'rgba(255,255,255,.15)', '--grey-9': 'rgba(255,255,255,.07)',
        '--grey-7': 'rgba(255,255,255,.14)', '--cell': 'rgba(255,255,255,.07)', '--cell-quiet': 'rgba(255,255,255,.03)',
        '--ink-3': '#D2D2D6', '--ink-4': '#B0B0B6', '--ink-5': '#9A9AA0', '--page': 'transparent',
      });
    }
  } else if (glass) {
    if (th.paper) {
      Object.assign(v, {
        '--glass-panel': 'rgba(255,255,255,.62)', '--glass-raised': 'rgba(255,255,255,.5)',
        '--glass-rim': 'rgba(255,255,255,.55)', '--glass-lip': 'rgba(255,255,255,.8)', '--glass-blur': '28px',
        '--inset': 'rgba(0,0,0,.05)', '--inset-2': 'rgba(0,0,0,.09)', '--grey-9': 'rgba(0,0,0,.04)',
        '--grey-7': 'rgba(0,0,0,.06)', '--cell': 'rgba(0,0,0,.045)', '--cell-quiet': 'rgba(0,0,0,.02)',
        '--page': 'rgba(255,255,255,.18)',
      });
    } else {
      Object.assign(v, {
        '--glass-panel': th.classic ? 'rgba(24,24,24,.5)' : 'rgba(10,10,12,.52)', '--glass-raised': 'rgba(44,44,48,.42)',
        '--glass-rim': 'rgba(255,255,255,.085)', '--glass-lip': 'rgba(255,255,255,.11)', '--glass-blur': '26px',
        '--inset': 'rgba(255,255,255,.065)', '--inset-2': 'rgba(255,255,255,.1)', '--grey-9': 'rgba(255,255,255,.055)',
        '--grey-7': 'rgba(255,255,255,.11)', '--cell': 'rgba(255,255,255,.055)', '--cell-quiet': 'rgba(255,255,255,.02)',
        '--ink-3': '#B4B4B8', '--ink-4': '#8E8E93', '--ink-5': '#7E7E83', '--page': 'rgba(0,0,0,.14)',
      });
    }
  }
  /* the writing on the page and in the frame as the theme has it, kept so a
     panel can put it back where the writing on the picture differs (look.css) */
  v['--ink-on-light-t'] = v['--ink-on-light']; v['--ink-on-light-2-t'] = v['--ink-on-light-2'];
  v['--frame-ink-t'] = v['--frame-ink']; v['--frame-ink-2-t'] = v['--frame-ink-2'];

  return v;
}

/** The six colours that sum a look up, for the fan of cards in the sheet. */
export function swatchesOf(look) {
  const th = themeOf(look.theme);
  const t = tokensFor(look);
  return [th.frame, th.page === 'transparent' ? th.frame : th.page, th.card, t['--ink'], t['--accent'], t['--ink-3']]
    .map(h => (isHex(h) ? h.toUpperCase() : h));
}

/** "Light · Mono · Jakarta" */
export function describeLook(look) {
  const th = themeOf(look.theme);
  const acc = ACCENTS.find(([k]) => k === look.accent)?.[1] || 'Mono';
  return `${th.name} · ${acc} · ${fontOf(look.font).name}`;
}

/* ---------- the ramp on the page itself ----------
   A view's header row sits on the page, not on a card, and its inline
   colours were written for that: --grey-8 is the strong ink there and
   --grey-1 the pale thing on a dark button. So the header gets the ramp the
   other way round from the cards — and its controls (segments, steppers,
   fields), which are drawn like little cards, get the card ramp back. The
   pale cards are the same story: their contents are written in the header's
   terms. */
export function pageRampFor(look, v = tokensFor(look)) {
  const th = themeOf(look.theme);
  if (th.classic) return null;
  const ink = v['--ink'];
  if (th.paper) {
    /* on Clear glass the header sits on the picture: its greys come nearer the ink */
    const P = th.page, k = v['--page'] === 'transparent' ? 0.55 : 1, at = t => mix(ink, P, t * k);
    return { '--grey-8': ink, '--grey-7': at(0.2), '--grey-9': at(0.3), '--grey-6': at(0.42), '--grey-5': at(0.5),
             '--grey-4': at(0.46), '--grey-3_5': at(0.5), '--grey-3': at(0.55), '--grey-2': at(0.82), '--grey-1_7': at(0.9),
             '--grey-1_5': mix(th.card, P, 0.4), '--grey-1': th.card };
  }
  const P = th.page, at = t => mix(ink, P, t);
  return { '--grey-8': ink, '--grey-7': at(0.22), '--grey-9': at(0.3), '--grey-6': at(0.45), '--grey-5': at(0.55),
           '--grey-4': at(0.5), '--grey-3_5': at(0.55), '--grey-3': at(0.6), '--grey-2': mix(th.card, ink, 0.12), '--grey-1_7': mix(th.card, ink, 0.08),
           '--grey-1_5': mix(th.card, ink, 0.05), '--grey-1': th.card };
}
/* On paper the pale cards turn dark (the Laminar card, inside a light app). */
function paleCardFor(look) {
  const th = themeOf(look.theme);
  if (!th.paper) return null;
  return {
    '--grey-8': '#F2F4F3', '--grey-6': '#B4BAB8', '--grey-5': '#8B918F', '--grey-4': '#6A706E', '--grey-2': '#2B2F2E',
    '--grey-1': '#26292C', '--grey-1_5': '#1B1E1D', '--grey-1_7': '#2A2D30', '--grey-7': '#2E3134', '--grey-9': '#202326',
    '--ink': '#F4F4F6', '--ink-2': '#B9BAC0', '--ink-3': '#8E9097', '--ink-4': '#6E7077', '--ink-5': '#5B5D63',
    '--ink-on-light': '#F4F4F6', '--ink-on-light-2': '#B4BAB8', '--inset': '#25282B', '--inset-2': '#303337',
    '--line': 'rgba(255,255,255,.08)', '--hi': 'rgba(255,255,255,.04)',
  };
}

/* On Clear glass a panel is see-through, so the writing in it is on the
   picture too. When the picture behind them calls for the other writing
   from the theme's — a dark look over a bright video, a light one over a
   dark video (store.js sets data-pic-flip) — the panels are drawn as the
   other family would draw them: tint, writing, lines and all. Only for
   Clear; a frosted or solid panel is its own ground. */
function clearFlip(l, th, bg, rule) {
  if (!bg) return '';
  const opp = { ...l, theme: th.paper ? 'midnight' : 'light' };
  const t = tokensFor(opp, { glass: 'clear', bg: true });
  const keep = Object.fromEntries(Object.entries(t).filter(([k]) => !/^--(frame|page|ground|mono|sans|font-name)/.test(k)));
  return rule('html[data-glass-kind="clear"][data-pic-flip] :is(.card:not(.light), .st-list)', keep);
}

/* ---------- writing it onto the page ---------- */
let styleEl = null;
export function applyLook(look, { glass = false, bg = false } = {}) {
  if (typeof document === 'undefined') return;
  const l = normaliseLook(look);
  const th = themeOf(l.theme);
  const root = document.documentElement;
  root.dataset.look = th.id;
  root.dataset.paper = th.paper ? 'on' : 'off';
  root.dataset.motion = l.motion;
  root.dataset.font = l.font;
  /* The original dark rules still key off data-theme. The dark looks wear
     them; Graphite and the paper looks do not. */
  root.dataset.theme = th.paper || th.classic ? 'light' : 'dark';
  root.style.colorScheme = th.paper ? 'light' : 'dark';
  const tokens = tokensFor(l, { glass, bg });
  const body = Object.entries(tokens).map(([k, val]) => `  ${k}:${val};`).join('\n');
  if (!styleEl || !styleEl.isConnected) {
    styleEl = document.getElementById('look-tokens') || document.createElement('style');
    styleEl.id = 'look-tokens';
    document.head.append(styleEl);
  }
  /* Specific enough to beat the stylesheet's theme and glass blocks, which
     these values replace. */
  const rule = (sel, obj) => obj ? `${sel} {\n${Object.entries(obj).map(([k, val]) => `  ${k}:${val};`).join('\n')}\n}\n` : '';
  const pageRamp = pageRampFor(l, tokens);
  /* Only what a header writes inline in grey (a month name, a round button)
     takes the page's ramp; its classed controls are drawn like cards and
     keep the card ramp they already have. */
  styleEl.textContent = `html[data-look]:root {\n${body}\n}\n`
    + (pageRamp ? rule('html[data-look]:root .head [style*="var(--grey"], html[data-look]:root .page-ink', pageRamp) : '')
    + rule('html[data-look]:root .card.light', paleCardFor(l))
    + clearFlip(l, th, bg, rule);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = th.frame;
  /* Remembered on this computer too, so the next launch is drawn in it
     before the vault has even been read — no flash of the wrong theme. */
  /* A preview copy writes nothing anywhere, this included. */
  if (!window.__LEDGER_PREVIEW__) {
    try { localStorage.setItem(LAST_LOOK, JSON.stringify({ look: l, glass })); } catch { /* a convenience only */ }
  }
}

const LAST_LOOK = 'laminar:look';
/** The look this computer last showed, applied before anything is loaded. */
export function applyLastLook() {
  let last = null;
  try { last = JSON.parse(localStorage.getItem(LAST_LOOK) || 'null'); } catch { last = null; }
  applyLook(last?.look || DEFAULT_LOOK, { glass: false });
}

/* ---------- day and night ---------- */
/** Which saved look the clock asks for right now, or null. */
export function scheduledLook(schedule, saved, now = new Date()) {
  if (!schedule?.on) return null;
  const mins = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const t = now.getHours() * 60 + now.getMinutes();
  const day = mins(schedule.dayAt || '07:00'), night = mins(schedule.nightAt || '19:00');
  const isDay = day <= night ? t >= day && t < night : !(t >= night && t < day);
  const id = isDay ? schedule.day : schedule.night;
  return (saved || []).find(s => s.id === id) || null;
}
