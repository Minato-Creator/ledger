/* A vault does not always arrive perfect. It can come from an older Ledger,
   from a write that was cut off, or from someone who unzipped it, edited the
   JSON by hand and zipped it again — which the format allows on purpose.
   None of those may take the app down, and none may lose more than the one
   thing that is actually broken. */
import pw from 'playwright';
import fsn from 'node:fs';
import { execFileSync } from 'node:child_process';
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


let pass=0, fail=0;
const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};

/* Build a vault zip from scratch, with whatever damage the case needs. */
const makeVault = (name, files) => {
  const dir = OUT + '/heal-' + name;
  fsn.rmSync(dir, { recursive: true, force: true });
  for (const [f, body] of Object.entries(files)) {
    const full = dir + '/' + f;
    fsn.mkdirSync(full.replace(/\/[^/]+$/, ''), { recursive: true });
    fsn.writeFileSync(full, body);
  }
  const zip = OUT + '/heal-' + name + '.zip';
  fsn.rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, '.'], { cwd: dir });
  return zip;
};

const ACCOUNTS = JSON.stringify({ version:2, displayUnit:'$', theme:'dark',
  accounts:[{id:'acc_1',name:'Prop 100k',currency:'USD',startingBalance:100000,
             defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,
             weeklyTargetPercent:2}], activeAccountId:'acc_1' });
const TRADE = (over={}) => ({ id:'t1',accountId:'acc_1',assetClass:'Futures',pair:'MGC',side:'buy',
  date:'2026-09-01',timeOpen:'09:10',timeClose:'10:00',riskPercent:1,netResult:900,
  entryPrice:4440,stopLoss:4430,exitPrice:4460,tagIds:['g1'],notes:'kept',
  setupId:null,sessionId:null, ...over });

const CASES = [
  { name: 'oldtags',
    why: 'a vault from before tags were grouped',
    files: {
      'vault.json': JSON.stringify({kind:'ledger-vault',version:1}),
      'data/accounts.json': ACCOUNTS,
      'data/trades.json': JSON.stringify({version:1,trades:[TRADE()]}),
      /* the shape Ledger used before tagGroups existed */
      'data/playbook.json': JSON.stringify({version:3,setups:[],
        tags:[{id:'g1',name:'A+ setup'},{id:'g2',name:'moved my stop'}],
        sessions:[],rules:{},replay:{}}),
    },
    expect: async (q) => {
      const r = await q.evaluate(async () => {
        const { store } = await import('/js/store.js');
        return { trades: store.trades.length,
                 groups: store.playbook.tagGroups.map(g => g.name),
                 tags: store.playbook.tagGroups.flatMap(g => g.tags).map(x => x.name) };
      });
      t('   the trade is there', r.trades === 1, JSON.stringify(r));
      t('   the old tags were kept, not thrown away', r.tags.join(',') === 'A+ setup,moved my stop', r.tags.join(','));
      t('   under one group', r.groups.length === 1, r.groups.join(','));
    } },

  { name: 'nogroups',
    why: 'a playbook with the tag list missing entirely',
    files: {
      'data/accounts.json': ACCOUNTS,
      'data/trades.json': JSON.stringify({version:1,trades:[TRADE()]}),
      'data/playbook.json': JSON.stringify({version:3,setups:[],sessions:[]}),
    },
    expect: async (q) => {
      const r = await q.evaluate(async () => {
        const { store } = await import('/js/store.js');
        return { trades: store.trades.length, groups: store.playbook.tagGroups.length,
                 rules: !!store.playbook.rules };
      });
      t('   the trade still opens', r.trades === 1, JSON.stringify(r));
      t('   the default groups are put back', r.groups === 3, String(r.groups));
      t('   and the missing rules with them', r.rules);
    } },

  { name: 'truncated',
    why: 'a playbook.json that was cut off half way',
    files: {
      'data/accounts.json': ACCOUNTS,
      'data/trades.json': JSON.stringify({version:1,trades:[TRADE()]}),
      'data/playbook.json': '{"version":3,"setups":[{"id":"s1","na',
    },
    expect: async (q, msg) => {
      const r = await q.evaluate(async () => {
        const { store } = await import('/js/store.js');
        return { trades: store.trades.length, groups: store.playbook.tagGroups.length };
      });
      t('   the trades survive the broken file', r.trades === 1, JSON.stringify(r));
      t('   and the playbook comes back as a default', r.groups === 3, String(r.groups));
      t('   it was not written over the journal silently', /could not be read/.test(msg), msg || '(no message)');
    } },

  { name: 'noid',
    why: 'a row with no id, which cannot be opened or deleted',
    files: {
      'data/accounts.json': ACCOUNTS,
      'data/trades.json': JSON.stringify({version:1,trades:[TRADE(), TRADE({id:undefined}), null]}),
      'data/playbook.json': JSON.stringify({version:3,setups:[],tagGroups:[],sessions:[]}),
    },
    expect: async (q) => {
      const r = await q.evaluate(async () => {
        const { store } = await import('/js/store.js');
        return { trades: store.trades.length, ids: store.trades.map(x => x.id) };
      });
      t('   the dead rows are dropped, the real one kept', r.trades === 1 && r.ids[0] === 't1', JSON.stringify(r));
    } },

  { name: 'notavault',
    why: 'a zip that is not a vault at all',
    files: { 'holiday.txt': 'photos of a beach' },
    refused: true },
];

const b = await pw.chromium.launch({ executablePath: CHROME });
for (const kase of CASES) {
  console.log(`\n  ${kase.why}`);
  const zip = makeVault(kase.name, kase.files);
  const ctx = await b.newContext({ viewport:{width:1400,height:900} });
  const q = await ctx.newPage();
  const errs = [];
  q.on('pageerror', e => errs.push(e.message));
  q.on('console', m => { if (m.type()==='error' && !/TUNNEL|fonts\.g|ERR_/.test(m.text())) errs.push(m.text()); });
  await q.addInitScript(() => { delete window.showDirectoryPicker; });
  await q.goto('http://127.0.0.1:8777/index.html', { waitUntil:'domcontentloaded' });
  await q.waitForTimeout(700);
  await q.evaluate(()=>{ location.hash = '#/settings/vault'; });
  await q.waitForTimeout(600);
  await q.setInputFiles('.main input[type=file][accept*=zip]', zip);
  await q.waitForTimeout(800);

  if (kase.refused) {
    const said = await q.evaluate(()=>document.body.innerText);
    t('   it is refused, with a reason', /not a Laminar vault/.test(said),
      (said.match(/not a Laminar vault[^\n]*/)||['(no reason given)'])[0]);
    t('   and nothing was written', await q.evaluate(async () => {
      const { store } = await import('/js/store.js'); return store.trades.length === 0; }));
    t('   no crash', errs.length === 0, errs.join(' | ') || 'clean');
    await ctx.close(); continue;
  }

  /* The toast is one reused element whose text is replaced, so it is watched
     from the moment Replace is clicked rather than read afterwards. */
  await q.evaluate(() => {
    window.__said = [];
    const seen = new MutationObserver(() => {
      const n = document.getElementById('toast');
      if (n && n.textContent) window.__said.push(n.textContent);
    });
    seen.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  const replace = await q.evaluate(()=>{ const x=[...document.querySelectorAll('.main button')]
    .find(b=>b.textContent.trim()==='Replace'); if (x) { x.click(); return true; } return false; });
  t('   it offers to restore', replace);
  await q.waitForTimeout(1600);
  const msg = await q.evaluate(()=>(window.__said||[]).join(' | ')
    || document.getElementById('toast')?.textContent || '');
  await kase.expect(q, msg);

  /* the real test of heal: every page draws */
  const broke = [];
  for (const h of ['#/', '#/trades', '#/calendar', '#/analytics', '#/playbook', '#/replay', '#/trade/t1', '#/new', '#/settings']) {
    await q.evaluate(x=>{ location.hash = x; }, h);
    await q.waitForTimeout(420);
    const drew = await q.evaluate(()=>!!document.querySelector('.view') && document.querySelector('.view').innerText.length > 8);
    if (!drew) broke.push(h);
  }
  t('   every page still draws', broke.length === 0 && errs.length === 0,
    [...broke, ...errs].join(' | ') || 'all nine pages, no errors');
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
