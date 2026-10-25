/* The calendar strip: real feed shape, the day's own timezone, what happens
   when the feed cannot be reached, and that nothing is fetched behind your
   back. */
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
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

/* Rows copied from the real feed, offsets and all. Perth is +8, New York -04
   in September, so these land on the days a Perth trader would see them. */
const FEED = JSON.stringify([
  { title:'Bank Holiday', country:'JPY', date:'2026-09-20T19:00:00-04:00', impact:'Holiday', forecast:'', previous:'' },
  { title:'Rightmove HPI m/m', country:'GBP', date:'2026-09-20T19:01:00-04:00', impact:'Low', forecast:'', previous:'-2.0%' },
  { title:'Employment Change', country:'AUD', date:'2026-09-23T21:30:00-04:00', impact:'High', forecast:'25.3K', previous:'-5.4K' },
  { title:'Unemployment Rate', country:'AUD', date:'2026-09-23T21:30:00-04:00', impact:'High', forecast:'4.3%', previous:'4.2%' },
  { title:'SNB Policy Rate', country:'CHF', date:'2026-09-24T03:30:00-04:00', impact:'High', forecast:'0.00%', previous:'0.00%' },
  { title:'Some Medium Thing', country:'USD', date:'2026-09-24T08:30:00-04:00', impact:'Medium', forecast:'', previous:'' },
]);

const b=await pw.chromium.launch({executablePath: CHROME});

const open = async ({ feed, fail: shouldFail, tz='Australia/Perth' }) => {
  const ctx = await b.newContext({ viewport:{width:1500,height:950}, timezoneId: tz });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(()=>{
    if (localStorage.getItem('fakefs')) return;
    localStorage.setItem('fakeroot','V');
    localStorage.setItem('fakefs', JSON.stringify([
      ['data/accounts.json', JSON.stringify({version:2,displayUnit:'R',theme:'dark',
        accounts:[{id:'acc_1',name:'topstep',currency:'USD',startingBalance:100000,defaultRiskPercent:1,
                   color:'#18AC65',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
      ['data/trades.json', JSON.stringify({version:1,trades:[]})],
    ]));
  });
  /* The browser branch: the page fetches the feed itself. Stubbed at the
     network, not at window.__TAURI__ — setting that would send the whole app
     down the desktop path and it would not boot against this fake disk. The
     desktop branch is one invoke() call, covered by the Rust tests and by the
     native case at the end of this file. */
  await p.addInitScript(({ feed, shouldFail }) => {
    window.__fetches = 0;
    const real = window.fetch.bind(window);
    window.fetch = async (url, opts) => {
      const u = String(url && url.url ? url.url : url);
      if (!/faireconomy/.test(u)) return real(url, opts);
      window.__fetches++;
      window.__lastUrl = u;
      if (shouldFail) throw new TypeError('Failed to fetch');
      return new Response(feed, { status: 200, headers: { 'content-type': 'application/json' } });
    };
  }, { feed, shouldFail: !!shouldFail });
  await p.addInitScript(FAKE_FS);
  await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('.topbar',{timeout:8000});
  return { p, ctx, errs };
};

const stripText = p => p.evaluate(()=>document.querySelector('.news-strip')?.innerText.replace(/\n/g,' | ') || '(no strip)');

// ---------- the happy path, on a day with two red folders
let { p, ctx, errs } = await open({ feed: FEED });
await p.evaluate(()=>{ location.hash='#/outlook/2026-09-24'; }); await p.waitForTimeout(1600);
let s = await stripText(p);
console.log('    24 Sep:', s);
t('the strip is on the Outlook page', !/no strip/.test(s));
t('it went to the right feed', /ff_calendar_thisweek\.json$/.test(await p.evaluate(()=>window.__lastUrl)),
  await p.evaluate(()=>window.__lastUrl));

const rows = await p.evaluate(()=>[...document.querySelectorAll('.ns-ev')].map(n=>n.innerText.replace(/\n/g,' ')));
console.log('    rows:', JSON.stringify(rows));
/* Three, not two: the SNB print at 03:30 New York is 15:30 in Perth, so it
   lands on this day as well. */
t('only red folders and holidays are kept', rows.length===3, String(rows.length));
t('and the Swiss print is on this day too, at Perth time',
  rows.some(r=>/CHF/.test(r) && /15:30/.test(r)), JSON.stringify(rows));
t('the medium print is not shown', !rows.some(r=>/Medium Thing/.test(r)));
t('the low print is not shown', !rows.some(r=>/Rightmove/.test(r)));

/* 2026-09-23T21:30-04:00 is 2026-09-24 09:30 in Perth. If the timezone were
   being ignored this would read 21:30 and sit on the 23rd. */
t('an event is shown on YOUR day, at YOUR time',
  rows.some(r=>/AUD/.test(r) && /Employment Change/.test(r) && /09:30/.test(r)), JSON.stringify(rows));
t('and both AUD prints land together', rows.filter(r=>/09:30/.test(r)).length===2);

// ---------- the holiday, on its own day
await p.evaluate(()=>{ location.hash='#/outlook/2026-09-21'; }); await p.waitForTimeout(900);
const hol = await p.evaluate(()=>({ reds: [...document.querySelectorAll('.ns-ev')].length, line: document.querySelector('.ns-hol')?.innerText.replace(/\n/g,' ') || '' }));
console.log('    21 Sep:', JSON.stringify(hol));
t('a bank holiday shows on the local day it starts — on its own line, not as a red folder', hol.reds===0 && /Bank holiday/i.test(hol.line) && /Japan/.test(hol.line), JSON.stringify(hol));
t('and the red folder count leaves it out', await p.evaluate(()=>/none today/.test(document.querySelector('.ns-head').innerText)));

// ---------- a quiet day
await p.evaluate(()=>{ location.hash='#/outlook/2026-09-22'; }); await p.waitForTimeout(900);
t('a day with nothing says so', /Nothing high-impact/.test(await stripText(p)), await stripText(p));

// ---------- it does not re-fetch on every page view
const n1 = await p.evaluate(()=>window.__fetches);
await p.evaluate(()=>{ location.hash='#/outlook/2026-09-24'; }); await p.waitForTimeout(700);
await p.evaluate(()=>{ location.hash='#/outlook/2026-09-23'; }); await p.waitForTimeout(700);
const n2 = await p.evaluate(()=>window.__fetches);
t('a fresh copy is reused, not re-fetched', n2 === n1, `${n1} then ${n2}`);

// ---------- but refresh does
await p.evaluate(()=>document.querySelector('.ns-refresh').click()); await p.waitForTimeout(900);
t('refresh actually asks again', await p.evaluate(()=>window.__fetches) === n2 + 1);

// ---------- it survives a restart, from the vault
const saved = await p.evaluate(()=>{ try { return JSON.parse(window.__files.get('data/news.json')); } catch { return null; } });
t('the calendar is kept in the vault', !!saved && saved.events.length===4, JSON.stringify(saved?.events?.length));
t('with the moment it was fetched', !!saved.fetchedAt, saved?.fetchedAt);
t('no errors', errs.length===0, errs.join(' | ')||'clean');
await p.evaluate(()=>{ location.hash='#/outlook/2026-09-24'; }); await p.waitForTimeout(800);
await p.screenshot({ path:OUT + '/news.png' });
await ctx.close();

// ---------- when the feed cannot be reached
({ p, ctx, errs } = await open({ feed: FEED, fail: true }));
await p.evaluate(()=>{ location.hash='#/outlook/2026-09-24'; }); await p.waitForTimeout(1600);
s = await stripText(p);
console.log('    offline:', s);
t('a failure says so plainly', /could not reach Forex Factory/i.test(s), s);
t('and does not pretend the day is quiet', !/Nothing high-impact/.test(s), s);
t('nothing crashed', errs.length===0, errs.join(' | ')||'clean');
await ctx.close();

// ---------- a different timezone reads the same instant differently
({ p, ctx, errs } = await open({ feed: FEED, tz:'America/New_York' }));
await p.evaluate(()=>{ location.hash='#/outlook/2026-09-23'; }); await p.waitForTimeout(1600);
const ny = await p.evaluate(()=>[...document.querySelectorAll('.ns-ev')].map(n=>n.innerText.replace(/\n/g,' ')));
console.log('    New York, 23 Sep:', JSON.stringify(ny));
t('in New York the same event reads 21:30 on the 23rd',
  ny.some(r=>/Employment Change/.test(r) && /21:30/.test(r)), JSON.stringify(ny));
await ctx.close();

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
