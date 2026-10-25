/* Served from a real address, as a stranger meets it: no gate, no picker,
   straight into the app — and the folder still available to anyone who wants it. */
import pw from 'playwright';
import nfs from 'node:fs';
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

const { chromium } = pw;

const FAKE_FS = nfs.readFileSync(HERE + 'e2e.mjs','utf8').match(/const FAKE_FS = `([\s\S]*?)`;/)[1];
const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g/.test(m.text())) errs.push(m.text()); });
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(900);
t('the picker exists in this browser', await p.evaluate(() => 'showDirectoryPicker' in window));
t('no folder gate', await p.evaluate(() => !document.querySelector('.gate')));
t('straight to the welcome form', /Welcome to Laminar/.test(await p.evaluate(()=>document.body.innerText)));

await p.evaluate(() => {
  const i=[...document.querySelectorAll('input')];
  i[0].value='Prop 100k'; i[0].dispatchEvent(new Event('input',{bubbles:true}));
  i[1].value='100000'; i[1].dispatchEvent(new Event('input',{bubbles:true}));
});
await p.waitForTimeout(150);
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Create/.test(x.textContent)).click());
await p.waitForTimeout(900);
t('account made', /Prop 100k/.test(await p.evaluate(()=>document.querySelector('.topbar').innerText)));
const keys = await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ledger:file:')));
t('written to browser storage', keys.includes('ledger:file:data/accounts.json'), keys.join(','));

await p.evaluate(()=>location.hash='#/settings'); await p.waitForTimeout(450);
t('the Settings list warns where it lives, one level up', /saved inside this browser/i.test(await p.evaluate(()=>document.querySelector('.st-row[data-row="Vault & data"]')?.innerText || '')));
await p.evaluate(()=>location.hash='#/settings/vault'); await p.waitForTimeout(450);
const st = await p.evaluate(()=>document.querySelector('.main').innerText);
t('settings says where it lives', /saved inside this browser/.test(st));
t('offers the folder as an upgrade', /Keep it in a folder instead/.test(st));
/* The head pill is gone: the Vault card is the only place that owns the
   folder now, so the offer lives there and nowhere else. */
t('the head no longer duplicates it', await p.evaluate(()=>![...document.querySelectorAll('.head button')].some(x=>/folder/i.test(x.textContent))));
t('and the Vault card offers the move', /Move vault/.test(st), (st.match(/Move vault/)||['(absent)'])[0]);

// reload: still there, still no gate
await p.reload({ waitUntil:'domcontentloaded' }); await p.waitForTimeout(800);
t('survives a reload with no gate', await p.evaluate(()=>!document.querySelector('.gate') && !!document.querySelector('.topbar')));

// the folder upgrade carries the journal across
await p.evaluate(async () => { const { store } = await import('/js/store.js'); window.__MOVED__ = await store.connect(); });
await p.waitForTimeout(600);
t('the move succeeded', await p.evaluate(()=>window.__MOVED__ === true));
const carried = await p.evaluate(()=>[...window.__files.keys()]);
t('the journal came with it', carried.some(k=>/accounts\.json/.test(k)), carried.join(', '));
const acctText = await p.evaluate(()=>[...window.__files.entries()].find(([k])=>/accounts\.json/.test(k))[1]);
t('and the account is intact', /Prop 100k/.test(acctText));

console.log(errs.length?'\nERRORS:\n'+errs.join('\n'):'\nno errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
