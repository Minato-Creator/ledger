/* ============================================================
   accounts.js — the welcome: what a newcomer sees before there is an account.

   One long page on its own dark ground, whatever the look.

   The first screen is a picture (media/welcome/land.jpg) with a shadow
   rising from the bottom, and over it, arriving one after another: the
   welcome, the question, the two answers — a personal account or a prop
   firm one — and a hint that there is more below. Either answer opens the
   step-by-step set-up (acctnew.js) already on its own path.

   Scrolling on, it says in plain words how Laminar works, where the
   journal is kept (a folder on this computer, not a cloud), what it can
   find in your trades, and what else is in it. The name closes the page.

   Nobody sees the opening animation before this page (app.js): a first
   visit goes straight here. Once an account exists it is never shown
   again; accounts are added and listed in Settings → Accounts.
   ============================================================ */
import { el, icon, wordmarkSvg } from '../ui.js';
import { newAccount } from './acctnew.js';

const STEPS = [
  ['Add your account', 'A personal account or a prop firm one. Laminar keeps its balance, its rules and its trades apart from any other account you add.'],
  ['Log each trade', 'Entry, stop, target and exit, the setup and the session, how you felt, and a note. It takes a minute, and the chart of the trade is kept with it.'],
  ['Read what it tells you', 'Every number on the Dashboard and in Analytics comes from the trades you logged. The more you log, the clearer the picture gets.'],
];
const EDGE = ['Sessions', 'Setups', 'Entry timeframes', 'Days and hours', 'Instruments', 'Your own tags', 'Confidence and mood'];
const ALSO = [
  ['Calendar.', 'Every day, month and year at a glance, in money, percent or R.'],
  ['Review.', 'Go back over the week and write down what to keep and what to stop.'],
  ['Notes.', 'Your plan, your rules and your ideas, next to the trades they belong to.'],
  ['Replay.', 'Play a trade back on its chart, candle by candle.'],
];

export function accounts(store, nav) {
  const mark = el('span', { class: 'wl-mark', role: 'img', 'aria-label': 'Laminar' });
  mark.innerHTML = wordmarkSvg('currentColor');
  const kind = (path, ic, name, blurb) => el('button', { class: 'wl-kind', 'data-kind': path,
      onClick: () => newAccount(store, nav, { path }) },
    el('span', { class: 'wl-ico' }, icon(ic, 20, 'currentColor', 1.8)),
    el('b', {}, name), el('span', { class: 'wl-blurb' }, blurb),
    el('span', { class: 'wl-go' }, 'Set it up', icon('chevright', 12, 'currentColor', 2.2)));
  const two = (title, ...body) => el('div', { class: 'wl-two' }, el('h2', { class: 'wl-h' }, title), el('div', { class: 'wl-body' }, ...body));

  const more = el('section', { class: 'wl-more' },
    el('div', { class: 'wl-block' },
      el('div', { class: 'wl-rule' }, el('h2', { class: 'wl-h' }, 'How Laminar works'), el('span', {}, 'Three steps, and the third one does itself.')),
      el('div', { class: 'wl-steps' }, ...STEPS.map(([t, d], i) =>
        el('div', {}, el('i', {}, String(i + 1).padStart(2, '0')), el('b', {}, t), el('p', {}, d))))),
    two('Your journal stays on your computer',
      el('p', {}, 'Laminar saves your trades, notes and screenshots as ordinary files in a folder you choose. Nothing in your journal is uploaded, and there is no account to sign up for.'),
      el('p', {}, 'The folder is yours: back it up, move it to another computer, or open the files yourself. If you link a broker to bring trades in, Laminar only reads from it and can never place or change a trade.')),
    two('It finds your edge',
      el('p', {}, 'Laminar sorts your results by everything you logged, so you can see where your money is really made and where it leaks.'),
      el('div', { class: 'wl-chips' }, ...EDGE.map(x => el('span', {}, x)))),
    two('A journal you will keep using',
      el('div', { class: 'wl-four' }, ...ALSO.map(([t, d]) => el('p', {}, el('b', {}, t), ' ' + d)))));

  const scroller = el('div', { class: 'wl' },
    el('section', { class: 'wl-first' },
      el('img', { class: 'wl-pic', src: 'media/welcome/land.jpg', alt: '', draggable: 'false' }),
      el('div', { class: 'wl-shade' }),
      el('div', { class: 'wl-top' }, mark, el('span', { class: 'wl-motto' }, 'Your edge, in writing.')),
      el('div', { class: 'wl-row' },
        el('div', { class: 'wl-hello' },
          el('h1', { class: 'welcome-title' }, 'Welcome to Laminar'),
          el('p', { class: 'wl-q' }, 'Start with your first account. What kind is it?')),
        el('div', { class: 'wl-kinds' },
          kind('live', 'firms', 'Personal account', 'Your own money, at a broker.'),
          kind('prop', 'building', 'Prop firm', 'An evaluation or a funded account.'))),
      el('div', { class: 'wl-hintrow' },
        el('button', { class: 'wl-hint', onClick: () => more.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
          'Scroll to see how it works', icon('chevdown', 15, 'currentColor', 2)))),
    more,
    el('div', { class: 'wl-big', 'aria-hidden': 'true' }, 'LAMINAR'));
  return el('div', { class: 'view is-welcome' }, scroller);
}
