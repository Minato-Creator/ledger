/* A season of trading with habits in it, for the Ghost page: Fridays that
   cost money, a third trade after two losses that usually loses, a revenge
   tag that always does, and a London session that pays. Seeded, so the same
   trades every time. */
export const ACCT = { id: 'acc_1', name: 'Funded 100k', currency: 'USD', startingBalance: 100000, defaultRiskPercent: 1,
  color: '#0988F0', openedAt: '2026-06-01', archived: false, weeklyTargetPercent: 0 };
export const PB = { version: 4,
  setups: [{ id: 's_fvg', name: 'FVG continuation', color: '#0988F0', rules: [] }, { id: 's_sweep', name: 'Liquidity sweep', color: '#18AC65', rules: [] }],
  sessions: [{ id: 'ses_l', name: 'London', start: '15:00', end: '19:00' }, { id: 'ses_n', name: 'New York', start: '20:00', end: '23:59' }],
  tagGroups: [{ id: 'g_m', name: 'Mistakes', tags: [{ id: 'tg_rev', name: 'Revenge trade' }, { id: 'tg_early', name: 'Early entry' }] },
              { id: 'g_q', name: 'Quality', tags: [{ id: 'tg_a', name: 'A+' }] }],
  rules: {}, replay: { windowMins: 15, csvClock: 'local' } };

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function makeTrades(seed = 42) {
  const rand = rng(seed);
  const out = [];
  let n = 0;
  const start = Date.UTC(2026, 5, 1);                   // Mon 1 June 2026
  for (let d = 0; d < 7 * 16; d++) {
    const day = new Date(start + d * 864e5);
    const dow = (day.getUTCDay() + 6) % 7;
    if (dow > 4 || rand() < 0.25) continue;
    const date = day.toISOString().slice(0, 10);
    const count = 1 + Math.floor(rand() * 4);
    let losses = 0;
    for (let i = 0; i < count; i++) {
      const london = rand() < 0.6;
      const revenge = losses >= 2;
      let p = london ? 0.52 : 0.4;                       // chance of a win
      if (dow === 4) p -= 0.2;                           // Fridays
      if (revenge) p = 0.15;
      const win = rand() < p;
      const r = win ? +(1.5 + rand() * 1.5).toFixed(2) : -1;
      if (!win) losses++;
      const hh = london ? 15 + i : 20 + Math.min(i, 3);
      out.push({ id: 'g' + (++n), accountId: 'acc_1', date, timeOpen: `${String(hh).padStart(2, '0')}:${String(5 + i * 7).padStart(2, '0')}`,
        timeClose: `${String(hh).padStart(2, '0')}:${String(40 + i).padStart(2, '0')}`, pair: rand() < 0.6 ? 'XAUUSD' : 'NAS100', side: 'buy',
        netResult: r * 1000, riskPercent: 1, status: 'closed', mode: 'live',
        sessionId: london ? 'ses_l' : 'ses_n', setupId: rand() < 0.5 ? 's_fvg' : 's_sweep',
        tagIds: [...(revenge ? ['tg_rev'] : []), ...(win && rand() < 0.4 ? ['tg_a'] : [])], notes: '' });
    }
  }
  return out;
}
