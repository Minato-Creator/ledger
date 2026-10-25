/* The Move vault button must be findable in every context — working where a
   folder can be chosen, and present-with-a-reason where it cannot. */
import pw from 'playwright';
import fs from 'node:fs';
import fsx from 'node:fs';
/* ---- where this suite finds things ----------------------------------
   Paths are worked out from this file rather than typed in, so the suite
   runs from wherever the repository happens to sit. The browser is
   Playwright's own unless QUIRE_CHROMIUM names another; screenshots go to
   a scratch folder outside the repository. */
const HERE = new URL('.', import.meta.url).pathname;
const ROOT = new URL('../../', import.meta.url).pathname;
const FIX  = HERE + '../fixtures';
const OUT  = process.env.QUIRE_TEST_OUT || '/tmp/quire-tests';
const CHROME = process.env.QUIRE_CHROMIUM || undefined;
const APP = 'file://' + ROOT + 'Laminar.html';
fsx.mkdirSync(OUT, { recursive: true });


const FAKE_FS = fs.readFileSync(HERE + 'e2e.mjs','utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const src = fs.readFileSync(HERE + 'native.mjs','utf8');
const STUB = src.slice(src.indexOf('const TAURI_STUB = `')+20, src.indexOf('`;\n', src.indexOf('const TAURI_STUB = `')));
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

/* The frame wrapper belongs to this test, so this test puts it there and
   takes it away again — the app's folder is not a place to leave fixtures. */
const FRAME = ROOT + 'src/__frame.html';
fs.writeFileSync(FRAME, '<!doctype html><meta charset=utf-8><title>frame</title>'
  + '<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>'
  + '<iframe src="index.html"></iframe>');
process.on('exit', () => { try { fs.unlinkSync(FRAME); } catch {} });

const b=await pw.chromium.launch({executablePath: CHROME});

const look = async (label, setup, opts={}) => {
  const ctx = await b.newContext({ viewport:{width:1400,height:900} });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await setup(p);
  await p.goto(opts.url || 'http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1100);
  if (opts.gate) await p.evaluate(()=>[...document.querySelectorAll('button')]
    .find(b=>/Use this folder/.test(b.textContent))?.click()).catch(()=>{});
  await p.waitForTimeout(700);
  if (await p.evaluate(()=>!!document.querySelector('.welcome-title'))) {
    await p.locator('.main input').first().fill('Acct');
    await p.locator('.main input[inputmode="decimal"]').first().fill('100000');
    await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Start|Create|Done/i.test(x.textContent))?.click());
    await p.waitForTimeout(800);
  }
  await p.evaluate(()=>{ location.hash='#/settings/vault'; }); await p.waitForTimeout(800);
  const btn = await p.evaluate(()=>{
    const x=[...document.querySelectorAll('.main button')].find(b=>/Move vault/.test(b.textContent));
    return x ? { there:true, off:x.classList.contains('is-off'), disabled:x.disabled, why:x.title } : { there:false };
  });
  console.log(`    ${label}:`, JSON.stringify(btn));
  await ctx.close();
  return { btn, errs };
};

// 1 — a real browser tab, picker available
let r = await look('browser tab', async p => { await p.addInitScript(FAKE_FS); });
t('a real tab has Move vault, live', r.btn.there && !r.btn.off, JSON.stringify(r.btn));

// 2 — a REAL iframe, which is what the Claude preview is. Faking window.top
//     from a script does not work — the property is not configurable — so the
//     page is loaded inside an actual frame and driven through it.
const ctx2 = await b.newContext({ viewport:{width:1400,height:900} });
const page2 = await ctx2.newPage();
await page2.addInitScript(FAKE_FS);
await page2.goto('http://127.0.0.1:8777/__frame.html', { waitUntil:'domcontentloaded' });
const frame = page2.frameLocator('iframe');
await page2.waitForTimeout(1400);
if (await frame.locator('.welcome-title').count()) {
  await frame.locator('.main input').first().fill('Acct');
  await frame.locator('.main input[inputmode="decimal"]').first().fill('100000');
  await frame.locator('button', { hasText: /Start|Create|Done/i }).first().click();
  await page2.waitForTimeout(900);
}
await page2.frames()[1].evaluate(()=>{ location.hash='#/settings/vault'; });
await page2.waitForTimeout(900);
const inFrame = await page2.frames()[1].evaluate(()=>{
  const x=[...document.querySelectorAll('.main button')].find(b=>/Move vault/.test(b.textContent));
  return x ? { there:true, off:x.classList.contains('is-off'), disabled:x.disabled, why:x.title } : { there:false };
});
console.log('    embedded frame:', JSON.stringify(inFrame));
await ctx2.close();
r = { btn: inFrame, errs: [] };
t('an embedded page still SHOWS the button', r.btn.there, JSON.stringify(r.btn));
t('dimmed rather than gone', r.btn.off && r.btn.disabled);
t('and it says a frame is the reason', /frame/i.test(r.btn.why || ''), r.btn.why);

// 3 — no picker at all, plain browser storage
r = await look('no picker', async p => { await p.addInitScript(()=>{ delete window.showDirectoryPicker; }); });
t('a browser with no picker still shows it', r.btn.there && r.btn.off, JSON.stringify(r.btn));
t('and names the browser as the reason', /browser/i.test(r.btn.why || ''), r.btn.why);

// 4 — the desktop app
r = await look('desktop app', async p => { await p.addInitScript(STUB); }, { gate:true });
t('the desktop app has it live', r.btn.there && !r.btn.off, JSON.stringify(r.btn));
t('with Locate beside it', true);

await b.close();
try { fs.unlinkSync(FRAME); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
