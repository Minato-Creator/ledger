/* ============================================================
   lookhelp.mjs — driving the Appearance sheet from a suite.

   Suites that need the app in the dark, a colour changed or a picture
   behind it go through the sheet the way a person does: the picture in the
   top bar (which opens Settings), Appearance, the tab, the choice, Escape —
   and then back to the page the suite was on, so it can flip the theme and
   keep checking that page.

   Not a suite itself — run.sh skips it by name.
   ============================================================ */
const wait = (p, ms) => p.waitForTimeout(ms);

let back = null;
export async function openLook(p, tab) {
  const open = await p.evaluate(() => !!document.querySelector('.sheet.is-look'));
  if (!open) {
    const here = await p.evaluate(() => location.hash || '#/');
    if (here !== '#/settings') {
      back = here;
      await p.evaluate(() => document.querySelector('.tb-you')?.click());
      await wait(p, 450);
    }
    await p.evaluate(() => document.querySelector('.st-row[data-row="Appearance"]')?.click());
    await wait(p, 550);
  }
  if (tab) {
    await p.evaluate(t => document.querySelector(`.lk-tabs [data-tab="${t}"]`)?.click(), tab);
    await wait(p, 300);
  }
}

export async function closeLook(p) {
  if (await p.evaluate(() => !!document.querySelector('.sheet.is-look'))) {
    await p.keyboard.press('Escape');
    await wait(p, 450);
  }
  if (back) {
    const to = back; back = null;
    await p.evaluate(h => { location.hash = h; }, to);
    await wait(p, 500);
  }
}

/** 'dark' is Midnight, 'light' is Light; any theme id works too. */
export async function setTheme(p, which) {
  const id = which === 'dark' ? 'midnight' : which === 'light' ? 'light' : which;
  await openLook(p, 'themes');
  await p.evaluate(t => document.querySelector(`.lk-theme[data-theme-id="${t}"]`)?.click(), id);
  await wait(p, 750);
  await closeLook(p);
}

/** which: 'profit' | 'loss' | 'flat'; name: a palette name ('Purple', 'Orange', 'White' …). */
export async function pickColour(p, which, name) {
  const label = which === 'profit' ? 'Win' : which === 'loss' ? 'Loss' : 'Break-even';
  await openLook(p, 'money');
  await p.evaluate(l => [...document.querySelectorAll('.lk-money-b')].find(b => b.querySelector('b')?.textContent === l)?.click(), label);
  await wait(p, 250);
  await p.evaluate(n => document.querySelector(`.lk-pal[aria-label="${n}"]`)?.click(), name);
  await wait(p, 550);
  await closeLook(p);
}

/** The palette names on offer for money colours, in order. */
export async function paletteNames(p) {
  await openLook(p, 'money');
  await p.evaluate(() => [...document.querySelectorAll('.lk-money-b')].find(b => b.querySelector('b')?.textContent === 'Win')?.click());
  await wait(p, 250);
  const names = await p.evaluate(() => [...document.querySelectorAll('.lk-pal')].map(b => b.getAttribute('aria-label')));
  await closeLook(p);
  return names;
}

/** '' (None) or a background's name ('Torii', 'Moon', 'Topography'…). */
export async function pickBackground(p, name) {
  await openLook(p, 'custom');
  await p.evaluate(n => [...document.querySelectorAll('.lk-bg')].find(b => (n ? b.title === n : b.classList.contains('is-none')))?.click(), name);
  await wait(p, 650);
  await closeLook(p);
}

export async function backgroundNames(p) {
  await openLook(p, 'custom');
  const names = await p.evaluate(() => [...document.querySelectorAll('.lk-bg:not(.is-add)')].map(b => b.title));
  await closeLook(p);
  return names;
}

export async function setGlass(p, on) {
  await openLook(p, 'custom');
  /* false: Solid · true: Frosted · 'clear': Clear */
  await p.evaluate(on => [...document.querySelectorAll('.lk-seg button')].find(b => b.textContent === (on === 'clear' ? 'Clear' : on ? 'Frosted' : 'Solid'))?.click(), on);
  await wait(p, 550);
  await closeLook(p);
}
