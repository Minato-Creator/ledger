/* ============================================================
   "If held" — what a trade would have made had it been left alone.

   Asked only of a trade that did not run its course: closed by hand, or
   marked closed early or moved to break-even early. Three answers — it
   would have hit target (a win, for how many R), come back to break-even
   (0R) or hit the stop (a loss, for how many R) — kept on the trade as
   `heldOutcome` and a signed `heldR`.

   New trade asks it under the exit reason; the weekly review asks it again
   for a trade that was missed. The Ghost uses the answer for "leave trades
   to TP", and the trade page shows it.
   The answer's arithmetic (heldAsked, heldOf, heldText) is in
   questions.js; this file is only the editor.
   ============================================================ */
import { el } from '../ui.js';
import { HELD } from '../questions.js';

/**
 * The editor: Win / BE / Loss, and how many R. `value` is
 * `{ outcome, r }` (r signed) or null; `onChange` gets the same shape back,
 * or null when it is cleared. Picking the chosen answer again clears it. A
 * loss starts at 1R, the stop; a win waits for a number.
 */
export function heldEditor(value, onChange) {
  let outcome = value?.outcome ?? null;
  let text = value && value.outcome !== 'be' && value.r != null ? String(+Math.abs(value.r).toFixed(2)) : '';
  const chips = el('div', { class: 'exit-reasons held-chips', role: 'group', 'aria-label': 'If held' });
  const sign = el('span', { class: 'held-sign' });
  const input = el('input', { class: 'field held-r', inputmode: 'decimal', placeholder: '0', 'aria-label': 'R if held', value: text,
    onInput: e => { text = e.target.value; emit(); } });
  const num = el('label', { class: 'held-num' }, sign, input, el('span', { class: 'held-unit' }, 'R'));
  const box = el('div', { class: 'held' }, chips, num);

  function r() {
    if (outcome === 'be') return 0;
    const n = Math.abs(parseFloat(String(text).replace(',', '.')));
    if (!isFinite(n)) return null;
    return outcome === 'win' ? n : -n;
  }
  function emit() { onChange(outcome ? { outcome, r: r() } : null); }
  function paint() {
    chips.replaceChildren(...HELD.map(([k, name]) => el('button', { type: 'button', class: 'xr is-held-' + k + (outcome === k ? ' is-on' : ''),
      onClick: () => {
        outcome = outcome === k ? null : k;
        if (outcome === 'loss' && !text) { text = '1'; input.value = '1'; }
        paint(); emit();
        if (outcome === 'win' && !text) input.focus();
      } }, name)));
    num.hidden = outcome == null || outcome === 'be';
    sign.textContent = outcome === 'loss' ? '−' : '+';
    box.className = 'held' + (outcome ? ' is-' + outcome : '');
  }
  paint();
  return box;
}
