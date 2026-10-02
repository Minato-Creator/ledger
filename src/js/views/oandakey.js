/* ============================================================
   oandakey.js — the Charts card in Settings: your OANDA key.

   The key is kept on this computer — the desktop app's own settings file, or
   this browser — and never in the vault, so a backup you hand to someone
   does not hand them your key too.
   ============================================================ */
import { el, toast } from '../ui.js';
import { isTauri } from '../fs.js';
import { getKey, setKey, testKey, explain } from '../candles.js';

const SIGNUP = 'https://www.oanda.com/';

export function oandaKeyCard() {
  let live = false, shown = false, busy = false;
  const input = el('input', { type: 'password', placeholder: 'Paste your OANDA key', spellcheck: 'false',
    autocomplete: 'off', 'aria-label': 'OANDA key', onInput: () => paintButtons() });
  const showBtn = el('button', { onClick: () => { shown = !shown; input.type = shown ? 'text' : 'password'; showBtn.textContent = shown ? 'Hide' : 'Show'; } }, 'Show');
  const accountSwitch = el('div', { class: 'ok-switch', style: { marginLeft: 'auto' } });
  const status = el('div', { class: 'ok-status' });
  const saveBtn = el('button', { class: 'btn btn-quiet ok-save', onClick: save }, 'Save');
  const testBtn = el('button', { class: 'btn btn-quiet ok-test', onClick: test }, 'Test');
  const removeBtn = el('button', { class: 'btn btn-quiet ok-remove', onClick: remove }, 'Remove');
  let saved = null;

  function paintSwitch() {
    accountSwitch.replaceChildren(...[[false, 'Demo'], [true, 'Live']].map(([v, label]) =>
      el('button', { class: live === v ? 'is-on' : '', 'data-live': v ? '1' : '0',
        onClick: () => { live = v; paintSwitch(); paintButtons(); } }, label)));
  }
  function paintButtons() {
    const typed = input.value.trim();
    const changed = typed !== (saved?.key || '') || (!!typed && live !== !!saved?.live);
    saveBtn.disabled = busy || !typed || !changed;
    testBtn.disabled = busy || !typed;
    removeBtn.disabled = busy || !saved;
  }
  function say(text, tone = '') {
    status.className = 'ok-status' + (tone ? ' is-' + tone : '');
    status.replaceChildren(el('i'), el('span', {}, text));
  }
  const stateLine = () => saved
    ? say(`Saved · ${saved.live ? 'live' : 'demo'} key · trade pages show the day’s chart`, 'good')
    : say('No key yet · trade pages show no chart');

  async function save() {
    busy = true; paintButtons();
    try {
      await setKey(input.value.trim(), live);
      saved = await getKey();
      stateLine(); toast('OANDA key saved');
    } catch (e) { say('Could not save the key: ' + (e.message || e), 'bad'); }
    busy = false; paintButtons();
  }
  async function test() {
    busy = true; paintButtons(); say('Asking OANDA…');
    try {
      const ok = await testKey({ key: input.value.trim(), live });
      ok ? say(`Working — OANDA answered with prices${input.value.trim() === saved?.key ? '' : ' · not saved yet'}`, 'good')
         : say('OANDA answered, but with no prices.', 'bad');
    } catch (e) { say(explain(e), 'bad'); }
    busy = false; paintButtons();
  }
  async function remove() {
    busy = true; paintButtons();
    await setKey(null);
    saved = null; input.value = ''; live = false;
    paintSwitch(); stateLine(); toast('OANDA key removed');
    busy = false; paintButtons();
  }
  async function openSignup() {
    if (isTauri()) {
      try { await navigator.clipboard.writeText(SIGNUP); toast('Link copied — paste it into your browser'); }
      catch { toast(SIGNUP); }
    } else window.open(SIGNUP, '_blank', 'noopener');
  }

  const card = el('section', { class: 'card ok-card', style: { flex: 'none' } },
    el('h2', {}, 'Charts'),
    el('div', { class: 'ok-note' },
      'Trade pages draw the day’s chart from OANDA, with your own free key — from a demo account at ',
      el('a', { href: SIGNUP, onClick: e => { e.preventDefault(); openSignup(); } }, 'oanda.com'),
      ', under Manage API Access. Kept on this computer, never in the vault.'),
    el('div', { class: 'ok-row' }, el('div', { class: 'ok-field' }, input, showBtn)),
    el('div', { class: 'ok-row' },
      el('span', { class: 'm', style: { fontSize: '11.5px', color: 'var(--grey-5)' } }, 'Account'),
      accountSwitch),
    el('div', { class: 'ok-row' }, saveBtn, testBtn, removeBtn),
    status);

  paintSwitch(); paintButtons(); say('…');
  getKey().then(k => {
    saved = k;
    if (k) { input.value = k.key; live = !!k.live; paintSwitch(); }
    stateLine(); paintButtons();
  });
  return card;
}
