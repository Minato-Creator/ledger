/* The first account, made the way a newcomer makes it: from the welcome, Personal account,
   through the step-by-step set-up. Used by the suites that only need an account to exist.

   firstAccount(page, 'Main', '100000', { risk: '0.75' }) */
export async function firstAccount(page, name, balance, { risk = null, broker = 'oanda' } = {}) {
  await page.waitForSelector('.wl-kind[data-kind="live"]', { timeout: 8000 });
  await page.click('.wl-kind[data-kind="live"]');
  await page.waitForSelector(`.aw-btile[data-firm="${broker}"]`, { timeout: 5000 });
  await page.click(`.aw-btile[data-firm="${broker}"]`);
  await page.waitForSelector('.ab-sizein', { timeout: 5000 });
  /* the step settles (its focus, the firm's logo) a moment after it appears; a name typed before that
     can be painted over by the suggested one, so type once it is still and check it stuck */
  await page.waitForTimeout(200);
  for (let i = 0; i < 3; i++) {
    await page.fill('.ab-namein', name);
    await page.fill('.ab-sizein', String(balance));
    await page.waitForTimeout(120);
    if (await page.evaluate(n => document.querySelector('.ab-namein')?.value === n, name)) break;
  }
  if (risk != null) {
    await page.evaluate(() => { document.querySelector('.aw-more').open = true; });
    await page.fill('.aw-more input[aria-label="Risk a trade %"]', String(risk));
  }
  await page.click('.ab-go');                                   // Continue
  await page.waitForFunction(() => /Create account/.test(document.querySelector('.ab-go')?.textContent || ''), null, { timeout: 5000 });
  await page.click('.ab-go');                                   // Create account
  await page.waitForSelector('.topbar', { timeout: 8000 });
  await page.waitForTimeout(300);
}
