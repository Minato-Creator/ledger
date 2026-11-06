/* ============================================================
   oandakey.js — the Charts card in Settings: your OANDA key.

   The key is kept on this computer — the desktop app's own settings file, or
   this browser — and never in the vault, so a backup you hand to someone
   does not hand them your key too.
   ============================================================ */
import { el, toast } from '../ui.js';
import { isTauri, fs } from '../fs.js';
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

/* ---------- optional: a Finnhub key, for live stock prices on Plan → Markets ----------
   Without one the Stocks tab reads Stooq, which needs nothing but can lag or
   say no. With one, the quotes come from Finnhub instead — nothing else
   changes. Kept on this computer like the OANDA key, never in the vault. */
const FINNHUB = 'https://finnhub.io/register';
export function finnhubKeyCard() {
  let saved = null, busy = false;
  const input = el('input', { type: 'password', placeholder: 'Paste a Finnhub key (optional)', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Finnhub key',
    onInput: () => paint() });
  const status = el('div', { class: 'ok-status' });
  const saveBtn = el('button', { class: 'btn btn-quiet fh-save', onClick: save }, 'Save');
  const removeBtn = el('button', { class: 'btn btn-quiet fh-remove', onClick: remove }, 'Remove');
  const say = (text, tone = '') => { status.className = 'ok-status' + (tone ? ' is-' + tone : ''); status.replaceChildren(el('i'), el('span', {}, text)); };
  const line = () => (saved ? say('Saved · the Stocks tab uses Finnhub’s live quotes', 'good') : say('No key · the Stocks tab uses Stooq, which can lag'));
  const ok = v => /^[A-Za-z0-9]{10,80}$/.test(v);
  function paint() { const v = input.value.trim(); saveBtn.disabled = busy || !ok(v) || v === saved; removeBtn.disabled = busy || !saved; }
  /* what Markets kept of the stocks is asked for again next time, from wherever the key now says */
  const stale = () => { try { localStorage.removeItem('laminar:markets:stocks'); } catch { /* nothing kept */ } };
  async function save() {
    busy = true; paint();
    try { await fs.setSetting('finnhubKey', input.value.trim()); saved = input.value.trim(); stale(); line(); toast('Finnhub key saved'); }
    catch (e) { say('Could not save the key: ' + (e.message || e), 'bad'); }
    busy = false; paint();
  }
  async function remove() {
    busy = true; paint();
    await fs.setSetting('finnhubKey', null); saved = null; input.value = ''; stale(); line(); toast('Finnhub key removed');
    busy = false; paint();
  }
  async function openSignup() {
    if (isTauri()) { try { await navigator.clipboard.writeText(FINNHUB); toast('Link copied — paste it into your browser'); } catch { toast(FINNHUB); } }
    else window.open(FINNHUB, '_blank', 'noopener');
  }
  const card = el('section', { class: 'card ok-card fh-card', style: { flex: 'none' } },
    el('h2', {}, 'Stock prices (optional)'),
    el('div', { class: 'ok-note' },
      'Plan → Markets reads stock prices from Stooq without any sign-up; they can lag, and Stooq sometimes says no. A free key from ',
      el('a', { href: FINNHUB, onClick: e => { e.preventDefault(); openSignup(); } }, 'finnhub.io'),
      ' makes them live. Kept on this computer, never in the vault.'),
    el('div', { class: 'ok-row' }, el('div', { class: 'ok-field' }, input)),
    el('div', { class: 'ok-row' }, saveBtn, removeBtn),
    status);
  paint(); say('…');
  fs.getSetting('finnhubKey').then(k => { saved = k || null; if (k) input.value = k; line(); paint(); });
  return card;
}
