/* An open trade has to survive the backup round trip, or the backup loses it. */
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
const b=await pw.chromium.launch({executablePath: CHROME});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let pass=0, fail=0; const t=(n,c,x='')=>{c?pass++:fail++;console.log(`  ${c?'ok  ':'FAIL'}  ${n}${x?' — '+x:''}`);};
const trades=[
  {id:'c1',accountId:'acc_1',assetClass:'Futures',pair:'MGC',side:'buy',date:'2026-09-01',timeOpen:'09:10',timeClose:'10:00',
   riskPercent:1,netResult:900,entryPrice:4440,stopLoss:4430,exitPrice:4460,tagIds:[],notes:'done',setupId:null,sessionId:null},
  {id:'o1',accountId:'acc_1',assetClass:'Indices',pair:'MNQ',side:'sell',date:'2026-09-11',timeOpen:'22:05',timeClose:null,
   riskPercent:0.75,netResult:null,entryPrice:20100,stopLoss:20160,takeProfit:19900,exitPrice:null,
   tagIds:[],notes:'runner',setupId:null,sessionId:null,status:'open'},
];
await p.addInitScript(({trades})=>{
  localStorage.setItem('fakeroot','BK');
  localStorage.setItem('fakefs', JSON.stringify([
    ['data/accounts.json', JSON.stringify({version:2,displayUnit:'$',theme:'dark',accounts:[{id:'acc_1',name:'Prop 100k',currency:'USD',startingBalance:100000,defaultRiskPercent:1,color:'#0988F0',openedAt:'2026-09-01',archived:false,weeklyTargetPercent:0}],activeAccountId:'acc_1'})],
    ['data/trades.json', JSON.stringify({version:1,trades})],
  ]));
},{trades});
await p.addInitScript(FAKE_FS);
await p.goto('http://127.0.0.1:8777/index.html',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.topbar');

const csv = await p.evaluate(async () => {
  const { toCSV } = await import('/js/csv.js');
  const { store } = await import('/js/store.js');
  return toCSV(store);
});
const header = csv.split('\n')[0];
t('the export declares a status column', /,status,mode(,|$)/.test(header), header.split(',').slice(-3).join(','));
const rows = csv.trim().split('\n').slice(1).map(l => l.split(','));
const openRow = rows.find(r => r.includes('MNQ'));
const closedRow = rows.find(r => r.includes('MGC'));
const statusAt = r => r[header.split(',').indexOf('status')];
t('the closed trade says closed', statusAt(closedRow) === 'closed', statusAt(closedRow));
t('the open trade says open', statusAt(openRow) === 'open', statusAt(openRow));
t('and both say live, since neither was a test',
  [closedRow, openRow].every(r => r[header.split(',').indexOf('mode')] === 'live'));
const cols = header.split(',');
const at = (row, name) => row[cols.indexOf(name)];
t('and exports no result for it', at(openRow,'netResult') === '', JSON.stringify(at(openRow,'netResult')));
t('no R either', at(openRow,'rMultiple') === '');
t('and no outcome', at(openRow,'outcome') === '');
t('but it keeps the stop and target', at(openRow,'stopLoss') === '20160' && at(openRow,'takeProfit') === '19900');

// the importer can read the sheet back: the closed trade comes through with
// its money, the open one has no close to pair with and is reported, not invented
const back = await p.evaluate(async (text) => {
  const { parseBrokerCSV } = await import('/js/broker.js');
  const out = parseBrokerCSV(text);
  const by = Object.fromEntries(out.trades.map(x => [x.pair, x]));
  return { ok: out.ok, n: out.trades.length, pairs: Object.keys(by),
           closed: by.MGC ? { pnl: by.MGC.pnl, exit: by.MGC.exitPrice } : null,
           open: by.MNQ ? { pnl: by.MNQ.pnl, exit: by.MNQ.exitPrice } : null };
}, csv);
console.log('   ', JSON.stringify(back));
t('the closed trade reads back with its money', back.ok && back.closed?.pnl === 900, JSON.stringify(back.closed));
t('and the open one brings back no money it never made',
  back.open === null || (back.open.pnl == null && back.open.exit == null), JSON.stringify(back.open));

// a sheet written before the status column existed still reads
const legacy = csv.split('\n').map(l => l.replace(/,(open|closed)$/, '')).join('\n')
  .replace(',status', '');
const old = await p.evaluate(async (text) => {
  const { parseCSV } = await import('/js/csv.js');
  const { parseBrokerCSV } = await import('/js/broker.js');
  return { statuses: parseCSV(text).map(r => r.status), ok: parseBrokerCSV(text).ok };
}, legacy);
t('an older sheet has no status field', old.statuses.every(x => x === undefined || x === ''));
t('and still reads', old.ok === true);
console.log(errs.length?'\nERRORS:\n'+errs.join('\n'):'\nno errors');
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
