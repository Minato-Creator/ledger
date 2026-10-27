/* ============================================================
   glide.js — the sliding highlight, for the choices the page redraw
   does not cover.

   shell.js's segGlide slides the pill on the bars the whole app redraws
   (the top bar, the tabs, $/%/R, 7D…All). The rest — the chart's
   timeframes, the share sheet, the trade form's single-choice chips, the
   Add account Stage, the Appearance tiles, any switch inside a sheet —
   update themselves in place or redraw only their own corner, so nothing
   was moving there.

   This watches for a press on a button in one of those groups and
   remembers where the chosen one was. Once the click has done its work
   (straight away, or a moment later after a save), it finds the group
   again — the same element, or the one now drawn in its place — and a
   pill in the chosen one's own colour travels from the old place to the
   new. Motion off, or a group the page redraw already glides: nothing.
   ============================================================ */

const GROUPS = '.tc-seg, .tv-seg, .rv-seg, .sh-seg, .exit-reasons:not(.mistakes), .lk-opts, .sheet .seg, .sheet .unit-switch, .popover .seg';
const still = () => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;

let pending = null;

export function initGlide() {
  document.addEventListener('pointerdown', e => {
    pending = null;
    if (still() || e.button !== 0) return;
    const btn = e.target.closest?.('button');
    const g = btn?.parentElement;
    if (!g || !g.matches(GROUPS)) return;
    const on = g.querySelector(':scope > .is-on');
    if (!on || on === btn) return;
    const gr = g.getBoundingClientRect();
    pending = { g, old: on, from: on.getBoundingClientRect(), idx: [...g.children].indexOf(btn), at: [gr.left + gr.width / 2, gr.top + gr.height / 2], kind: g.className.split(' ')[0] };
  }, true);
  document.addEventListener('click', () => {
    if (!pending) return;
    const p = pending; pending = null;
    const t0 = performance.now();
    const look = () => {
      const g = find(p);
      const on = g?.querySelector(':scope > .is-on');
      if (g && on && [...g.children].indexOf(on) === p.idx) {
        /* the old choice, if it is the same button, loses its fill at once rather than fading under the pill */
        if (p.old.isConnected && p.old !== on) { p.old.style.transition = 'none'; requestAnimationFrame(() => requestAnimationFrame(() => { p.old.style.transition = ''; })); }
        return slide(g, on, p.from);
      }
      if (performance.now() - t0 < 600) requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  }, true);
}

/* the group the press was in: still there, or the one drawn where it was */
function find(p) {
  if (p.g.isConnected) return p.g;
  const hit = document.elementFromPoint(p.at[0], p.at[1])?.closest(GROUPS);
  return hit && hit.classList.contains(p.kind) ? hit : null;
}

/**
 * Slide a pill dressed exactly like `on` (the newly chosen button) from
 * `from` (a viewport rect: where the old choice was) to `on`, under the
 * buttons. Exactly like it, so nothing changes look at either end, and at
 * the end the button's own fill comes back with its transition held off for
 * that frame — otherwise it faded in from nothing as the pill went, which
 * read as a twitch. Shared with shell.js's segGlide.
 */
export function slidePill(g, on, from) {
  if (g.querySelector(':scope > .seg-pill')) return;
  /* read its finished look, not a fade on its way in */
  on.style.transition = 'none';
  const cs = getComputedStyle(on);
  const unhold = () => requestAnimationFrame(() => { on.style.transition = ''; });
  const clear = c => !c || c === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(c);
  if (clear(cs.backgroundColor) && (!cs.boxShadow || cs.boxShadow === 'none') && (!cs.backgroundImage || cs.backgroundImage === 'none')) return unhold();
  const gr = g.getBoundingClientRect(), to = on.getBoundingClientRect();
  if (Math.abs(to.left - from.left) < 1 && Math.abs(to.top - from.top) < 1) return unhold();
  const ox = gr.left + g.clientLeft - g.scrollLeft, oy = gr.top + g.clientTop - g.scrollTop;
  const pill = document.createElement('span');
  pill.className = 'seg-pill glide-pill';
  Object.assign(pill.style, { borderRadius: cs.borderRadius, background: cs.background || cs.backgroundColor, boxShadow: cs.boxShadow || 'none' });
  const put = r => {
    pill.style.transform = `translate(${(r.left - ox).toFixed(2)}px, ${(r.top - oy).toFixed(2)}px)`;
    pill.style.width = r.width + 'px'; pill.style.height = r.height + 'px';
  };
  put(from);
  g.classList.add('is-gliding', 'has-glide');
  g.prepend(pill);
  void pill.offsetWidth;
  pill.classList.add('go');
  put(to);
  let done = false;
  const end = () => {
    if (done) return; done = true;
    g.classList.remove('is-gliding');
    void on.offsetWidth;
    pill.remove();
    g.classList.remove('has-glide');
    unhold();
  };
  pill.addEventListener('transitionend', e => { if (e.propertyName === 'transform') end(); });
  setTimeout(end, 420);
}
const slide = slidePill;
