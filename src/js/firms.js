/* ============================================================
   firms.js — prop firms, their rules and their fine print.

   Researched from each firm's own help centre on 2 October 2026, with
   independent guides filling gaps (those rules are marked "Fine print").
   Firms change their rules often, so every firm carries the date it was
   checked and links to where each rule came from. Trust is Quire's own
   rating — years running, payout record, how often rules change, and
   reported payout disputes — not the firm's. Prices are list prices in
   USD unless a program says otherwise; discounts are common.

   Generated: edit the source files and rebuild rather than this by hand.
   ============================================================ */
export const CHECKED = '2026-10-02';

export const FIRMS = [
 {
  "id": "topstep",
  "name": "Topstep",
  "mono": "TS",
  "market": "futures",
  "since": 2012,
  "hq": "Chicago, USA",
  "instruments": "CME · COMEX · NYMEX · CBOT",
  "platforms": "TopstepX · NinjaTrader · Tradovate · TradingView · Quantower",
  "maxAccounts": "up to 5 Express Funded accounts",
  "rulesUrl": "https://help.topstep.com/en/articles/8284197-trading-combine-parameters",
  "programs": [
   {
    "id": "combine",
    "name": "Trading Combine",
    "pricing": "monthly",
    "note": "Monthly until you pass, then a one-time $149 activation for each Express Funded account.",
    "sizes": [
     {
      "label": "50K",
      "balance": 50000,
      "price": 49,
      "activation": 149,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "EOD trailing",
      "lock": "locks at your $50,000 starting balance",
      "dailyLoss": null,
      "dailyNote": "optional · $1,000 if chosen",
      "maxSize": "5 minis / 50 micros",
      "minDays": 2,
      "consistency": "best day < 55% of target"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 99,
      "activation": 149,
      "target": 6000,
      "maxLoss": 3000,
      "maxLossType": "EOD trailing",
      "lock": "locks at your $100,000 starting balance",
      "dailyLoss": null,
      "dailyNote": "optional · $2,000 if chosen",
      "maxSize": "10 minis / 100 micros",
      "minDays": 2,
      "consistency": "best day < 55% of target"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": 199,
      "activation": 149,
      "target": 9000,
      "maxLoss": 4500,
      "maxLossType": "EOD trailing",
      "lock": "locks at your $150,000 starting balance",
      "dailyLoss": null,
      "dailyNote": "optional · $3,000 if chosen",
      "maxSize": "15 minis / 150 micros",
      "minDays": 2,
      "consistency": "best day < 55% of target"
     }
    ],
    "stages": [
     {
      "tag": "Evaluation",
      "name": "Trading Combine",
      "bullets": [
       "Hit the target without touching max loss",
       "Best day under 55% of the target",
       "Pass in as few as 2 days"
      ]
     },
     {
      "tag": "Funded · sim",
      "name": "Express Funded",
      "bullets": [
       "$149 activation on standard pricing",
       "Size grows with the balance (scaling plan)",
       "Paid 90% of profit"
      ]
     },
     {
      "tag": "Real money",
      "name": "Live Funded",
      "bullets": [
       "Only 20% of the balance to start",
       "Daily loss limit becomes mandatory",
       "Closed if the balance drops below $1,000"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Standard",
      "sub": "easier to qualify",
      "cap": "$2K / $3K / $5K by size",
      "needs": "5 winning days of $150+",
      "max": "50% of balance",
      "split": "90 / 10"
     },
     {
      "name": "Consistency",
      "sub": "bigger payouts",
      "cap": "$3K / $4K / $6K by size",
      "needs": "3 days · best ≤ 40%",
      "max": "50% of balance",
      "split": "90 / 10"
     }
    ]
   },
   {
    "id": "nofee",
    "name": "Trading Combine · No activation fee",
    "pricing": "monthly",
    "note": "Same Combine and rules, a higher monthly price, and no activation fee when you pass.",
    "sizes": [
     {
      "label": "50K",
      "balance": 50000,
      "price": 95,
      "activation": 0,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "EOD trailing",
      "lock": "locks at your $50,000 starting balance",
      "dailyLoss": null,
      "dailyNote": "optional · $1,000 if chosen",
      "maxSize": "5 minis / 50 micros",
      "minDays": 2,
      "consistency": "best day < 55% of target"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 149,
      "activation": 0,
      "target": 6000,
      "maxLoss": 3000,
      "maxLossType": "EOD trailing",
      "lock": "locks at your $100,000 starting balance",
      "dailyLoss": null,
      "dailyNote": "optional · $2,000 if chosen",
      "maxSize": "10 minis / 100 micros",
      "minDays": 2,
      "consistency": "best day < 55% of target"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": 229,
      "activation": 0,
      "target": 9000,
      "maxLoss": 4500,
      "maxLossType": "EOD trailing",
      "lock": "locks at your $150,000 starting balance",
      "dailyLoss": null,
      "dailyNote": "optional · $3,000 if chosen",
      "maxSize": "15 minis / 150 micros",
      "minDays": 2,
      "consistency": "best day < 55% of target"
     }
    ],
    "stages": [
     {
      "tag": "Evaluation",
      "name": "Trading Combine",
      "bullets": [
       "Hit the target without touching max loss",
       "Best day under 55% of the target",
       "Pass in as few as 2 days"
      ]
     },
     {
      "tag": "Funded · sim",
      "name": "Express Funded",
      "bullets": [
       "No activation fee",
       "Size grows with the balance (scaling plan)",
       "Paid 90% of profit"
      ]
     },
     {
      "tag": "Real money",
      "name": "Live Funded",
      "bullets": [
       "Only 20% of the balance to start",
       "Daily loss limit becomes mandatory",
       "Closed if the balance drops below $1,000"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Standard",
      "sub": "easier to qualify",
      "cap": "$2K / $3K / $5K by size",
      "needs": "5 winning days of $150+",
      "max": "50% of balance",
      "split": "90 / 10"
     },
     {
      "name": "Consistency",
      "sub": "bigger payouts",
      "cap": "$3K / $4K / $6K by size",
      "needs": "3 days · best ≤ 40%",
      "max": "50% of balance",
      "split": "90 / 10"
     }
    ]
   }
  ],
  "rules": [
   {
    "sev": "danger",
    "title": "Unrealised loss counts",
    "sub": "max loss is watched live, all day",
    "why": "Your floor moves at the close, but it is <em>checked every tick</em>. A trade that dips to it and recovers still fails the account.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No full size into the news",
    "sub": "prohibited strategy",
    "why": "Going in with your <em>whole max position</em> right before a scheduled release (NFP, CPI, FOMC) is banned and can cost you the account or the payout.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Flat by 3:10 pm Chicago",
    "sub": "4:10 am Perth · 5:10 am after 1 Nov",
    "why": "No holding overnight or over the weekend. Anything open at the close is <em>closed for you</em>, at whatever price it gets.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "After a payout, the floor is $0",
    "sub": "Express Funded",
    "why": "Once you are paid, the max loss <em>locks at $0</em>: your buffer is only what you left in the account. Withdraw it all and one bad day ends it.",
    "src": "Fine print"
   },
   {
    "sev": "danger",
    "title": "No account stacking",
    "sub": "prohibited strategy",
    "why": "Trading aggressively until one account hits its max loss, then <em>moving to the next</em>, is banned.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "A big day moves the goalposts",
    "sub": "consistency, 55% of target",
    "why": "It will not fail you, but a <em>$2,000 day</em> on a $3,000 target means you need more total profit before you pass.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Contract limits can shrink",
    "sub": "high-volatility adjustments",
    "why": "When a market goes wild, Topstep can <em>cut your max contracts</em> on it (crude was 3 / 6 / 9) or halt minis, with little notice.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "They can reject profits",
    "sub": "sim exploitation",
    "why": "Hundreds or thousands of trades a day, or anything that games the simulator: Topstep <em>keeps the right to refuse</em> the profit.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "30 days quiet, account gone",
    "sub": "Express Funded",
    "why": "No trade for more than 30 days and the funded account <em>may be closed</em>. Live accounts get 90.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "Copy trading is allowed",
    "sub": "up to 5 Express accounts",
    "why": "Copy one trade across your accounts up to <em>$750K buying power</em>, but never hedge one account against another.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "Live starts small",
    "sub": "Live Funded",
    "why": "Only <em>20% of the balance</em> is yours to trade at first; the rest unlocks as you make $3K / $6K / $9K.",
    "src": "Fine print"
   }
  ],
  "take": {
   "pros": [
    "Longest-running futures firm, since 2012",
    "End-of-day drawdown that locks at your starting balance",
    "Daily loss limit is optional, not forced",
    "90/10 split with two payout paths",
    "Rules written down clearly in one help centre"
   ],
   "watch": [
    "The floor is checked every tick, even though it moves at the close",
    "Monthly fee keeps running until you pass",
    "After a payout the floor sits at $0, so keep a buffer",
    "Must be flat by 3:10 pm Chicago (4:10 am Perth)",
    "Live accounts start with only 20% of the balance"
   ],
   "verdict": "The safest name in futures for a disciplined day trader; plan around the tick-checked max loss and the monthly fee."
  },
  "sources": [
   "https://help.topstep.com/en/articles/14289835-topstep-pricing-and-payment-questions",
   "https://help.topstep.com/en/articles/8284197-trading-combine-parameters",
   "https://help.topstep.com/en/articles/8284215-express-funded-account-parameters",
   "https://help.topstep.com/en/articles/10305426-prohibited-trading-strategies-at-topstep",
   "https://help.topstep.com/en/articles/13613539-risk-adjustments-high-risk-high-volatility",
   "https://tradetanto.com/learn/topstep-rules",
   "https://propfirmaudit.com/education/topstep-rules-explained-2026"
  ],
  "trust": 5,
  "trustpilot": {
   "score": 3.6,
   "reviews": 14881
  },
  "trustWhy": "Longest-running futures firm. Review score is pulled down by strict rules, not missed payouts.",
  "rank": 1
 },
 {
  "id": "mffu",
  "name": "MyFundedFutures",
  "mono": "MF",
  "market": "futures",
  "since": 2023,
  "hq": "Texas, USA",
  "instruments": "CME · CBOT · NYMEX · COMEX (incl. micro BTC/ETH)",
  "platforms": "Tradovate · NinjaTrader · TradingView · Quantower · DeepCharts",
  "maxAccounts": "up to 5 sim-funded accounts (3 if any is 100K/150K); 10 evals",
  "rulesUrl": "https://help.myfundedfutures.com/en/",
  "programs": [
   {
    "id": "rapid",
    "name": "Rapid",
    "pricing": "one-time",
    "note": "Daily payouts at 90/10; EOD drawdown in the eval, intraday trailing once funded.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": 145,
      "activation": 0,
      "target": 1500,
      "maxLoss": 1000,
      "maxLossType": "intraday trailing",
      "lock": "eval locks at $25,100; funded locks at +$100",
      "dailyLoss": null,
      "maxSize": "3 minis / 30 micros",
      "minDays": 2,
      "consistency": "eval: best day ≤ 50% of profit; none funded"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 209,
      "activation": 0,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "intraday trailing",
      "lock": "eval locks at $50,100; funded locks at +$100",
      "dailyLoss": null,
      "maxSize": "5 minis / 50 micros",
      "minDays": 2,
      "consistency": "eval: best day ≤ 50% of profit; none funded"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 356,
      "activation": 0,
      "target": 6000,
      "maxLoss": 3000,
      "maxLossType": "intraday trailing",
      "lock": "eval locks at $100,100; funded locks at +$100",
      "dailyLoss": null,
      "maxSize": "8 minis / 80 micros",
      "minDays": 2,
      "consistency": "eval: best day ≤ 50% of profit; none funded"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": 463,
      "activation": 0,
      "target": 9000,
      "maxLoss": 4500,
      "maxLossType": "intraday trailing",
      "lock": "eval locks at $150,100; funded locks at +$100",
      "dailyLoss": null,
      "maxSize": "10 minis / 100 micros",
      "minDays": 2,
      "consistency": "eval: best day ≤ 50% of profit; none funded"
     }
    ],
    "stages": [
     {
      "tag": "Evaluation",
      "name": "Rapid Evaluation",
      "bullets": [
       "Hit 6% target in at least 2 days",
       "EOD trailing drawdown, no daily loss limit",
       "Best day must be ≤ 50% of profit"
      ]
     },
     {
      "tag": "Funded",
      "name": "Rapid Sim Funded",
      "bullets": [
       "Drawdown trails intraday, locks at +$100",
       "No consistency rule; Tier 1 news banned",
       "Daily payouts once the buffer is cleared"
      ]
     },
     {
      "tag": "Live",
      "name": "Rapid Live",
      "bullets": [
       "Automatic at a $10K day, or by approval",
       "Up to $5K of sim profit held in reserve",
       "EOD drawdown live; 90/10 daily payouts"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Sim Funded payout",
      "sub": "every 24 hours",
      "cap": "none stated",
      "needs": "clear buffer, $500 minimum request",
      "max": "daily, no stated cap",
      "split": "90 / 10"
     },
     {
      "name": "Rapid Live payout",
      "sub": "after live transfer",
      "cap": "none stated",
      "needs": "$10K day or risk-team approval",
      "max": "daily requests",
      "split": "90 / 10"
     }
    ]
   },
   {
    "id": "pro",
    "name": "Pro",
    "pricing": "one-time",
    "note": "Bigger 14-day payouts (up to $100K per cycle) with EOD drawdown and no funded DLL; 80/20.",
    "sizes": [
     {
      "label": "50K",
      "balance": 50000,
      "price": 265,
      "activation": 0,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "EOD trailing",
      "lock": "locks at $50,100; static after 1st payout",
      "dailyLoss": null,
      "maxSize": "5 minis",
      "minDays": 2,
      "consistency": "eval: best day ≤ 50% of profit; none funded"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 401,
      "activation": 0,
      "target": 6000,
      "maxLoss": 3000,
      "maxLossType": "EOD trailing",
      "lock": "locks at $100,100; static after 1st payout",
      "dailyLoss": null,
      "maxSize": "10 minis",
      "minDays": 2,
      "consistency": "eval: best day ≤ 50% of profit; none funded"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": 557,
      "activation": 0,
      "target": 9000,
      "maxLoss": 4500,
      "maxLossType": "EOD trailing",
      "lock": "locks at $150,100; static after 1st payout",
      "dailyLoss": null,
      "maxSize": "15 minis",
      "minDays": 2,
      "consistency": "eval: best day ≤ 50% of profit; none funded"
     }
    ],
    "stages": [
     {
      "tag": "Evaluation",
      "name": "Pro Evaluation",
      "bullets": [
       "Hit 6% target in at least 2 days",
       "EOD trailing drawdown, no daily loss limit",
       "Best day must be ≤ 50% of profit"
      ]
     },
     {
      "tag": "Funded",
      "name": "Pro Sim Funded",
      "bullets": [
       "EOD drawdown, no DLL, no consistency rule",
       "First payout 14 days after first trade",
       "Floor goes static after the first payout"
      ]
     },
     {
      "tag": "Live",
      "name": "Pro Live",
      "bullets": [
       "Offered after 3 consecutive payouts",
       "Funded $2K–$10K with a daily loss limit",
       "Start balance unlocks after 20 winning days"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Sim Funded payout",
      "sub": "every 14 days",
      "cap": "$100,000 per cycle",
      "needs": "clear buffer, $1,000 minimum request",
      "max": "up to $100K per cycle",
      "split": "80 / 20"
     },
     {
      "name": "Pro Live payout",
      "sub": "after 3 payouts",
      "cap": "none stated",
      "needs": "3 consecutive sim payouts",
      "max": "$250 minimum request",
      "split": null
     }
    ]
   }
  ],
  "rules": [
   {
    "sev": "danger",
    "title": "Rapid funded drawdown goes intraday",
    "sub": "Rapid sim-funded accounts",
    "why": "Once funded, Rapid's max loss <em>trails your equity high-water mark intraday</em>, including open profit, until it locks at +$100. Giving back a big open winner can breach.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Flat for Tier 1 news",
    "sub": "Rapid and Pro funded",
    "why": "No positions or orders, even resting limits, <em>from 2 minutes before to 2 minutes after</em> FOMC, CPI, jobs report and similar releases.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No hedging of any kind",
    "sub": "all plans and stages",
    "why": "Long and short on the same underlying is banned, and <em>ES vs MES or NQ vs MNQ counts</em> as the same underlying. Prohibited-practice profits are confiscated.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No stacking minis and micros",
    "sub": "cross-instrument policy",
    "why": "Mixing contracts to get past your size limit, e.g. 2 minis plus 20 micros, may fill but <em>is treated as a breach</em>.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Flat by 4:10 PM ET",
    "sub": "no overnight holds",
    "why": "Positions auto-close at 4:10 PM ET on normal days, but <em>on holidays nothing auto-closes</em> and an open position breaches the account.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "2% price-limit rule",
    "sub": "sim and live funded",
    "why": "You may not trade when a product is <em>within 2% of its CME price limit</em>; for equity index futures trading stops at 5% overnight moves.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "7 days idle can close account",
    "sub": "one-time purchases since 25 Aug",
    "why": "On accounts bought from 25 August 2026, <em>no trade for 7 calendar days</em> can close the eval or funded account. Ask support before holidays.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "A $10K day forces live",
    "sub": "Rapid sim funded",
    "why": "A $10,000 single-day profit moves you to live automatically, and <em>profit above $10,000 that day is forfeited</em>. Up to $5K goes into a reserve.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Live breach means 21-day freeze",
    "sub": "Rapid and Builder live",
    "why": "If a live account is closed, sim trading and new purchases are <em>blocked for 21 days</em>, and only 50–80% of the sim buffer is withdrawable.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Eval consistency rule",
    "sub": "Rapid/Pro 50%, Rapid EOD 30%",
    "why": "No single day can exceed 50% of eval profit (30% on Rapid EOD). Breaking it does not fail you; you <em>must keep trading more days</em>.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Broad prohibited-conduct discretion",
    "sub": "terms of use",
    "why": "MFFU can decide <em>at its own discretion</em> what counts as prohibited conduct and withhold payouts; HFT, sim-fill exploits, copying other traders and shared devices are named.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "Account caps",
    "sub": "evals and sim-funded",
    "why": "Up to 10 active evals and 5 sim-funded accounts, <em>dropping to 3 if any is 100K or 150K</em>. Builder and Rapid EOD have lower plan caps.",
    "src": "Official"
   }
  ],
  "take": {
   "pros": [
    "No activation fees, and new evals are one-time with no renewals",
    "Rapid pays daily at 90/10 once the buffer is cleared",
    "No daily loss limit on Rapid or Pro",
    "No consistency rule once funded on Rapid and Pro",
    "Detailed official help centre, updated through August 2026"
   ],
   "watch": [
    "Rapid's funded drawdown switches to intraday trailing that counts open profit",
    "Tier 1 news: be fully flat two minutes either side when funded",
    "Seven days without a trade can close accounts bought after 25 August",
    "A $10K day forces live and profit above $10K is forfeited",
    "Hedging ES vs MES, or stacking minis and micros, breaches the account"
   ],
   "verdict": "Suits disciplined intraday traders who want cheap one-off evals and fast daily payouts; poor fit for news traders or overnight holders."
  },
  "sources": [
   "https://myfundedfutures.com/plans/rapid",
   "https://myfundedfutures.com/plans/pro",
   "https://myfundedfutures.com/plans/builder",
   "https://myfundedfutures.com/terms",
   "https://help.myfundedfutures.com/en/articles/14116402-rapid-plan-25k-a-comprehensive-look",
   "https://help.myfundedfutures.com/en/articles/13134709-rapid-plan-50k-a-comprehensive-look",
   "https://help.myfundedfutures.com/en/articles/13286542-rapid-plan-100k-a-comprehensive-look",
   "https://help.myfundedfutures.com/en/articles/13286582-rapid-plan-150k-a-comprehensive-look",
   "https://help.myfundedfutures.com/en/articles/13134718-understanding-rapid-live",
   "https://help.myfundedfutures.com/en/articles/13286746-rapid-plan-reserve-program-performance-bonus-structure",
   "https://help.myfundedfutures.com/en/articles/11802674-pro-plan-sim-funded-and-live-account-highlights",
   "https://help.myfundedfutures.com/en/articles/14290805-builder-plan-50k-a-comprehensive-guide",
   "https://help.myfundedfutures.com/en/articles/8528339-understanding-evaluation-parameters-at-myfundedfutures",
   "https://help.myfundedfutures.com/en/articles/8348565-end-of-day-eod-drawdown-explained",
   "https://help.myfundedfutures.com/en/articles/11994562-consistency-rule-at-my-fundedfutures",
   "https://help.myfundedfutures.com/en/articles/13745661-payout-policy-overview-best-and-fastest-prop-firm-payouts",
   "https://help.myfundedfutures.com/en/articles/8444599-fair-play-and-prohibited-trading-practices",
   "https://help.myfundedfutures.com/en/articles/12011241-hedging-what-you-should-know",
   "https://help.myfundedfutures.com/en/articles/8230009-news-trading-policy",
   "https://help.myfundedfutures.com/en/articles/9698984-2-price-limit-rule",
   "https://help.myfundedfutures.com/en/articles/10244682-cross-instrument-policy",
   "https://help.myfundedfutures.com/en/articles/16498635-moving-from-evaluation-to-sim-funded-account",
   "https://help.myfundedfutures.com/en/articles/16596524-inactivity-rule-one-time-payment-model",
   "https://help.myfundedfutures.com/en/articles/16596406-understanding-the-difference-between-account-resets-and-renewals",
   "https://help.myfundedfutures.com/en/articles/9558251-permitted-times-to-trade",
   "https://help.myfundedfutures.com/en/articles/9735811-futures-instrument-list",
   "https://help.myfundedfutures.com/en/articles/8230018-can-someone-else-trade-my-account",
   "https://phidiaspropfirm.com/education/myfundedfutures-discount-code",
   "https://propfirmmatch.com/futures/prop-firms/my-funded-futures",
   "https://proptradingvibes.com/blog/myfundedfutures-rules-overview",
   "https://thetrustedprop.com/prop-firms/my-funded-futures"
  ],
  "trust": 4.5,
  "trustpilot": {
   "score": 4.9,
   "reviews": 22086
  },
  "trustWhy": "Top-rated on a very large number of reviews; one-time fees, no activation.",
  "rank": 2
 },
 {
  "id": "apex",
  "name": "Apex Trader Funding",
  "mono": "AP",
  "market": "futures",
  "since": 2021,
  "hq": "Austin, USA",
  "instruments": "CME · CBOT · NYMEX · COMEX",
  "platforms": "Rithmic · Tradovate · WealthCharts · NinjaTrader",
  "maxAccounts": "up to 20 Performance Accounts",
  "rulesUrl": "https://apextraderfunding.com/help-center/",
  "programs": [
   {
    "id": "eod",
    "name": "EOD Trailing Drawdown",
    "pricing": "one-time",
    "note": "Floor moves only on end-of-day balance; has a daily loss limit that pauses trading.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": null,
      "activation": null,
      "target": 1500,
      "maxLoss": 1000,
      "maxLossType": "EOD trailing",
      "lock": "PA locks at $25,100",
      "dailyLoss": 500,
      "maxSize": "4 minis / 40 micros",
      "minDays": 1,
      "consistency": "eval none; PA best day < 50% per payout"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": null,
      "activation": null,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "EOD trailing",
      "lock": "PA locks at $50,100",
      "dailyLoss": 1000,
      "maxSize": "6 minis / 60 micros",
      "minDays": 1,
      "consistency": "eval none; PA best day < 50% per payout"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": null,
      "activation": null,
      "target": 6000,
      "maxLoss": 3000,
      "maxLossType": "EOD trailing",
      "lock": "PA locks at $100,100",
      "dailyLoss": 1500,
      "maxSize": "8 minis / 80 micros",
      "minDays": 1,
      "consistency": "eval none; PA best day < 50% per payout"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": null,
      "activation": null,
      "target": 9000,
      "maxLoss": 4000,
      "maxLossType": "EOD trailing",
      "lock": "PA locks at $150,100",
      "dailyLoss": 2000,
      "maxSize": "12 minis / 120 micros",
      "minDays": 1,
      "consistency": "eval none; PA best day < 50% per payout"
     }
    ],
    "stages": [
     {
      "tag": "Evaluation",
      "name": "EOD Evaluation",
      "bullets": [
       "Hit target within 30 days; no minimum days",
       "EOD floor, plus a daily loss pause",
       "No consistency rule in the evaluation"
      ]
     },
     {
      "tag": "Funded",
      "name": "Performance Account (PA)",
      "bullets": [
       "Pay activation fee within 7 days of passing",
       "Contracts start small and scale with profit",
       "Safety net of drawdown + $100 stays locked"
      ]
     },
     {
      "tag": "Live",
      "name": "Apex Live",
      "bullets": [
       "Invitation only, at Apex's discretion",
       "$0 start, $3,000 EOD drawdown, 3 minis",
       "90/10 split, daily payout requests"
      ]
     }
    ],
    "payouts": [
     {
      "name": "PA payout",
      "sub": "up to weekly",
      "cap": "$1,000–$5,000 per payout by size",
      "needs": "5 qualifying days, 50% consistency",
      "max": "6 payouts, then PA closes",
      "split": "100 / 0"
     },
     {
      "name": "Live payout",
      "sub": "invite only",
      "cap": "none stated",
      "needs": "selected by Apex",
      "max": "daily, $500 minimum",
      "split": "90 / 10"
     }
    ]
   },
   {
    "id": "intraday",
    "name": "Intraday Trailing Drawdown",
    "pricing": "one-time",
    "note": "Cheaper option; floor trails open profit in real time; no daily loss limit in the eval.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": null,
      "activation": null,
      "target": 1500,
      "maxLoss": 1000,
      "maxLossType": "intraday trailing",
      "lock": "PA locks at $25,100",
      "dailyLoss": null,
      "maxSize": "4 minis / 40 micros",
      "minDays": 1,
      "consistency": "eval none; PA best day < 50% per payout"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": null,
      "activation": null,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "intraday trailing",
      "lock": "PA locks at $50,100",
      "dailyLoss": null,
      "maxSize": "6 minis / 60 micros",
      "minDays": 1,
      "consistency": "eval none; PA best day < 50% per payout"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": null,
      "activation": null,
      "target": 6000,
      "maxLoss": 3000,
      "maxLossType": "intraday trailing",
      "lock": "PA locks at $100,100",
      "dailyLoss": null,
      "maxSize": "8 minis / 80 micros",
      "minDays": 1,
      "consistency": "eval none; PA best day < 50% per payout"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": null,
      "activation": null,
      "target": 9000,
      "maxLoss": 4000,
      "maxLossType": "intraday trailing",
      "lock": "PA locks at $150,100",
      "dailyLoss": null,
      "maxSize": "12 minis / 120 micros",
      "minDays": 1,
      "consistency": "eval none; PA best day < 50% per payout"
     }
    ],
    "stages": [
     {
      "tag": "Evaluation",
      "name": "Intraday Evaluation",
      "bullets": [
       "Hit target within 30 days; no minimum days",
       "Floor trails open profit in real time",
       "No daily loss limit, no consistency rule"
      ]
     },
     {
      "tag": "Funded",
      "name": "Performance Account (PA)",
      "bullets": [
       "Pay activation fee within 7 days of passing",
       "Tiered daily loss limit and contract scaling",
       "Floor stops trailing at start + $100"
      ]
     },
     {
      "tag": "Live",
      "name": "Apex Live",
      "bullets": [
       "Invitation only, at Apex's discretion",
       "$0 start, $3,000 EOD drawdown, 3 minis",
       "90/10 split, daily payout requests"
      ]
     }
    ],
    "payouts": [
     {
      "name": "PA payout",
      "sub": "up to weekly",
      "cap": "$1,000–$5,000 per payout by size",
      "needs": "5 qualifying days, 50% consistency",
      "max": "6 payouts, then PA closes",
      "split": "100 / 0"
     },
     {
      "name": "Live payout",
      "sub": "invite only",
      "cap": "none stated",
      "needs": "selected by Apex",
      "max": "daily, $500 minimum",
      "split": "90 / 10"
     }
    ]
   }
  ],
  "rules": [
   {
    "sev": "danger",
    "title": "Intraday floor chases open profit",
    "sub": "Intraday accounts",
    "why": "The threshold <em>moves up instantly with unrealised gains</em>, even if you never close the trade. A winner that reverses can fail the account.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "EOD floor is enforced live",
    "sub": "EOD accounts",
    "why": "The floor only moves at 4:59 PM ET, but your balance <em>including open losses</em> touching it mid-session liquidates and fails or closes the account.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No automation or algorithms",
    "sub": "all current accounts",
    "why": "Apex states <em>no automation or algorithm usage</em>, including HFT. Bots risk probation, closure and forfeited balances.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No hedging, even correlated",
    "sub": "within and across accounts",
    "why": "Long and short at once on the <em>same or correlated instruments</em> is banned, as is passing evals by hedging them against each other.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Stops required, sane risk:reward",
    "sub": "prohibited activities",
    "why": "Every trade needs a pending or mental stop. <em>Tiny targets with huge stops</em> (5 ticks vs 150) or using the threshold as your stop are prohibited.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Flat by 4:59 PM ET",
    "sub": "no overnight holds",
    "why": "You must be flat before 4:59 PM ET (grains and livestock close earlier). Apex <em>takes no responsibility for positions left open</em>.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Inactivity closes PAs",
    "sub": "rolling 30-day window",
    "why": "You need <em>two days of $50+ net profit every 30 days</em>. Miss it and the PA closes permanently with payout eligibility forfeited.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Six payouts, then PA closes",
    "sub": "lifetime cap per account",
    "why": "Each PA gets <em>a maximum of six approved payouts</em>, each capped by size (e.g. $1,500–$3,000 on 50K EOD), then it closes.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "50% consistency per payout",
    "sub": "Performance Accounts",
    "why": "No single winning day may be <em>50% or more of profit since your last payout</em>, or the request waits until you trade more days.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Five qualifying days per payout",
    "sub": "size-based minimum profit",
    "why": "Each payout needs 5 days that each <em>clear a minimum profit</em> ($100–$350 depending on size and type), plus balance above the safety net.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "PA starts at reduced size",
    "sub": "tiered scaling levels",
    "why": "A 50K PA starts at 2 contracts (vs 6 in the eval) and <em>only scales as profit builds</em>; oversized orders are rejected.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "30-day eval, 7-day activation",
    "sub": "no resets or extensions",
    "why": "Evals <em>expire after 30 calendar days</em> with no resets. After passing you have 7 days to pay the PA fee or lose it.",
    "src": "Official"
   }
  ],
  "take": {
   "pros": [
    "One-time eval fees; monthly billing ended 1 March 2026",
    "You keep 100% of approved PA payouts, paid up to weekly",
    "Up to 20 Performance Accounts at once",
    "Choose EOD or intraday drawdown when you buy",
    "No minimum days; you can pass an eval in one session"
   ],
   "watch": [
    "Six-payout lifetime cap per PA means earnings per account are capped",
    "No automation at all, and every trade needs a defined stop",
    "50% consistency and five qualifying days before every payout",
    "Inactivity rule: two $50+ profit days every 30 days or closure",
    "Payouts and live selection are discretionary; sticker prices and activation fees change often"
   ],
   "verdict": "Suits manual traders running several accounts who accept capped six-payout PAs; a poor fit for algo traders or one-big-day traders."
  },
  "sources": [
   "https://apextraderfunding.com/",
   "https://apextraderfunding.com/help-center/",
   "https://apextraderfunding.com/help-center/helpful-items/status-updates/",
   "https://apextraderfunding.com/help-center/eod-trailing-drawdown-accounts/eod-evaluations/",
   "https://apextraderfunding.com/help-center/eod-trailing-drawdown-accounts/eod-drawdown-explained/",
   "https://apextraderfunding.com/help-center/eod-trailing-drawdown-accounts/eod-performance-accounts-pa/",
   "https://apextraderfunding.com/help-center/eod-trailing-drawdown-accounts/eod-payouts/",
   "https://apextraderfunding.com/help-center/evaluation-accounts-ea/intraday-trailing-drawdown-evaluations/",
   "https://apextraderfunding.com/help-center/intraday-trailing-drawdown-accounts/intraday-trailing-drawdown-explained/",
   "https://apextraderfunding.com/help-center/intraday-trailing-drawdown-accounts/intraday-trailing-drawdown-performance-accounts-pa/",
   "https://apextraderfunding.com/help-center/intraday-trailing-drawdown-accounts/intraday-trailing-drawdown-payouts/",
   "https://apextraderfunding.com/help-center/additional-helpful-items/scaling-levels-pa-explained/",
   "https://apextraderfunding.com/help-center/additional-helpful-items/daily-loss-limit-explained/",
   "https://apextraderfunding.com/help-center/getting-started/prohibited-activities/",
   "https://apextraderfunding.com/help-center/getting-started/futures-trading-times/",
   "https://apextraderfunding.com/help-center/getting-started/user-summary-and-trade-violations/",
   "https://apextraderfunding.com/help-center/getting-started/apex-live-prop-trading-program-faq/",
   "https://apextraderfunding.com/help-center/getting-started/apex-trader-funding-background-and-history/",
   "https://apextraderfunding.com/help-center/getting-started/choosing-the-right-platform/",
   "https://apextraderfunding.com/help-center/billing/evaluation-plan-fees-and-access-explained/",
   "https://apextraderfunding.com/help-center/billing/pa-activation-process-deadline-explained/",
   "https://apextraderfunding.com/help-center/billing/inactivity-policy-on-performance-accounts-pa/",
   "https://apextraderfunding.com/help-center/billing/coupon-codes/",
   "https://tradetanto.com/learn/apex-trader-funding-rules-what-you-need-to-know",
   "https://phidiaspropfirm.com/education/apex-trader-funding-4-0-explained",
   "https://proptradingvibes.com/blog/apex-trader-funding-account-types",
   "https://propfirmmatch.com/futures/prop-firms/apex-trader-funding"
  ],
  "trust": 4,
  "trustpilot": {
   "score": 4.2,
   "reviews": 21157
  },
  "trustWhy": "Large and established, but rules change often; older products moved to Legacy in March 2026.",
  "rank": 3
 },
 {
  "id": "tpt",
  "name": "Take Profit Trader",
  "mono": "TP",
  "market": "futures",
  "since": 2021,
  "hq": "Windermere (Orlando), FL, USA",
  "instruments": "CME · CBOT · NYMEX · COMEX",
  "platforms": "NinjaTrader · Tradovate · TradingView · R|Trader · Quantower · MotiveWave + more (CQG / Rithmic)",
  "maxAccounts": "up to 5 funded accounts (PRO + PRO+ combined)",
  "rulesUrl": "https://takeprofittraderhelp.zendesk.com/hc/en-us/categories/15135982702621-Test-Rules",
  "programs": [
   {
    "id": "test-pro",
    "name": "Test → PRO → PRO+",
    "pricing": "monthly",
    "note": "Monthly Test, then a one-time $130 activation for a PRO account with day-one withdrawals.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": 150,
      "activation": 130,
      "target": 1500,
      "maxLoss": 1500,
      "maxLossType": "EOD trailing",
      "lock": "Stops trailing at $25,000 start balance (PRO trails intraday)",
      "dailyLoss": null,
      "maxSize": "3 minis / 30 micros",
      "minDays": 3,
      "consistency": "Test only: best day < 50% of total profit"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 170,
      "activation": 130,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "EOD trailing",
      "lock": "Stops trailing at $50,000 start balance (PRO trails intraday)",
      "dailyLoss": null,
      "maxSize": "6 minis / 60 micros",
      "minDays": 3,
      "consistency": "Test only: best day < 50% of total profit"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 330,
      "activation": 130,
      "target": 6000,
      "maxLoss": 3000,
      "maxLossType": "EOD trailing",
      "lock": "Stops trailing at $100,000 start balance (PRO trails intraday)",
      "dailyLoss": null,
      "maxSize": "12 minis / 120 micros",
      "minDays": 3,
      "consistency": "Test only: best day < 50% of total profit"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": 360,
      "activation": 130,
      "target": 9000,
      "maxLoss": 4500,
      "maxLossType": "EOD trailing",
      "lock": "Stops trailing at $150,000 start balance (PRO trails intraday)",
      "dailyLoss": null,
      "maxSize": "15 minis / 150 micros",
      "minDays": 3,
      "consistency": "Test only: best day < 50% of total profit"
     }
    ],
    "stages": [
     {
      "tag": "Evaluation",
      "name": "Test",
      "bullets": [
       "Hit 6% target, no time limit",
       "EOD trailing drawdown, no daily limit",
       "Minimum 3 trading days",
       "Best day under 50% of profit"
      ]
     },
     {
      "tag": "Funded",
      "name": "PRO (simulated)",
      "bullets": [
       "$130 one-time activation fee",
       "Intraday trailing drawdown to start balance",
       "Withdraw daily above buffer, 80% split",
       "Flat around FOMC, NFP, CPI"
      ]
     },
     {
      "tag": "Live",
      "name": "PRO+",
      "bullets": [
       "Invite only, firm's discretion",
       "Live exchange account starting at $0",
       "EOD drawdown, no buffer",
       "90% profit split"
      ]
     }
    ],
    "payouts": [
     {
      "name": "PRO daily withdrawal",
      "sub": "From day one",
      "cap": "No stated cap above buffer",
      "needs": "Balance above start + drawdown",
      "max": "All profit above buffer",
      "split": "80 / 20"
     },
     {
      "name": "Buffer on closing",
      "sub": "Only when account closes",
      "cap": "Buffer = max drawdown",
      "needs": "Close the PRO account",
      "max": "50% if ≤60 trading days",
      "split": "50 / 50 → 80 / 20"
     },
     {
      "name": "PRO+ withdrawal",
      "sub": "Live, no buffer",
      "cap": "No stated cap",
      "needs": "Invitation and live onboarding",
      "max": "Profit, no buffer needed",
      "split": "90 / 10"
     }
    ]
   }
  ],
  "rules": [
   {
    "sev": "danger",
    "title": "PRO drawdown trails intraday",
    "sub": "Open profit raises the floor",
    "why": "In PRO the floor follows your <em>peak balance including unrealized gains</em> until it reaches start balance. Giving back an open winner can liquidate you.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Flat for FOMC, NFP, CPI",
    "sub": "PRO and PRO+ only",
    "why": "No positions or working orders <em>one minute before, during and after</em> FOMC, NFP and CPI. Test accounts are not restricted.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No bots or automated trading",
    "sub": "All trades must be manual",
    "why": "Bots and algos are banned on every account type; violations mean <em>profit forfeiture or closure</em>. Approved copiers between your own accounts are allowed.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No counter or offsetting positions",
    "sub": "Across all your accounts",
    "why": "Holding long and short in the <em>same or closely related products</em>, even on different accounts, can forfeit profits or close accounts.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Copy only your own accounts",
    "sub": "Approved copiers only",
    "why": "Copying between different people, pass services or group trading is banned. TPT checks <em>timing and execution clustering</em> across users.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No overnight, flat by 4:55 PM ET",
    "sub": "Holiday closes come earlier",
    "why": "TPT auto-closes at 4:55 PM ET. If <em>your product closes earlier</em> (holidays) and you're still in, the account is liquidated.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Exit before limit up/down",
    "sub": "PRO and PRO+",
    "why": "Holding a position when a CME <em>price limit is hit</em> liquidates the account.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Buffer before first withdrawal",
    "sub": "Buffer equals max drawdown",
    "why": "You only withdraw profit <em>above start + drawdown</em> (e.g. $52,000 on 50K). Buffer cash pays just 50% if closed within 60 trading days.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "50% consistency in the Test",
    "sub": "Raises target, not a fail",
    "why": "Best day must be <em>below 50% of total profit</em>. A $2,000 day on 50K means you need over $4,000 total to pass.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Weekly trade required",
    "sub": "PRO and PRO+",
    "why": "Make <em>one round-trip each calendar week</em> (Sun–Fri) to keep funded accounts active; tell support before a break.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Subscription keeps billing",
    "sub": "Cancel it yourself",
    "why": "Failing a Test does <em>not cancel the monthly subscription</em> automatically. Withdrawals of $250 or less also cost a $50 fee.",
    "src": "Fine print"
   },
   {
    "sev": "info",
    "title": "PRO+ upgrade is discretionary",
    "sub": "$5K of PRO profit frozen",
    "why": "Upgrade is a <em>holistic review</em>, not a formula. PRO+ starts at $0; risky traders may be put on PRO+ Development with smaller limits.",
    "src": "Official"
   }
  ],
  "take": {
   "pros": [
    "No daily loss limit in Test or PRO",
    "Withdraw from day one, daily, no stated payout cap",
    "No consistency rule once in PRO",
    "Automated Tradovate PRO withdrawals land in seconds",
    "Up to five funded accounts; own-account copiers allowed"
   ],
   "watch": [
    "PRO drawdown is intraday trailing and counts open profit",
    "Must be flat around FOMC, NFP and CPI in PRO",
    "Buffer equal to max drawdown before any withdrawal",
    "Monthly fee until you pass, plus $130 activation",
    "No bots; PRO+ upgrade is invite-only and discretionary"
   ],
   "verdict": "Great for manual day traders wanting day-one daily payouts; respect PRO's intraday trailing drawdown and news blackouts."
  },
  "sources": [
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15169066911133-Rule-2-Do-Not-Exceed-Maximum-Position-Size",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15170265979165-Rule-3-Do-Not-Hit-End-Of-Day-EOD-Maximum-Trailing-Drawdown",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15170347090461-Rule-4-Trade-Approved-Products-During-Approved-Hours",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15170316538013-Rule-5-Be-Consistent",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15171769361053-PRO-Account-Rules",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15171820366109-How-to-Keep-Track-Of-Your-Drawdown",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15172219527581-PRO-Account-Profit-Split-Withdrawal-Rules",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15172006753821-PRO-Account-Rules",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15171929948829-Advantages-of-PRO",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15171978600349-PRO-Account-Upgrade-Process-Overview-and-Guidelines",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/36429526878237-PRO-Development-Accounts",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/34431153546397-TakeProfitTrader-Universal-Trading-Policies-UTP",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/34431223270557-Independent-Trade-Execution-Policy",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/34431176505245-Trade-Copier-Policy",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15172695563933-Rules-for-Multiple-Accounts",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/37697356049949-Speed-of-Payouts-Update-Q-A",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15172354954525-Withdrawal-Fees",
   "https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15171895352733-Resetting-A-PRO-Account",
   "https://takeprofittrader.com/",
   "https://takeprofittrader.com/blog/take-profit-trader-vs-topstep",
   "https://phidiaspropfirm.com/education/take-profit-trader-activation-fee",
   "https://tradingfinder.com/props/take-profit-trader/"
  ],
  "trust": 4,
  "trustpilot": {
   "score": 4.4,
   "reviews": 10752
  },
  "trustWhy": "Several years running with a steady record and day-one withdrawals.",
  "rank": 4
 },
 {
  "id": "tradeify",
  "name": "Tradeify",
  "mono": "TF",
  "market": "futures",
  "since": 2024,
  "hq": "Boca Raton, FL, USA",
  "instruments": "CME · CBOT · NYMEX · COMEX",
  "platforms": "Tradovate · NinjaTrader · TradingView · Rithmic (Tradesea, Quantower, Sierra Chart, R|Trader) · WealthCharts",
  "maxAccounts": "up to 5 sim funded accounts (per household)",
  "rulesUrl": "https://help.tradeify.co/en/articles/12268167-essential-trading-rules-overview",
  "programs": [
   {
    "id": "select",
    "name": "Select",
    "pricing": "one-time",
    "note": "3-day evaluation with 40% consistency, then pick Flex (5-day) or Daily payouts.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": 109,
      "activation": 0,
      "target": 1500,
      "maxLoss": 1000,
      "maxLossType": "EOD trailing",
      "lock": "Funded only: locks at $25,100 once EOD hits $26,100 or on first payout request",
      "dailyLoss": null,
      "maxSize": "1 mini / 10 micros",
      "minDays": 3,
      "consistency": "40% in evaluation only"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 165,
      "activation": 0,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "EOD trailing",
      "lock": "Funded only: locks at $50,100 once EOD hits $52,100 or on first payout request",
      "dailyLoss": null,
      "maxSize": "4 minis / 40 micros",
      "minDays": 3,
      "consistency": "40% in evaluation only"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 265,
      "activation": 0,
      "target": 6000,
      "maxLoss": 3000,
      "maxLossType": "EOD trailing",
      "lock": "Funded only: locks at $100,100 (EOD $103,100 Flex / $102,600 Daily)",
      "dailyLoss": null,
      "maxSize": "8 minis / 80 micros",
      "minDays": 3,
      "consistency": "40% in evaluation only"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": 369,
      "activation": 0,
      "target": 9000,
      "maxLoss": 4500,
      "maxLossType": "EOD trailing",
      "lock": "Funded only: locks at $150,100 (EOD $154,600 Flex / $153,600 Daily)",
      "dailyLoss": null,
      "maxSize": "12 minis / 120 micros",
      "minDays": 3,
      "consistency": "40% in evaluation only"
     }
    ],
    "stages": [
     {
      "tag": "Evaluation",
      "name": "Select Evaluation",
      "bullets": [
       "One-time fee, no activation fee",
       "EOD trailing drawdown, no daily limit",
       "Minimum 3 trading days",
       "40% consistency rule"
      ]
     },
     {
      "tag": "Funded",
      "name": "Select Flex or Daily (sim)",
      "bullets": [
       "Pick Flex or Daily — permanent",
       "No consistency rule once funded",
       "Contracts start reduced, scale with balance",
       "Daily path adds a daily loss limit"
      ]
     },
     {
      "tag": "Live",
      "name": "Tradeify Elite Live",
      "bullets": [
       "Discretionary, after 3 payouts on account",
       "Starts at $0, sim profit not carried",
       "No daily loss limit",
       "80/20 split, daily payouts"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Select Flex",
      "sub": "Every 5 winning days",
      "cap": "$1,250 / $2,500 / $3,500 / $4,500",
      "needs": "5 days of $100–$250+",
      "max": "50% of total profit",
      "split": "90 / 10"
     },
     {
      "name": "Select Daily",
      "sub": "Daily, with DLL",
      "cap": "$600 / $1,250 / $1,750 / $2,500",
      "needs": "Above buffer, positive cycle",
      "max": "2× profit since last payout",
      "split": "90 / 10"
     },
     {
      "name": "Elite Live",
      "sub": "Daily, after transition",
      "cap": "No stated cap",
      "needs": "Discretionary invite after payouts",
      "max": "Profit above trading capital",
      "split": "80 / 20"
     }
    ]
   },
   {
    "id": "growth",
    "name": "Growth",
    "pricing": "one-time",
    "note": "Fastest pass: 1-day minimum, no eval consistency, but a daily loss limit.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": 99,
      "activation": 0,
      "target": 1500,
      "maxLoss": 1000,
      "maxLossType": "EOD trailing",
      "lock": "Funded only: locks at $25,100 once EOD hits $26,100 or on first payout request",
      "dailyLoss": 600,
      "maxSize": "1 mini / 10 micros",
      "minDays": 1,
      "consistency": "None in eval; 35% on funded payouts"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 145,
      "activation": 0,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "EOD trailing",
      "lock": "Funded only: locks at $50,100 once EOD hits $52,100 or on first payout request",
      "dailyLoss": 1250,
      "maxSize": "4 minis / 40 micros",
      "minDays": 1,
      "consistency": "None in eval; 35% on funded payouts"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 255,
      "activation": 0,
      "target": 6000,
      "maxLoss": 3500,
      "maxLossType": "EOD trailing",
      "lock": "Funded only: locks at $100,100 once EOD hits $103,600 or on first payout request",
      "dailyLoss": 2500,
      "maxSize": "8 minis / 80 micros",
      "minDays": 1,
      "consistency": "None in eval; 35% on funded payouts"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": 369,
      "activation": 0,
      "target": 9000,
      "maxLoss": 5000,
      "maxLossType": "EOD trailing",
      "lock": "Funded only: locks at $150,100 once EOD hits $155,100 or on first payout request",
      "dailyLoss": 3750,
      "maxSize": "12 minis / 120 micros",
      "minDays": 1,
      "consistency": "None in eval; 35% on funded payouts"
     }
    ],
    "stages": [
     {
      "tag": "Evaluation",
      "name": "Growth Evaluation",
      "bullets": [
       "Can pass in one day",
       "EOD trailing drawdown",
       "Soft daily loss limit pauses the day",
       "No consistency rule in evaluation"
      ]
     },
     {
      "tag": "Funded",
      "name": "Growth Sim Funded",
      "bullets": [
       "35% consistency on every payout",
       "5 profitable days per payout",
       "Minimum balance before withdrawing",
       "Daily loss limit rises at 6% profit"
      ]
     },
     {
      "tag": "Live",
      "name": "Tradeify Elite Live",
      "bullets": [
       "Discretionary, after 3 payouts on account",
       "Starts at $0, sim profit not carried",
       "No daily loss limit",
       "80/20 split, daily payouts"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Growth payout",
      "sub": "After 5 winning days",
      "cap": "50K: $1,500 rising to $3,000",
      "needs": "Min balance, 35% consistency",
      "max": "Cap rises by payout number",
      "split": "90 / 10"
     },
     {
      "name": "Elite Live",
      "sub": "Daily, after transition",
      "cap": "No stated cap",
      "needs": "Discretionary invite after payouts",
      "max": "Profit above trading capital",
      "split": "80 / 20"
     }
    ]
   }
  ],
  "rules": [
   {
    "sev": "danger",
    "title": "Drawdown enforced intraday",
    "sub": "Floor updates only at EOD",
    "why": "The floor moves at end of day, but touching it <em>at any moment intraday</em> fails the account, even if you recover by close.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No hedging, even across accounts",
    "sub": "Same product group counts",
    "why": "Long ES with short NQ, or opposite positions <em>across your own accounts</em>, means forfeited profit, payout denial and possible ban.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "10-second microscalping rule",
    "sub": "Funded accounts only",
    "why": "Over 50% of trades and of profit must come from trades <em>held longer than 10 seconds</em>, or you can't request a payout.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Only you may trade",
    "sub": "KYT interview can be required",
    "why": "Shared, team or third-party trading is banned. Tradeify can demand an <em>AI-run KYT interview</em>; missing the deadline can pause payouts.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Bots only if you own them",
    "sub": "HFT bots banned",
    "why": "Algos need <em>video proof of sole ownership</em> and can't run at other firms at the same time. HFT systems are prohibited.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Payout request locks drawdown",
    "sub": "Floor jumps to start + $100",
    "why": "Requesting any payout <em>locks the floor at start + $100</em> immediately, which can leave very little room after an early withdrawal.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Funded contracts start reduced",
    "sub": "Select scales with EOD balance",
    "why": "Select funded accounts start smaller than the evaluation (e.g. <em>3 minis on 150K</em>) and scale up as end-of-day balance grows.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "35% consistency on Growth payouts",
    "sub": "Select funded has none",
    "why": "On Growth funded, your best day must be <em>at or below 35% of total profit</em> to request each payout.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Elite Live starts at $0",
    "sub": "Split drops to 80/20",
    "why": "The move live is discretionary and <em>sim profit does not carry over</em>; Elite accounts pay 80/20 instead of 90/10.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Payout requests can't be cancelled",
    "sub": "Denied if you dip",
    "why": "Once submitted, a request is locked; if you <em>fall below the threshold before processing</em>, it is denied.",
    "src": "Fine print"
   },
   {
    "sev": "info",
    "title": "Weekly trade required",
    "sub": "One trade, Mon–Fri",
    "why": "Make <em>at least one trade per week</em> or the account can be deleted after an email warning.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "News trading allowed",
    "sub": "Auto-flat at 4:45 PM ET",
    "why": "No news restrictions; DCA is allowed. Open positions are <em>auto-closed at 4:45 PM ET</em> without failing you, but slippage is yours.",
    "src": "Official"
   }
  ],
  "take": {
   "pros": [
    "One-time fee, no activation or monthly fees",
    "Select Flex: no consistency and no daily loss once funded",
    "News trading and structured DCA allowed",
    "EOD drawdown that locks at start + $100",
    "Wide platform choice: Tradovate, Rithmic, WealthCharts"
   ],
   "watch": [
    "10-second microscalping rule can block payouts",
    "Per-payout caps; Select caps were cut on 1 Sep 2026",
    "Requesting a payout locks drawdown at start + $100",
    "Live move is discretionary, starts at $0, pays 80/20",
    "Five funded accounts max per household, hedging banned across accounts"
   ],
   "verdict": "Strong value for patient day traders, especially Select Flex; mind payout caps, the 10-second rule and cross-account hedging."
  },
  "sources": [
   "https://help.tradeify.co/en/articles/12268167-essential-trading-rules-overview",
   "https://help.tradeify.co/en/articles/14369021-tradeify-pricing-reference",
   "https://help.tradeify.co/en/articles/12853921-select-evaluation-accounts",
   "https://help.tradeify.co/en/articles/12853966-select-flex-and-select-daily-payout-policies",
   "https://help.tradeify.co/en/articles/10495915-growth-evaluation-accounts",
   "https://help.tradeify.co/en/articles/11083796-growth-funded-account-payout-policy",
   "https://help.tradeify.co/en/articles/10495897-rules-trailing-max-drawdowns",
   "https://help.tradeify.co/en/articles/10468321-rules-daily-loss-limit",
   "https://help.tradeify.co/en/articles/10468320-rules-consistency-rule",
   "https://help.tradeify.co/en/articles/10495874-rules-news-trading",
   "https://help.tradeify.co/en/articles/10495868-rules-hedging-correlated-products",
   "https://help.tradeify.co/en/articles/10495876-rules-permitted-times-to-trade",
   "https://help.tradeify.co/en/articles/10468318-guidelines-for-traders",
   "https://help.tradeify.co/en/articles/17069653-risk-compliance-guidelines-faq",
   "https://help.tradeify.co/en/articles/17229690-know-your-trader-kyt-policy",
   "https://help.tradeify.co/en/articles/12969284-tradeify-elite-program",
   "https://help.tradeify.co/en/articles/12987441-introducing-the-new-select-plan-changes-to-the-live-program",
   "https://help.tradeify.co/en/articles/14135902-tradeify-3-0-program-updates-improvements",
   "https://help.tradeify.co/en/articles/10468251-how-many-simulated-funded-accounts-can-i-have-at-once",
   "https://help.tradeify.co/en/articles/12268494-common-faqs",
   "https://help.tradeify.co/en/articles/10468221-supported-platforms",
   "https://tradeify.co/",
   "https://phidiaspropfirm.com/education/tradeify-select",
   "https://phidiaspropfirm.com/education/tradeify-payout-rules",
   "https://thetrustedprop.com/prop-firms/tradeify"
  ],
  "trust": 3.5,
  "trustpilot": {
   "score": 4.4,
   "reviews": 4785
  },
  "trustWhy": "Well rated with daily payouts, but only running since 2024.",
  "rank": 5
 },
 {
  "id": "lucid",
  "name": "Lucid Trading",
  "mono": "LT",
  "market": "futures",
  "since": 2025,
  "hq": "Dover, Delaware, USA (registered address)",
  "instruments": "CME Group futures: equity index, FX, energy, metals, ags (minis and micros)",
  "platforms": "Tradovate, NinjaTrader, TradingView (CQG); Quantower, MotiveWave, Sierra Chart, ATAS, Bookmap, R|Trader Pro and more (Rithmic)",
  "maxAccounts": "5 funded, 10 total (eval + funded) per household",
  "rulesUrl": "https://support.lucidtrading.com/en/collections/12931279-rules-and-guidelines",
  "programs": [
   {
    "id": "flex",
    "name": "LucidFlex",
    "pricing": "one-time",
    "note": "One phase; once funded, no consistency rule and no payout buffer. Price depends on the options you pick (cheaper with a daily loss limit).",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": null,
      "activation": 0,
      "target": 1250,
      "maxLoss": 1000,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $25,100 once balance passes $26,100",
      "dailyLoss": null,
      "maxSize": "2 minis / 20 micros (funded scales up)",
      "minDays": null,
      "consistency": "Eval: largest day ≤ 50% of profit; funded none"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": null,
      "activation": 0,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $50,100 once balance passes $52,100",
      "dailyLoss": null,
      "maxSize": "4 minis / 40 micros (funded scales up)",
      "minDays": null,
      "consistency": "Eval: largest day ≤ 50% of profit; funded none"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 225,
      "activation": 0,
      "target": 6000,
      "maxLoss": 3000,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $100,100 once balance passes $103,100",
      "dailyLoss": null,
      "maxSize": "6 minis / 60 micros (funded scales up)",
      "minDays": null,
      "consistency": "Eval: largest day ≤ 50% of profit; funded none"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": null,
      "activation": 0,
      "target": 9000,
      "maxLoss": 4500,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $150,100 once balance passes $154,600",
      "dailyLoss": null,
      "maxSize": "10 minis / 100 micros (funded scales up)",
      "minDays": null,
      "consistency": "Eval: largest day ≤ 50% of profit; funded none"
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "Evaluation",
      "bullets": [
       "Hit target with largest day ≤ 50%",
       "EOD trailing drawdown, no time limit",
       "Funded within 5–30 minutes, no activation fee"
      ]
     },
     {
      "tag": "Funded",
      "name": "LucidFlex Funded",
      "bullets": [
       "No consistency rule, no payout buffer",
       "Contract limit scales with simulated profit",
       "90/10 split, up to 5 payouts"
      ]
     },
     {
      "tag": "Live",
      "name": "LucidLive",
      "bullets": [
       "Live review pool after payout 5",
       "Starts at $0 balance, EOD drawdown",
       "All sim accounts closed when moved live"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Flex payout",
      "sub": "Any eligible day",
      "cap": "50% of profit, max $1,000–$3,000",
      "needs": "5 days of $100–$250 profit",
      "max": "5 payouts, then live",
      "split": "90 / 10"
     }
    ]
   },
   {
    "id": "pro",
    "name": "LucidPro",
    "pricing": "one-time",
    "note": "No consistency rule to pass; funded payouts need a buffer and 40% consistency. Cheaper with a daily loss limit.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": 135,
      "activation": 0,
      "target": 1250,
      "maxLoss": 1000,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $25,100 once balance passes $26,100",
      "dailyLoss": null,
      "maxSize": "2 minis / 20 micros",
      "minDays": null,
      "consistency": "Funded: largest day ≤ 40% per payout cycle"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 185,
      "activation": 0,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $50,100 once balance passes $52,100",
      "dailyLoss": 1200,
      "maxSize": "4 minis / 40 micros",
      "minDays": null,
      "consistency": "Funded: largest day ≤ 40% per payout cycle"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": null,
      "activation": 0,
      "target": 6000,
      "maxLoss": 3000,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $100,100 once balance passes $103,100",
      "dailyLoss": 1800,
      "maxSize": "6 minis / 60 micros",
      "minDays": null,
      "consistency": "Funded: largest day ≤ 40% per payout cycle"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": null,
      "activation": 0,
      "target": 9000,
      "maxLoss": 4500,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $150,100 once balance passes $154,600",
      "dailyLoss": 2700,
      "maxSize": "10 minis / 100 micros",
      "minDays": null,
      "consistency": "Funded: largest day ≤ 40% per payout cycle"
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "Evaluation",
      "bullets": [
       "Hit target, no consistency rule",
       "Can pass in a single session",
       "Soft DLL on 50K+ if enabled"
      ]
     },
     {
      "tag": "Funded",
      "name": "LucidPro Funded",
      "bullets": [
       "Full contract size from day one",
       "Optional fixed or scaling DLL",
       "Clear buffer: start balance + MLL + $100"
      ]
     },
     {
      "tag": "Live",
      "name": "LucidLive",
      "bullets": [
       "Live review pool after payout 5",
       "Starts at $0 balance, EOD drawdown"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Pro payout",
      "sub": "Any eligible day",
      "cap": "$1,000–$3,000 first; $1,500–$3,500 after",
      "needs": "Buffer, profit goal, 40% consistency",
      "max": "5 payouts, then live",
      "split": "90 / 10"
     }
    ]
   },
   {
    "id": "daily",
    "name": "LucidDaily",
    "pricing": "one-time",
    "note": "Daily payouts with no funded consistency, but the funded account trails intraday and bans red-folder news. Price depends on options.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": null,
      "activation": 0,
      "target": 1250,
      "maxLoss": 1000,
      "maxLossType": "intraday trailing",
      "lock": "Locks at $25,100 once balance passes $26,100",
      "dailyLoss": 600,
      "maxSize": "2 minis / 20 micros",
      "minDays": null,
      "consistency": "Eval: largest day ≤ 50%; funded none"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": null,
      "activation": 0,
      "target": 3000,
      "maxLoss": 2000,
      "maxLossType": "intraday trailing",
      "lock": "Locks at $50,100 once balance passes $52,100",
      "dailyLoss": 1200,
      "maxSize": "4 minis / 40 micros",
      "minDays": null,
      "consistency": "Eval: largest day ≤ 50%; funded none"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": null,
      "activation": 0,
      "target": 6000,
      "maxLoss": 3000,
      "maxLossType": "intraday trailing",
      "lock": "Locks at $100,100 once balance passes $103,100",
      "dailyLoss": 1800,
      "maxSize": "6 minis / 60 micros",
      "minDays": null,
      "consistency": "Eval: largest day ≤ 50%; funded none"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": null,
      "activation": 0,
      "target": 9000,
      "maxLoss": 4500,
      "maxLossType": "intraday trailing",
      "lock": "Locks at $150,100 once balance passes $154,600",
      "dailyLoss": 2700,
      "maxSize": "10 minis / 100 micros",
      "minDays": null,
      "consistency": "Eval: largest day ≤ 50%; funded none"
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "Evaluation",
      "bullets": [
       "Choose intraday or EOD drawdown",
       "DLL on or off sets price",
       "Largest day ≤ 50% to pass"
      ]
     },
     {
      "tag": "Funded",
      "name": "LucidDaily Funded",
      "bullets": [
       "Intraday trailing drawdown always",
       "Flat 1 minute around red-folder news",
       "Request payouts daily, no consistency rule"
      ]
     },
     {
      "tag": "Live",
      "name": "LucidLive",
      "bullets": [
       "Review after one $6K–$12K max-profit day",
       "All sim accounts closed when moved live"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Daily payout",
      "sub": "Request any eligible day",
      "cap": "Profit above buffer, min $500",
      "needs": "Net profit since last payout",
      "max": "Live after max-profit day",
      "split": "90 / 10"
     }
    ]
   },
   {
    "id": "direct",
    "name": "LucidDirect",
    "pricing": "one-time",
    "note": "Straight to funded with no evaluation, but a strict 20% consistency rule on every payout. Price depends on options.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": null,
      "activation": 0,
      "target": null,
      "maxLoss": 1000,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $25,100 once balance passes $26,100",
      "dailyLoss": null,
      "maxSize": "2 minis / 20 micros",
      "minDays": null,
      "consistency": "Largest day ≤ 20% per payout cycle"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": null,
      "activation": 0,
      "target": null,
      "maxLoss": 2000,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $50,100 once balance passes $52,100",
      "dailyLoss": 1200,
      "maxSize": "4 minis / 40 micros",
      "minDays": null,
      "consistency": "Largest day ≤ 20% per payout cycle"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 700,
      "activation": 0,
      "target": null,
      "maxLoss": 3500,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $100,100 once balance passes $103,600",
      "dailyLoss": 2100,
      "maxSize": "6 minis / 60 micros",
      "minDays": null,
      "consistency": "Largest day ≤ 20% per payout cycle"
     },
     {
      "label": "150K",
      "balance": 150000,
      "price": null,
      "activation": 0,
      "target": null,
      "maxLoss": 5000,
      "maxLossType": "EOD trailing",
      "lock": "Locks at $150,100 once balance passes $155,100",
      "dailyLoss": 3000,
      "maxSize": "10 minis / 100 micros",
      "minDays": null,
      "consistency": "Largest day ≤ 20% per payout cycle"
     }
    ],
    "stages": [
     {
      "tag": "Funded",
      "name": "LucidDirect Funded",
      "bullets": [
       "No evaluation, trade funded immediately",
       "First profit goal $1,500–$9,000 by size",
       "DLL becomes 60% of peak EOD profit"
      ]
     },
     {
      "tag": "Live",
      "name": "LucidLive",
      "bullets": [
       "Live review pool after payout 5",
       "Starts at $0 balance, EOD drawdown"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Direct payout",
      "sub": "Payouts 1–5",
      "cap": "$1,000–$3,000; up to $3,500 later",
      "needs": "Profit goal, 20% consistency",
      "max": "5 payouts, then live",
      "split": "90 / 10"
     }
    ]
   }
  ],
  "rules": [
   {
    "sev": "danger",
    "title": "Max loss limit ends account",
    "sub": "Trails, then locks at +$100",
    "why": "The MLL trails your peak balance until it <em>locks at start + $100</em>; touching it is a hard breach that closes the account.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "LucidDaily funded: intraday trailing",
    "sub": "Unrealised peaks raise floor",
    "why": "Funded Daily accounts always use <em>intraday drawdown</em>, whichever evaluation option you bought, so open-profit peaks lift your loss limit.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "LucidDaily: no red-folder news",
    "sub": "Flat ±1 minute, USD news",
    "why": "Daily accounts must be flat <em>1 minute before to 1 after</em> high-impact USD news; trading it is a hard breach. Flex, Pro, Direct allowed.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No hedging, any accounts",
    "sub": "Yours or other users'",
    "why": "Opposing positions across accounts mean a <em>reset to prior-day balance</em>; repeat offences breach every involved account and can ban you.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Microscalping profits forfeited",
    "sub": ">50% profit from ≤5s trades",
    "why": "If over half your profit comes from trades held <em>5 seconds or less</em>: warning, then forfeited profits and possible permanent ban.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "High-frequency trading banned",
    "sub": "Other bots and copiers OK",
    "why": "HFT earns a warning, then <em>profit forfeiture</em>, account closure and a ban. Other automated systems and trade copiers are permitted.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "30 days inactive = deleted",
    "sub": "Needs ≥ $1 net P&L",
    "why": "Accounts without $1 net profit or loss in <em>30 calendar days</em> are permanently deleted; breached accounts too unless reset.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Consistency gates every payout",
    "sub": "50% / 40% / 20% by plan",
    "why": "Largest day ÷ profit must be ≤ 50% to pass Flex/Daily, <em>≤ 40% Pro, ≤ 20% Direct</em> per payout cycle; resets after each payout.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Reported enforcement disputes",
    "sub": "Hedging and chargeback bans",
    "why": "Traders publicly report <em>denied payouts and bans</em> citing cross-user hedging or chargebacks, with slow dispute support; unverified.",
    "src": "Fine print"
   },
   {
    "sev": "caution",
    "title": "Daily loss limit is soft",
    "sub": "Locked until next session",
    "why": "Hitting the DLL <em>pauses trading</em> for the session without failing the account, unless the max loss limit is also hit.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Flat by 4:45 PM ET",
    "sub": "No overnight or weekend holds",
    "why": "Open positions are <em>auto-closed at 4:45 PM ET</em>; not a failure, but you lose control of the exit.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "Five payouts, then live review",
    "sub": "Sim accounts get closed",
    "why": "After payout 5 you enter the <em>live review pool</em>; live starts at $0 balance and all sim accounts close.",
    "src": "Official"
   }
  ],
  "take": {
   "pros": [
    "One-time fees, no monthly rebilling or activation fee",
    "EOD drawdown locks at starting balance + $100",
    "90/10 split; payouts paid within 2 business days",
    "Flex: no funded consistency and no payout buffer",
    "Daily loss limits are soft, never account-ending"
   ],
   "watch": [
    "LucidDaily funded uses intraday trailing and bans red-folder news",
    "Payout caps $1,000–$3,500 per request; live review after 5",
    "Pro 40% and Direct 20% consistency reset every payout",
    "30 days without trading permanently deletes the account",
    "Young firm with frequent rule changes and public payout disputes"
   ],
   "verdict": "Cheap one-time evaluations, locking EOD drawdown and fast payouts, but a young, often-restructured firm with capped sim payouts before live."
  },
  "sources": [
   "https://support.lucidtrading.com/en/",
   "https://support.lucidtrading.com/en/articles/12945790-lucidflex-evaluation-account",
   "https://support.lucidtrading.com/en/articles/12945795-lucidflex-funded-account",
   "https://support.lucidtrading.com/en/articles/12945796-lucidflex-payouts",
   "https://support.lucidtrading.com/en/articles/12945805-lucidflex-consistency-percentage",
   "https://support.lucidtrading.com/en/articles/12945808-lucidflex-scaling-plan",
   "https://support.lucidtrading.com/en/articles/12945815-lucidflex-drawdown",
   "https://support.lucidtrading.com/en/articles/16226050-lucidflex-customization",
   "https://support.lucidtrading.com/en/articles/12890029-lucidpro-evaluation-account",
   "https://support.lucidtrading.com/en/articles/12890069-lucidpro-funded-account",
   "https://support.lucidtrading.com/en/articles/12890092-lucidpro-payouts",
   "https://support.lucidtrading.com/en/articles/12890109-lucidpro-consistency-percentage",
   "https://support.lucidtrading.com/en/articles/12890122-lucidpro-daily-loss-limit",
   "https://support.lucidtrading.com/en/articles/12890136-lucidpro-drawdown",
   "https://support.lucidtrading.com/en/articles/16226068-lucidpro-customization",
   "https://support.lucidtrading.com/en/articles/15996664-luciddaily-evaluation",
   "https://support.lucidtrading.com/en/articles/15997244-luciddaily-funded-account",
   "https://support.lucidtrading.com/en/articles/15997266-luciddaily-payouts",
   "https://support.lucidtrading.com/en/articles/15998336-luciddaily-consistency",
   "https://support.lucidtrading.com/en/articles/15998425-luciddaily-drawdown",
   "https://support.lucidtrading.com/en/articles/16085900-luciddaily-daily-loss-limit",
   "https://support.lucidtrading.com/en/articles/16033858-luciddaily-customization",
   "https://support.lucidtrading.com/en/articles/12890148-luciddirect-funded-account",
   "https://support.lucidtrading.com/en/articles/12890164-luciddirect-payout-objectives",
   "https://support.lucidtrading.com/en/articles/12890178-luciddirect-consistency-percentage",
   "https://support.lucidtrading.com/en/articles/12890185-luciddirect-daily-loss-limit",
   "https://support.lucidtrading.com/en/articles/12890192-luciddirect-drawdown",
   "https://support.lucidtrading.com/en/articles/13425130-new-live-structure",
   "https://support.lucidtrading.com/en/articles/11404728-other-trading-activities",
   "https://support.lucidtrading.com/en/articles/11404729-allowed-trading-times",
   "https://support.lucidtrading.com/en/articles/11404742-prohibited-microscalping",
   "https://support.lucidtrading.com/en/articles/11404734-prohibited-hedging",
   "https://support.lucidtrading.com/en/articles/11404736-prohibited-high-frequency-trading",
   "https://support.lucidtrading.com/en/articles/11404632-inactivity-policy",
   "https://support.lucidtrading.com/en/articles/11404617-maximum-number-of-accounts",
   "https://support.lucidtrading.com/en/articles/11404614-lucid-trading-supported-platforms",
   "https://support.lucidtrading.com/en/articles/11508978-approved-products-and-commissions",
   "https://lucidtrading.com/",
   "https://www.bucko.ai/learn/lucid-trading",
   "https://tradzu.com/blogs/lucid-trading-review",
   "https://phidiaspropfirm.com/education/lucid-trading-explained",
   "https://www.elitetrader.com/et/threads/got-4-payouts-with-lucid-then-got-kicked-mean-dirty-version.389993/",
   "https://x.com/propwatchmedia/status/2079504167916445992"
  ],
  "trust": 3,
  "trustpilot": {
   "score": 4.3,
   "reviews": 6015
  },
  "trustWhy": "Founded 2025 and restructured often; public payout disputes are still being argued.",
  "rank": 6
 },
 {
  "id": "ftmo",
  "name": "FTMO",
  "mono": "FT",
  "market": "forex",
  "since": 2015,
  "hq": "Prague, Czech Republic",
  "instruments": "CFDs on forex, indices, commodities, stocks and crypto",
  "platforms": "MetaTrader 4, MetaTrader 5, cTrader, TradingView",
  "maxAccounts": "No account limit; $400K combined capital cap per trader",
  "rulesUrl": "https://ftmo.com/en/trading-objectives/",
  "programs": [
   {
    "id": "2step",
    "name": "FTMO Challenge: 2-Step",
    "pricing": "one-time",
    "note": "Priced in euros, Standard account type (Swing costs more). Fee refunded with your first reward.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": 250,
      "activation": 0,
      "target": 2500,
      "maxLoss": 2500,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 1250,
      "maxSize": null,
      "minDays": 4,
      "consistency": null
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 345,
      "activation": 0,
      "target": 5000,
      "maxLoss": 5000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 2500,
      "maxSize": null,
      "minDays": 4,
      "consistency": null
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 540,
      "activation": 0,
      "target": 10000,
      "maxLoss": 10000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 5000,
      "maxSize": null,
      "minDays": 4,
      "consistency": null
     },
     {
      "label": "200K",
      "balance": 200000,
      "price": 1080,
      "activation": 0,
      "target": 20000,
      "maxLoss": 20000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 10000,
      "maxSize": null,
      "minDays": 4,
      "consistency": null
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "FTMO Challenge",
      "bullets": [
       "10% profit target, no time limit",
       "5% daily loss, 10% static max loss",
       "Minimum 4 trading days",
       "News and weekend holding allowed"
      ]
     },
     {
      "tag": "Phase 2",
      "name": "Verification",
      "bullets": [
       "5% profit target, same loss limits",
       "Minimum 4 trading days",
       "Review 1–4 business days plus KYC"
      ]
     },
     {
      "tag": "Funded",
      "name": "FTMO Account",
      "bullets": [
       "80% reward split; 90% via Scaling Plan",
       "Standard: news blackout, close before weekend",
       "Swing: no news/weekend limits, 1:30 leverage",
       "Fee refunded with first reward"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Reward",
      "sub": "From day 14",
      "cap": "No cap stated",
      "needs": "14 days since first trade",
      "max": "No stated limit",
      "split": "80 / 20"
     },
     {
      "name": "Scaling Plan",
      "sub": "+25% every 4 months",
      "cap": "Balance up to $2M",
      "needs": "10% profit, 2 rewards, 4 months",
      "max": "Up to $2M",
      "split": "90 / 10"
     }
    ],
    "currency": "€"
   },
   {
    "id": "1step",
    "name": "FTMO Challenge: 1-Step",
    "pricing": "one-time",
    "note": "Priced in euros. One phase and a 90% split, but the fee is not refunded.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": 199,
      "activation": 0,
      "target": 2500,
      "maxLoss": 2500,
      "maxLossType": "EOD trailing",
      "lock": "None; trails highest midnight balance, resets each cycle",
      "dailyLoss": 750,
      "maxSize": null,
      "minDays": 0,
      "consistency": "Best Day ≤ 50% of positive days' profit (not a breach)"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 319,
      "activation": 0,
      "target": 5000,
      "maxLoss": 5000,
      "maxLossType": "EOD trailing",
      "lock": "None; trails highest midnight balance, resets each cycle",
      "dailyLoss": 1500,
      "maxSize": null,
      "minDays": 0,
      "consistency": "Best Day ≤ 50% of positive days' profit (not a breach)"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 499,
      "activation": 0,
      "target": 10000,
      "maxLoss": 10000,
      "maxLossType": "EOD trailing",
      "lock": "None; trails highest midnight balance, resets each cycle",
      "dailyLoss": 3000,
      "maxSize": null,
      "minDays": 0,
      "consistency": "Best Day ≤ 50% of positive days' profit (not a breach)"
     },
     {
      "label": "200K",
      "balance": 200000,
      "price": 999,
      "activation": 0,
      "target": 20000,
      "maxLoss": 20000,
      "maxLossType": "EOD trailing",
      "lock": "None; trails highest midnight balance, resets each cycle",
      "dailyLoss": 6000,
      "maxSize": null,
      "minDays": 0,
      "consistency": "Best Day ≤ 50% of positive days' profit (not a breach)"
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "1-Step Challenge",
      "bullets": [
       "10% target, 3% daily loss",
       "10% max loss, end-of-day trailing",
       "Best Day ≤ 50% of positive days",
       "No minimum days, no time limit"
      ]
     },
     {
      "tag": "Funded",
      "name": "FTMO Account",
      "bullets": [
       "90% reward split from first reward",
       "Best Day rule still gates rewards",
       "Trailing max loss resets each reward cycle",
       "Standard news and weekend limits apply"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Reward",
      "sub": "From day 14",
      "cap": "No cap stated",
      "needs": "14 days, Best Day ≤ 50%",
      "max": "No stated limit",
      "split": "90 / 10"
     },
     {
      "name": "Scaling Plan",
      "sub": "+25% every 4 months",
      "cap": "Balance up to $2M",
      "needs": "10% profit, 2 rewards, 4 months",
      "max": "Up to $2M",
      "split": "90 / 10"
     }
    ],
    "currency": "€"
   }
  ],
  "rules": [
   {
    "sev": "danger",
    "title": "10% max loss ends account",
    "sub": "Static 2-Step, trailing 1-Step",
    "why": "Equity below the limit ends the account. The 1-Step limit trails the <em>highest midnight balance</em> and fully resets each reward cycle.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Daily loss: 5% or 3%",
    "sub": "Equity-based, resets 00:00 CE(S)T",
    "why": "Limit is the midnight balance minus 5% (2-Step) or 3% (1-Step) of initial capital; <em>floating losses count</em>.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No gambling or all-in bets",
    "sub": "No fixed risk-per-trade cap",
    "why": "Overleveraging, overexposure, one-sided bets and account rolling are <em>forbidden practices</em>. FTMO only recommends risking 1–1.5% per trade.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Position-size spikes get flagged",
    "sub": "Risk per Trade Idea reviewed",
    "why": "Opening <em>substantially larger positions</em> than usual, or stacking correlated exposure, can mean removed trades, disqualification or forfeited rewards.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "News blackout on FTMO Account",
    "sub": "Standard type, ±2 minutes",
    "why": "No opening or closing, including SL/TP fills, <em>2 minutes before to 2 after</em> selected news; may terminate the account. Swing and evaluations exempt.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Close before weekend (Standard)",
    "sub": "FTMO Account stage only",
    "why": "Standard FTMO Accounts must be flat before weekend close or <em>market breaks over 2 hours</em>; gap trading is forbidden. Swing exempt.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No hedging across accounts",
    "sub": "Or to game Best Day",
    "why": "Opposite positions across accounts or traders, or hedges that <em>spread profit across days</em>, can forfeit rewards and terminate agreements.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Best Day Rule (1-Step)",
    "sub": "Best day ≤ 50% of positive days",
    "why": "Not a breach, but you <em>must keep trading</em> until your best day is ≤ 50%; it also gates 1-Step FTMO Account rewards.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "$400K combined capital cap",
    "sub": "Identical strategies counted together",
    "why": "Accounts are unlimited, but <em>identically traded accounts</em> above $400K total can be suspended; popular third-party EAs risk this.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "HFT and server abuse banned",
    "sub": "Max 2,000 requests per day",
    "why": "EAs are allowed, but <em>hyperactive trading</em> over 2,000 server requests a day or exploiting price-feed delays is forbidden.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "Passing is not instant funding",
    "sub": "Review plus KYC first",
    "why": "After passing comes a 1–4 business-day review, identity check and agreement; FTMO <em>“may” provide</em> the account.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "1-Step fee not refunded",
    "sub": "2-Step refunds with reward",
    "why": "The 2-Step fee is <em>refunded with your first reward</em>; the 1-Step fee is not.",
    "src": "Official"
   }
  ],
  "take": {
   "pros": [
    "Established since 2015 with a long payout track record",
    "No time limit on any evaluation phase",
    "2-Step fee refunded with first reward",
    "Rewards from day 14, processed in 1–2 business days",
    "Scaling Plan adds 25% every 4 months, up to $2M"
   ],
   "watch": [
    "Discretionary “gambling” reviews have no published numeric threshold",
    "Standard FTMO Account: news blackout and weekend closing",
    "1-Step trailing max loss plus 3% daily limit is tight",
    "2-Step starts at 80% split, 90% only via scaling/Prime",
    "Fees in EUR; 1-Step fee is non-refundable"
   ],
   "verdict": "The benchmark forex prop firm with clear objectives, but discretionary risk reviews make consistent position sizing as important as hitting targets."
  },
  "sources": [
   "https://ftmo.com/en/trading-objectives/",
   "https://ftmo.com/en/forbidden-trading-practices/",
   "https://ftmo.com/en/faq/can-i-trade-news/",
   "https://ftmo.com/en/faq/do-i-have-to-close-my-positions-overnight-or-before-the-weekend/",
   "https://ftmo.com/en/faq/ftmo-swing-account-type/",
   "https://ftmo.com/en/faq/do-you-have-any-consistency-rules/",
   "https://ftmo.com/en/faq/which-instruments-can-i-trade-and-what-strategies-am-i-allowed-to-use/",
   "https://ftmo.com/en/faq/how-many-accounts-can-i-have/",
   "https://ftmo.com/en/faq/how-do-i-withdraw-my-profits/",
   "https://ftmo.com/en/faq/is-the-entry-fee-refunded-after-passing-ftmo-challenge-1-step/",
   "https://ftmo.com/en/faq/are-the-fees-recurrent/",
   "https://ftmo.com/en/faq/i-have-successfully-passed-what-to-do-now/",
   "https://ftmo.com/en/faq/which-platforms-can-i-use-for-trading/",
   "https://ftmo.com/en/faq/what-are-the-account-specifications/",
   "https://ftmo.com/en/reward-growth-and-scaling-plan/",
   "https://ftmo.com/en/blog/introducing-the-1-step-ftmo-challenge/",
   "https://ftmo.com/en/blog/why-ftmo-monitors-certain-patterns-in-trading-behaviour/",
   "https://ftmo.com/en/blog/gambling-is-not-the-right-way-to-make-money/",
   "https://promo.ftmo.com/new-1-step-challenge/",
   "https://www.bestpropfirms.com/reviews/ftmo/",
   "https://www.marketscoupons.com/guides/ftmo-review"
  ],
  "trust": 5,
  "trustpilot": {
   "score": 4.8,
   "reviews": 53375
  },
  "trustWhy": "The benchmark: over $450M paid out in ten years.",
  "rank": 1
 },
 {
  "id": "the5ers",
  "name": "The5ers",
  "mono": "5%",
  "market": "forex",
  "since": 2016,
  "hq": "Ra'anana, Israel",
  "instruments": "Forex, metals, indices, oil and crypto CFDs",
  "platforms": "MT5, cTrader (+$10), TradingView; US clients TradingView only; choice is final",
  "maxAccounts": "High Stakes: 1 per size tier (Classic) or up to 3 small accounts (New); Hyper Growth: $40K total evaluation capital",
  "rulesUrl": "https://www.the5ers.com/faqs/prohibited-trading-practices/",
  "programs": [
   {
    "id": "highstakes",
    "name": "High Stakes (2-Step)",
    "pricing": "one-time",
    "note": "Prices are the 'New' plan (10% P1) per Sep 2026 reviews; Classic (8% P1) costs more, e.g. 100K $545.",
    "sizes": [
     {
      "label": "10K",
      "balance": 10000,
      "price": 69,
      "activation": 0,
      "target": 1000,
      "maxLoss": 1000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 500,
      "maxSize": null,
      "minDays": 3,
      "consistency": null
     },
     {
      "label": "25K",
      "balance": 25000,
      "price": 176,
      "activation": 0,
      "target": 2500,
      "maxLoss": 2500,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 1250,
      "maxSize": null,
      "minDays": 3,
      "consistency": null
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 278,
      "activation": 0,
      "target": 5000,
      "maxLoss": 5000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 2500,
      "maxSize": null,
      "minDays": 3,
      "consistency": null
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 491,
      "activation": 0,
      "target": 10000,
      "maxLoss": 10000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 5000,
      "maxSize": null,
      "minDays": 3,
      "consistency": null
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "Step 1",
      "bullets": [
       "10% target (8% on Classic plan)",
       "5% daily loss, 10% max loss",
       "3 profitable days of 0.5%+",
       "Unlimited time, 1:100 leverage"
      ]
     },
     {
      "tag": "Phase 2",
      "name": "Step 2",
      "bullets": [
       "5% profit target",
       "Same 5% daily / 10% max",
       "3 profitable days of 0.5%+",
       "Unlimited time"
      ]
     },
     {
      "tag": "Funded",
      "name": "Pro Trader",
      "bullets": [
       "80% split, rising to 100%",
       "Every +10% scales the account",
       "3 profitable days per scale step",
       "Scales up to $500K balance"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Bi-weekly payout",
      "sub": "Every 14 days",
      "cap": "FAQ: $3K (50K) / $4K (100K) max withdrawal",
      "needs": "14 days, $150 minimum",
      "max": "Fee refunded on first",
      "split": "80 / 20"
     },
     {
      "name": "Top-tier scaling",
      "sub": "$350K+ balance",
      "cap": "Large payouts split into weekly installments of $10K max",
      "needs": "Reach $350K via scaling",
      "max": "100% + $4K–$10K fixed",
      "split": "100 / 0"
     }
    ]
   },
   {
    "id": "hypergrowth",
    "name": "Hyper Growth (1-Step)",
    "pricing": "one-time",
    "note": "Prices and 50% start split are from 2026 reviews; official page now leads with the cheaper Pro Growth.",
    "sizes": [
     {
      "label": "5K",
      "balance": 5000,
      "price": 260,
      "activation": 0,
      "target": 500,
      "maxLoss": 300,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 150,
      "maxSize": null,
      "minDays": 0,
      "consistency": null
     },
     {
      "label": "10K",
      "balance": 10000,
      "price": 450,
      "activation": 0,
      "target": 1000,
      "maxLoss": 600,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 300,
      "maxSize": null,
      "minDays": 0,
      "consistency": null
     },
     {
      "label": "20K",
      "balance": 20000,
      "price": 850,
      "activation": 0,
      "target": 2000,
      "maxLoss": 1200,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 600,
      "maxSize": null,
      "minDays": 0,
      "consistency": null
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "Evaluation",
      "bullets": [
       "10% profit target",
       "3% daily pause, not a breach",
       "6% static stop-out from start",
       "No minimum days, 1:30 leverage"
      ]
     },
     {
      "tag": "Funded",
      "name": "Growth levels",
      "bullets": [
       "Account doubles at every 10%",
       "Same 3% pause / 6% stop-out",
       "Split starts 50%, rises to 100%",
       "Scales up to $4M"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Bi-weekly payout",
      "sub": "Every 14 days",
      "cap": null,
      "needs": "14 days, $150 minimum",
      "max": "Split grows with levels",
      "split": "50 / 50"
     }
    ]
   }
  ],
  "rules": [
   {
    "sev": "danger",
    "title": "Gambling-like trading clause",
    "sub": "Oversized positions void profits",
    "why": "Positions of disproportionate size, or leverage as the main profit driver, are prohibited and lead to <em>termination with no profits or refund</em>.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Position-size manipulation banned",
    "sub": "Keep lot sizes consistent",
    "why": "Sizes substantially larger or smaller than your typical trading, or rapid profits from a short history, count as <em>prohibited practices</em> and can end the account.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "High Stakes daily loss breach",
    "sub": "5% from prior-day high",
    "why": "The 5% limit is taken from the higher of balance or equity at server midnight. Touching it means <em>automatic account termination</em>, not a pause.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No copy trading or coordination",
    "sub": "Includes shared signals",
    "why": "Trade coordination, copying other traders, account management services and cross-firm hedging are banned, with <em>permanent ban and forfeited profits</em>.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "EA and HFT restrictions",
    "sub": "Must own source code",
    "why": "HFT, tick scalping, rollover scalping and EAs you lack the source code for are banned; T&C also asks for <em>written approval for automated software</em>.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "2-minute news blackout",
    "sub": "High Stakes only",
    "why": "No orders from 2 minutes before to 2 minutes after high-impact news. <em>Profits are deducted, losses stay yours</em>. Holding through news is fine.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Hyper Growth 3% daily pause",
    "sub": "6% stop-out ends it",
    "why": "Losing 3% in a day pauses trading until the next day; equity below <em>6% under the initial balance</em> closes the account.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Withdrawal caps on High Stakes",
    "sub": "50K and 100K accounts",
    "why": "The official FAQ lists a <em>$3,000 / $4,000 maximum withdrawal</em> with $300 / $500 minimum profit; big payouts can be paid in weekly $10K installments.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Stop-loss must be visible",
    "sub": "Stealth stops forbidden",
    "why": "A stop-loss is suggested, not required, but <em>stealth-mode stops are not allowed</em>. The risk desk can impose leverage or size limits.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Inactivity expires accounts",
    "sub": "30 days eval, 60 funded",
    "why": "No trade for <em>30 consecutive days</em> on an evaluation (60 on funded) and the account expires automatically.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "Restricted countries and VPNs",
    "sub": "31 countries excluded",
    "why": "Excludes Israel, Russia, Iran, Iraq, Lebanon and others. Using a VPN to bypass this is a <em>fundamental breach of the Terms</em>.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "Don't publish support chats",
    "sub": "Confidentiality clause",
    "why": "Publicly sharing private correspondence or tickets with the firm leads to <em>termination and forfeited profits</em>.",
    "src": "Official"
   }
  ],
  "take": {
   "pros": [
    "Unlimited time on every phase",
    "High Stakes from $19, fee refunded with first payout",
    "Static max loss that never trails your profits",
    "Long scaling paths: $500K High Stakes, $4M Hyper Growth",
    "Operating since 2016 with a long payout record"
   ],
   "watch": [
    "High Stakes daily loss uses the higher of balance or equity",
    "No new orders 2 minutes either side of red news",
    "Vague gambling and position-size clauses can void profits",
    "Hyper Growth costs far more and starts at a 50% split",
    "Official FAQ lists per-withdrawal caps on 50K and 100K"
   ],
   "verdict": "A long-running firm with forgiving unlimited time; master the daily-loss math and news window, and keep position sizing consistent."
  },
  "sources": [
   "https://the5ers.com/high-stakes/",
   "https://the5ers.com/hyper-growth/",
   "https://www.the5ers.com/faqs/prohibited-trading-practices/",
   "https://the5ers.com/faqs/what-are-the-general-rules-for-the-high-stakes-program/",
   "https://the5ers.com/faqs/is-news-trading-allowed-in-the-high-stakes-program2024/",
   "https://the5ers.com/faqs/can-i-use-an-ea-expert-advisor-can-i-set-a-stealth-mode-stop-loss/",
   "https://the5ers.com/faqs/which-trading-platform-do-you-use/",
   "https://the5ers.com/terms-and-conditions/",
   "https://the5ers.com/challenge-programs-bootcamp-high-stakes-hyper-growth-explained/",
   "https://help.the5ers.com/what-is-the-drawdown-rule-for-high-stakes/",
   "https://help.the5ers.com/what-is-drawdown-and-how-is-it-calculated/",
   "https://help.the5ers.com/is-there-anything-else-i-should-know-about-risk-management/",
   "https://help.the5ers.com/how-many-the5ers-accounts-can-i-have/",
   "https://propfirmbridge.com/education/the5ers-high-stakes-review-new-classic-prices-rules-bridge",
   "https://propfirmbridge.com/education/the5ers-hyper-growth-fastest-scaling-route-to-100-k-and-4-m-explained-for-traders-in-2026",
   "https://cryptoslate.com/prop-firms/the5ers-review/",
   "https://www.quantvps.com/blog/the5ers-payout-rules",
   "https://tradetanto.com/learn/the-5-ers-rules-explained-a-complete-guide",
   "https://en.wikipedia.org/wiki/The5ers"
  ],
  "trust": 4.5,
  "trustpilot": {
   "score": 4.7,
   "reviews": 38731
  },
  "trustWhy": "Running since 2016 and consistently well rated.",
  "rank": 2
 },
 {
  "id": "fundednext",
  "name": "FundedNext",
  "mono": "FN",
  "market": "forex",
  "since": 2022,
  "hq": "Ajman, United Arab Emirates",
  "instruments": "Forex (46 pairs), indices, commodities/metals, crypto and stock CFDs",
  "platforms": "MT4, MT5, cTrader, Match-Trader; US clients Match-Trader only",
  "maxAccounts": "$300K combined funded capital ($50K for some countries); challenge purchases not capped",
  "rulesUrl": "https://fundednext.com/general-rules/cfds/trading-objectives",
  "programs": [
   {
    "id": "stellar2step",
    "name": "Stellar 2-Step",
    "pricing": "one-time",
    "note": "Official list prices; 6K and 15K sizes also offered. Payout style is chosen at checkout.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": 199.99,
      "activation": 0,
      "target": 2000,
      "maxLoss": 2500,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 1250,
      "maxSize": null,
      "minDays": 5,
      "consistency": "None (40% only on On-Demand payouts)"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 299.99,
      "activation": 0,
      "target": 4000,
      "maxLoss": 5000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 2500,
      "maxSize": null,
      "minDays": 5,
      "consistency": "None (40% only on On-Demand payouts)"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 549.99,
      "activation": 0,
      "target": 8000,
      "maxLoss": 10000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 5000,
      "maxSize": null,
      "minDays": 5,
      "consistency": "None (40% only on On-Demand payouts)"
     },
     {
      "label": "200K",
      "balance": 200000,
      "price": 1099.99,
      "activation": 0,
      "target": 16000,
      "maxLoss": 20000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 10000,
      "maxSize": null,
      "minDays": 5,
      "consistency": "None (40% only on On-Demand payouts)"
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "Challenge Phase 1",
      "bullets": [
       "8% profit target",
       "5% daily, 10% static max loss",
       "Min 5 trading days",
       "No time limit, news allowed"
      ]
     },
     {
      "tag": "Phase 2",
      "name": "Challenge Phase 2",
      "bullets": [
       "5% profit target",
       "Same 5% / 10% limits",
       "Min 5 trading days",
       "No time limit"
      ]
     },
     {
      "tag": "Funded",
      "name": "FundedNext Account",
      "bullets": [
       "No target, same loss limits",
       "News-window profits count at 40%",
       "15% challenge reward after scale-up",
       "+25% balance per qualifying cycle"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Standard",
      "sub": "Default option",
      "cap": null,
      "needs": "21 days, then every 14",
      "max": "95% with add-on",
      "split": "80 / 20"
     },
     {
      "name": "3-Day Reward",
      "sub": "Chosen at checkout",
      "cap": null,
      "needs": "3 days of 1%+ profit",
      "max": "95% with add-on",
      "split": "60 / 40"
     },
     {
      "name": "On-Demand",
      "sub": "Chosen at checkout",
      "cap": null,
      "needs": "2% growth, 40% consistency",
      "max": "95% with add-on",
      "split": "90 / 10"
     }
    ]
   },
   {
    "id": "stellar1step",
    "name": "Stellar 1-Step",
    "pricing": "one-time",
    "note": "Official list prices; 6K and 15K sizes also offered. Tighter limits but payouts every 5 business days.",
    "sizes": [
     {
      "label": "25K",
      "balance": 25000,
      "price": 219.99,
      "activation": 0,
      "target": 2500,
      "maxLoss": 1500,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 750,
      "maxSize": null,
      "minDays": 2,
      "consistency": null
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 329.99,
      "activation": 0,
      "target": 5000,
      "maxLoss": 3000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 1500,
      "maxSize": null,
      "minDays": 2,
      "consistency": null
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 569.99,
      "activation": 0,
      "target": 10000,
      "maxLoss": 6000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 3000,
      "maxSize": null,
      "minDays": 2,
      "consistency": null
     },
     {
      "label": "200K",
      "balance": 200000,
      "price": 1099.99,
      "activation": 0,
      "target": 20000,
      "maxLoss": 12000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 6000,
      "maxSize": null,
      "minDays": 2,
      "consistency": null
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "Challenge",
      "bullets": [
       "10% profit target",
       "3% daily, 6% static max loss",
       "Min 2 trading days",
       "No time limit, 1:30 forex leverage"
      ]
     },
     {
      "tag": "Funded",
      "name": "FundedNext Account",
      "bullets": [
       "No target, same 3% / 6% limits",
       "News-window profits count at 40%",
       "Fee refunded with 3rd reward",
       "+25% balance per qualifying cycle"
      ]
     }
    ],
    "payouts": [
     {
      "name": "5-day cycle",
      "sub": "Every 5 business days",
      "cap": null,
      "needs": "Net profit in the cycle",
      "max": "90% scaled, 95% add-on",
      "split": "80 / 20"
     }
    ]
   }
  ],
  "rules": [
   {
    "sev": "danger",
    "title": "Gambling: all-in or 70% margin",
    "sub": "Size trades well below DLL",
    "why": "Risking the full or near-full daily loss limit on one or several trades, or <em>70%+ cumulative margin usage</em>, is gambling and can cancel the account without refund.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Quick-strike 30-second trades",
    "sub": "Warning 20%, breach 30%",
    "why": "Trades closed within 30 seconds making 30%+ of profit end a funded account at cycle end and <em>forfeit all quick-strike profit</em>.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Hyperactivity limit",
    "sub": "200 trades or 2,000 messages",
    "why": "Exceeding 200 trades or 2,000 server messages in a day earns warnings; the <em>third strike breaches the account</em>. Warnings stack across accounts.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "No cross-account hedging or copying",
    "sub": "Same-account hedging only",
    "why": "Opposite positions across accounts, third-party copy trading, account management or shared devices/IPs lead to <em>termination, reward denial or a permanent ban</em>.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "EAs only via paid add-on",
    "sub": "Small accounts, MT4/MT5",
    "why": "EAs and VPS are allowed only on 5K–25K accounts with their own paid add-ons. <em>Unauthorized EA or VPS use</em> is a forbidden practice.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Funded news profits count 40%",
    "sub": "5 min either side",
    "why": "On funded accounts, trades opened or closed within 5 minutes of high-impact news (including SL/TP hits) have <em>only 40% of profit counted</em>; losses count fully.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Sudden lot-size changes flagged",
    "sub": "Behaviour change rule",
    "why": "Lot sizes or trade frequency that <em>significantly deviate from your typical behaviour</em> are listed as forbidden and can trigger a review.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Daily loss counts floating P&L",
    "sub": "Resets 00:00 server time",
    "why": "The 5% (2-Step) or 3% (1-Step) limit is based on initial balance and <em>includes open P&L, swaps and commission</em>. Triple swaps can tip you over.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "One-sided betting → 1% rule",
    "sub": "Concentrated direction",
    "why": "Stacking trades in one direction can lead the firm to require a <em>1% risk-per-trade rule</em>; refusing can revoke platform access.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Rewards can be withheld",
    "sub": "Compliance review on each",
    "why": "Every reward request is reviewed, and the Terms let FundedNext <em>review, adjust, withhold, deny or reverse rewards</em> before payment.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "30-day inactivity expiry",
    "sub": "All Stellar accounts",
    "why": "No trade for <em>30 calendar days</em> expires the account per the help centre (an older rules page says 60).",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "Restricted countries and US limits",
    "sub": "20 countries excluded",
    "why": "Excludes Bangladesh, Malaysia, Vietnam, Sri Lanka and others; VPN circumvention means <em>permanent termination</em>. US clients get Match-Trader only.",
    "src": "Official"
   }
  ],
  "take": {
   "pros": [
    "No time limits and static max loss on both models",
    "1-Step funded accounts pay every 5 business days",
    "Choice of payout style: standard, 3-day or on-demand",
    "Clear, published thresholds for quick-strike and hyperactivity rules",
    "No consistency rule on standard payouts"
   ],
   "watch": [
    "Funded news-window profits only count at 40%",
    "Risking near the full daily loss on one trade counts as gambling",
    "Trades closed under 30 seconds can forfeit profits",
    "Long restricted list incl. Bangladesh, Malaysia, Vietnam, Sri Lanka",
    "15% challenge reward now needs 4 payouts over 2+ months"
   ],
   "verdict": "Transparent, well-documented rules and fast 1-Step payouts; size trades modestly and avoid scalping around news on funded accounts."
  },
  "sources": [
   "https://fundednext.com/cfds/stellar-2-step",
   "https://fundednext.com/cfds/stellar-1-step",
   "https://fundednext.com/general-rules/cfds/trading-objectives",
   "https://fundednext.com/general-rules/cfds/what-is-allowed",
   "https://fundednext.com/general-rules/cfds/what-is-forbidden",
   "https://fundednext.com/general-rules/cfds/trading-platforms",
   "https://fundednext.com/general-rules/cfds/symbols-and-conditions",
   "https://fundednext.com/terms-of-service",
   "https://fundednext.com/blog/fundednext-new-payout-structures",
   "https://help.fundednext.com/en/articles/12673362-what-rules-do-i-need-to-follow-in-the-stellar-2-step-challenge-at-fundednext-cfd",
   "https://help.fundednext.com/en/articles/12673301-what-are-the-rules-for-the-stellar-1-step-challenge-at-fundednext",
   "https://help.fundednext.com/en/articles/8020351-what-are-the-restricted-prohibited-trading-strategies",
   "https://help.fundednext.com/en/articles/10701644-is-news-trading-allowed-in-the-stellar-1-step-account",
   "https://help.fundednext.com/en/articles/10701585-how-often-will-i-receive-my-performance-reward",
   "https://help.fundednext.com/en/articles/10701694-what-will-be-my-reward-share-from-the-stellar-2-step-account",
   "https://help.fundednext.com/en/articles/13349186-fundednext-pro-the-scale-up-program",
   "https://help.fundednext.com/en/articles/10701553-how-do-i-claim-the-15-reward-from-challenge",
   "https://help.fundednext.com/en/articles/8019811-how-can-i-calculate-the-daily-loss-limit",
   "https://help.fundednext.com/en/articles/8019664-is-there-an-inactivity-period-for-my-accounts",
   "https://help.fundednext.com/en/articles/11982358-does-fundednext-allow-holding-trades-over-the-night-weekend",
   "https://help.fundednext.com/en/articles/8020080-are-any-countries-restricted-on-fundednext-cfds",
   "https://help.fundednext.com/en/articles/8027523-how-many-accounts-can-i-have-with-fundednext",
   "https://propfirmbridge.com/education/funded-next-complete-review-2026-real-trader-analysis-exclusive-discount-code",
   "https://propvator.com/blog/does-fundednext-have-a-consistency-rule/"
  ],
  "trust": 4,
  "trustpilot": {
   "score": 4.5,
   "reviews": 80423
  },
  "trustWhy": "The most reviews of any firm, on a shorter history.",
  "rank": 3
 },
 {
  "id": "fundingpips",
  "name": "FundingPips",
  "mono": "FP",
  "market": "forex",
  "since": 2022,
  "hq": "Dubai, UAE",
  "instruments": "Forex majors and crosses, metals, indices, energies, crypto CFDs (41 symbols)",
  "platforms": "MT5, cTrader, Match-Trader",
  "maxAccounts": "$400K combined allocation across evaluation, Master and Prime accounts (Fine print)",
  "rulesUrl": "https://help.fundingpips.com/hc/en-us",
  "programs": [
   {
    "id": "2step",
    "name": "2 Step Standard",
    "pricing": "one-time",
    "note": "Prices are third-party snapshots from Aug–Sep 2026. The help centre publishes no prices.",
    "sizes": [
     {
      "label": "10K",
      "balance": 10000,
      "price": 66,
      "activation": 0,
      "target": 800,
      "maxLoss": 1000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 500,
      "maxSize": "20 lots per trade",
      "minDays": 3,
      "consistency": "35% on Monthly and On-Demand cycles"
     },
     {
      "label": "25K",
      "balance": 25000,
      "price": 177,
      "activation": 0,
      "target": 2000,
      "maxLoss": 2500,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 1250,
      "maxSize": "20 lots per trade",
      "minDays": 3,
      "consistency": "35% on Monthly and On-Demand cycles"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 299,
      "activation": 0,
      "target": 4000,
      "maxLoss": 5000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 2500,
      "maxSize": "20 lots per trade",
      "minDays": 3,
      "consistency": "35% on Monthly and On-Demand cycles"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 544,
      "activation": 0,
      "target": 8000,
      "maxLoss": 10000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 5000,
      "maxSize": "20 lots per trade",
      "minDays": 3,
      "consistency": "35% on Monthly and On-Demand cycles"
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "Evaluation",
      "bullets": [
       "8% profit target",
       "5% daily loss (3% option); floating P&L counts",
       "10% static max loss from starting balance",
       "Minimum 3 trading days"
      ]
     },
     {
      "tag": "Phase 2",
      "name": "Verification",
      "bullets": [
       "5% profit target",
       "Same 5% daily and 10% static limits",
       "Minimum 3 trading days",
       "News and weekend holds allowed in evaluation"
      ]
     },
     {
      "tag": "Master",
      "name": "Funded (Master) account",
      "bullets": [
       "Profits deducted inside high-impact news windows",
       "Overnight and weekend trades auto-closed without Swing add-on",
       "1% loss on one idea triggers a strike",
       "30 days without a closed trade breaches"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Weekly",
      "sub": "Every 7 days",
      "cap": "None stated",
      "needs": "Min request 1% of account",
      "max": "One request per 7 days",
      "split": "60 / 40"
     },
     {
      "name": "Bi-Weekly",
      "sub": "Every 14 days",
      "cap": "None stated",
      "needs": "Min request 1% of account",
      "max": "One request per 14 days",
      "split": "80 / 20"
     },
     {
      "name": "On Demand",
      "sub": "Any time",
      "cap": "None stated",
      "needs": "35% consistency, min 2% profit",
      "max": "Consistency gate each request",
      "split": "90 / 10"
     },
     {
      "name": "Monthly",
      "sub": "Every 30 days",
      "cap": "None stated",
      "needs": "35% consistency, 7 profitable days",
      "max": "Strikes at 1% per idea",
      "split": "100 / 0"
     }
    ]
   },
   {
    "id": "1step",
    "name": "1 Step Flex",
    "pricing": "one-time",
    "note": "One phase with no minimum days. Prices are third-party snapshots from Aug 2026 (100K quoted at $533–$569).",
    "sizes": [
     {
      "label": "10K",
      "balance": 10000,
      "price": 99,
      "activation": 0,
      "target": 1200,
      "maxLoss": 1200,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 300,
      "maxSize": "20 lots per trade",
      "minDays": 0,
      "consistency": "35% on Monthly cycle only"
     },
     {
      "label": "25K",
      "balance": 25000,
      "price": 211,
      "activation": 0,
      "target": 3000,
      "maxLoss": 3000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 750,
      "maxSize": "20 lots per trade",
      "minDays": 0,
      "consistency": "35% on Monthly cycle only"
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 313,
      "activation": 0,
      "target": 6000,
      "maxLoss": 6000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 1500,
      "maxSize": "20 lots per trade",
      "minDays": 0,
      "consistency": "35% on Monthly cycle only"
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 569,
      "activation": 0,
      "target": 12000,
      "maxLoss": 12000,
      "maxLossType": "static",
      "lock": null,
      "dailyLoss": 3000,
      "maxSize": "20 lots per trade",
      "minDays": 0,
      "consistency": "35% on Monthly cycle only"
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "Evaluation",
      "bullets": [
       "12% profit target, no minimum days",
       "3% daily loss (2% option)",
       "12% static max loss from starting balance",
       "Overnight and weekend holds allowed"
      ]
     },
     {
      "tag": "Master",
      "name": "Funded (Master) account",
      "bullets": [
       "Daily loss breach deducts profits (soft breach)",
       "Max loss breach closes account instantly",
       "No overnight or weekend holds without Swing add-on",
       "Strike at 1% loss on one trade idea"
      ]
     }
    ],
    "payouts": [
     {
      "name": "Bi-Weekly",
      "sub": "Every 14 days",
      "cap": "None stated",
      "needs": "Min request 1% of account",
      "max": "One request per 14 days",
      "split": "80 / 20"
     },
     {
      "name": "Monthly",
      "sub": "Every 30 days",
      "cap": "None stated",
      "needs": "35% consistency, 7 days ≥0.5%",
      "max": "Bought after 15 Aug 2026",
      "split": "100 / 0"
     }
    ]
   }
  ],
  "rules": [
   {
    "sev": "danger",
    "title": "Static max loss is a hard breach",
    "sub": "10% on 2-Step, 12% on 1-Step",
    "why": "Equity, including floating loss, can never touch the floor. It is <em>fixed from the starting balance</em> and does not trail, and touching it closes the account instantly.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Daily loss counts floating P&L",
    "sub": "Higher of opening balance or equity",
    "why": "The limit is measured from the <em>higher of opening balance or equity</em> and resets at 00:00 UTC+3. On 2-Step a breach closes the account.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Striking system on trade ideas",
    "sub": "1% loss per idea",
    "why": "A combined loss of 1% on one trade idea is a strike. The 2nd strike halves your split, the 3rd cuts it to 20%, and the <em>4th closes the account</em>.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Long banned-strategy list",
    "sub": "Instant termination",
    "why": "Hedging, tick scalping, HFT, gap trading, latency or reverse arbitrage, opposite-account trading and churning <em>result in immediate termination</em>.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Third-party EAs can't fully trade",
    "sub": "Own EA needs proof",
    "why": "Bought EAs may only manage trades and risk. Fully automated EAs must be your own, and the firm's <em>discretion decides what proof is sufficient</em>.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "News windows deduct Master profits",
    "sub": "5 min, or 10 for speeches",
    "why": "Profit from trades opened or closed in the window is deducted unless opened 5+ hours earlier. <em>Purposely trading news</em> in any phase can close the account.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "No overnight or weekend holds",
    "sub": "Master accounts, unless Swing add-on",
    "why": "Master trades are <em>auto-closed daily at 20:45–21:00 UTC</em> (21:45–22:00 UTC in winter). The weekend block, called temporary, has applied since 29 Jan 2026.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Best splits need consistency",
    "sub": "35% cap, 7 green days",
    "why": "On Monthly 100% and On-Demand 90%, <em>no single day may exceed 35% of profit</em>. Monthly also needs 7 days each at ≥0.5%.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "VPN and VPS access banned",
    "sub": "IP region must match",
    "why": "Logging in through a VPN or VPS is not allowed. A location change can trigger <em>proof requests such as tickets or passport stamps</em>.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "30-day inactivity closes account",
    "sub": "Open trades don't count",
    "why": "An account with no fully closed trade in 30 days is breached. <em>Leaving a trade open does not reset</em> the timer.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "20-lot cap per trade",
    "sub": "Crypto 1 lot per click",
    "why": "The platform enforces a <em>hard 20-lot limit on every order</em>. Dynamic leverage on Master cuts metals and indices to as low as 1:5 on large size.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "KYC and banned countries",
    "sub": "Iran, Vietnam, UAE excluded",
    "why": "Payouts need photo ID, proof of address and a selfie. <em>Iran, Vietnam and UAE residents</em> plus sanctioned countries are excluded, and US traders can't join Prime.",
    "src": "Official"
   }
  ],
  "take": {
   "pros": [
    "Static max loss on every main model, with no trailing floor",
    "Cheap entry: about $66 for a 10K 2-Step",
    "Choice of payout cycles, up to a 100% monthly split",
    "Payouts processed in 1–3 working days, with a big public track record",
    "1-Step Flex: no minimum days and a 12% max loss"
   ],
   "watch": [
    "Master accounts auto-close trades overnight and at weekends without the paid Swing add-on",
    "Striking system: a 1% loss on one idea can halve your split",
    "Rules change often: SUME clause added then removed in Aug 2026",
    "Hedging, tick scalping and VPN/VPS use are all banned",
    "Top splits require a 35% consistency cap plus 7 profitable days"
   ],
   "verdict": "Cheap and paying reliably, but Master accounts are effectively intraday-only, and frequent rule changes mean you should recheck terms before every purchase."
  },
  "sources": [
   "https://help.fundingpips.com/hc/en-us",
   "https://help.fundingpips.com/hc/en-us/articles/34501809112081-2-Step-Standard",
   "https://help.fundingpips.com/hc/en-us/articles/34501697434385-1-Step-Flex",
   "https://help.fundingpips.com/hc/en-us/articles/47835196271249-2-Step-Flex",
   "https://help.fundingpips.com/hc/en-us/articles/34502027344017-2-Step-Pro-Model",
   "https://help.fundingpips.com/hc/en-us/articles/34504137479441-News-Trading-and-Holding-Trades-Over-the-Weekend",
   "https://help.fundingpips.com/hc/en-us/articles/34505029138449-Trading-Conduct-and-Security-Standards",
   "https://help.fundingpips.com/hc/en-us/articles/34504564970385-Your-Rewards-Your-Way",
   "https://help.fundingpips.com/hc/en-us/articles/44390730743825-Get-Started",
   "https://help.fundingpips.com/hc/en-us/articles/34447308895889",
   "https://proptradingvibes.com/blog/fundingpips-two-step-challenge",
   "https://proptradingvibes.com/blog/fundingpips-rules",
   "https://cryptoslate.com/prop-firms/fundingpips-review/",
   "https://www.capitalcritic.ai/forex-prop-firms/fundingpips",
   "https://thepropjournalist.com/reviews/fundingpips/",
   "https://thepropjournalist.com/news/fundingpips-removes-sume/",
   "https://propfirmmatch.com/prop-firms/funding-pips"
  ],
  "trust": 4,
  "trustpilot": {
   "score": 4.5,
   "reviews": 69359
  },
  "trustWhy": "Over $125M paid out, but rules change often.",
  "rank": 4
 },
 {
  "id": "fxify",
  "name": "FXIFY",
  "mono": "FX",
  "market": "forex",
  "since": 2023,
  "hq": "London, UK",
  "instruments": "Forex, metals, indices, commodities, stock and crypto CFDs",
  "platforms": "MT5, DXtrade, TradingView",
  "maxAccounts": "One active account per size ($5K–$400K), across challenge and funded stages",
  "rulesUrl": "https://fxify.com/faqs/rules/",
  "programs": [
   {
    "id": "1phase",
    "name": "One Phase",
    "pricing": "one-time",
    "note": "Fee refunded with first payout. Prices are third-party list prices; promo codes often take 35–40% off.",
    "sizes": [
     {
      "label": "10K",
      "balance": 10000,
      "price": 89,
      "activation": 0,
      "target": 1000,
      "maxLoss": 600,
      "maxLossType": "intraday trailing",
      "lock": "Trails closed-balance high; locks at start balance at +6% or first payout",
      "dailyLoss": 300,
      "maxSize": null,
      "minDays": 5,
      "consistency": null
     },
     {
      "label": "25K",
      "balance": 25000,
      "price": 199,
      "activation": 0,
      "target": 2500,
      "maxLoss": 1500,
      "maxLossType": "intraday trailing",
      "lock": "Trails closed-balance high; locks at start balance at +6% or first payout",
      "dailyLoss": 750,
      "maxSize": null,
      "minDays": 5,
      "consistency": null
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 379,
      "activation": 0,
      "target": 5000,
      "maxLoss": 3000,
      "maxLossType": "intraday trailing",
      "lock": "Trails closed-balance high; locks at start balance at +6% or first payout",
      "dailyLoss": 1500,
      "maxSize": null,
      "minDays": 5,
      "consistency": null
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 549,
      "activation": 0,
      "target": 10000,
      "maxLoss": 6000,
      "maxLossType": "intraday trailing",
      "lock": "Trails closed-balance high; locks at start balance at +6% or first payout",
      "dailyLoss": 3000,
      "maxSize": null,
      "minDays": 5,
      "consistency": null
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "Assessment",
      "bullets": [
       "10% profit target, unlimited time",
       "3% daily loss from prior 5pm EST balance",
       "6% trailing max, locks at start balance",
       "Minimum 5 trading days"
      ]
     },
     {
      "tag": "Funded",
      "name": "Funded account",
      "bullets": [
       "Same rules as assessment, no profit cap",
       "First payout on demand, then monthly",
       "Max drawdown locks at start after payout",
       "Fee refunded with first payout"
      ]
     }
    ],
    "payouts": [
     {
      "name": "First payout",
      "sub": "On demand",
      "cap": "None stated",
      "needs": "KYC (FXIFY + Rise), $50 minimum",
      "max": "Fee refunded with it",
      "split": "80 / 20"
     },
     {
      "name": "Monthly",
      "sub": "Default cycle",
      "cap": "None stated",
      "needs": "Account read-only during review",
      "max": "One request per month",
      "split": "80 / 20"
     },
     {
      "name": "Bi-Weekly add-on",
      "sub": "Paid at checkout",
      "cap": "None stated",
      "needs": "Buy add-on at purchase",
      "max": "One request per 14 days",
      "split": "90 / 10"
     }
    ]
   },
   {
    "id": "2phase",
    "name": "Two Phase Standard",
    "pricing": "one-time",
    "note": "Two phases with a trailing drawdown. Classic (static 5% / 10%) and Pro are separate variants. Prices are from independent guides.",
    "sizes": [
     {
      "label": "10K",
      "balance": 10000,
      "price": 89,
      "activation": 0,
      "target": 1000,
      "maxLoss": 1000,
      "maxLossType": "intraday trailing",
      "lock": "Trails closed-balance high; locks at start balance at +10% or first payout",
      "dailyLoss": 400,
      "maxSize": null,
      "minDays": 5,
      "consistency": null
     },
     {
      "label": "25K",
      "balance": 25000,
      "price": 199,
      "activation": 0,
      "target": 2500,
      "maxLoss": 2500,
      "maxLossType": "intraday trailing",
      "lock": "Trails closed-balance high; locks at start balance at +10% or first payout",
      "dailyLoss": 1000,
      "maxSize": null,
      "minDays": 5,
      "consistency": null
     },
     {
      "label": "50K",
      "balance": 50000,
      "price": 379,
      "activation": 0,
      "target": 5000,
      "maxLoss": 5000,
      "maxLossType": "intraday trailing",
      "lock": "Trails closed-balance high; locks at start balance at +10% or first payout",
      "dailyLoss": 2000,
      "maxSize": null,
      "minDays": 5,
      "consistency": null
     },
     {
      "label": "100K",
      "balance": 100000,
      "price": 549,
      "activation": 0,
      "target": 10000,
      "maxLoss": 10000,
      "maxLossType": "intraday trailing",
      "lock": "Trails closed-balance high; locks at start balance at +10% or first payout",
      "dailyLoss": 4000,
      "maxSize": null,
      "minDays": 5,
      "consistency": null
     }
    ],
    "stages": [
     {
      "tag": "Phase 1",
      "name": "Assessment 1",
      "bullets": [
       "10% profit target, unlimited time",
       "4% daily loss from prior-day balance",
       "10% trailing max drawdown",
       "Minimum 5 trading days"
      ]
     },
     {
      "tag": "Phase 2",
      "name": "Assessment 2",
      "bullets": [
       "5% profit target, unlimited time",
       "Same 4% daily and 10% trailing",
       "Minimum 5 trading days"
      ]
     },
     {
      "tag": "Funded",
      "name": "Funded account",
      "bullets": [
       "Same rules as assessments, no profit cap",
       "No consistency rule on Standard",
       "Max drawdown locks at start after payout",
       "Fee refunded with first payout"
      ]
     }
    ],
    "payouts": [
     {
      "name": "First payout",
      "sub": "On demand",
      "cap": "None stated",
      "needs": "KYC (FXIFY + Rise), $50 minimum",
      "max": "Fee refunded with it",
      "split": "80 / 20"
     },
     {
      "name": "Monthly",
      "sub": "Default cycle",
      "cap": "None stated",
      "needs": "Account read-only during review",
      "max": "One request per month",
      "split": "80 / 20"
     },
     {
      "name": "Bi-Weekly add-on",
      "sub": "Paid at checkout",
      "cap": "None stated",
      "needs": "Buy add-on at purchase",
      "max": "One request per 14 days",
      "split": "90 / 10"
     }
    ]
   }
  ],
  "rules": [
   {
    "sev": "danger",
    "title": "Payout locks floor at start",
    "sub": "Leave a buffer when withdrawing",
    "why": "Once a payout is processed, max drawdown <em>locks at your starting balance</em>. Withdraw all profit and the next losing trade can breach the account.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Trailing max drawdown",
    "sub": "6% (1-Phase) or 10% (2-Phase)",
    "why": "The floor trails your <em>highest closed balance</em> until you are up 6% or 10%, then locks. Breaches are checked on live equity.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Prohibited strategies void profits",
    "sub": "HFT, arbitrage, cross-account hedging",
    "why": "HFT, latency or statistical arbitrage, reverse or group hedging, order spamming and bug exploits mean <em>termination and voided profits</em>.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Gambling and high-leverage news banned",
    "sub": "Discretionary risk clauses",
    "why": "\"YOLO\" gambling and large leveraged news positions are prohibited. Clients taking <em>significant risks on news trades may be banned</em>, and no numeric limit is defined.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "EAs need pre-approval",
    "sub": "Contact support first",
    "why": "EAs are allowed on 1, 2 and 3 Phase only after support review. Running one unapproved risks <em>suspension without eligibility to profits</em>.",
    "src": "Official"
   },
   {
    "sev": "danger",
    "title": "Hard breach forfeits funded profits",
    "sub": "Unless Performance Protect bought",
    "why": "Profits in a funded account at a hard breach are <em>not paid out</em>. Performance Protect (+15% of fee, checkout only) still pays your split.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Daily loss from prior-day balance",
    "sub": "Snapshot at 5pm EST",
    "why": "The limit uses the balance recorded at 5pm EST the previous day. <em>Floating losses count</em> as soon as equity drops through the threshold.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Default split is only 80%",
    "sub": "90% and bi-weekly cost extra",
    "why": "After the on-demand first payout, withdrawals are <em>monthly at 80% by default</em>. A 90% split and bi-weekly payouts are paid add-ons chosen at checkout.",
    "src": "Fine print"
   },
   {
    "sev": "caution",
    "title": "60-day inactivity breach",
    "sub": "Trade at least every 60 days",
    "why": "With no trade placed in 60 days, the account is treated as inactive and <em>counts as a hard breach</em>.",
    "src": "Official"
   },
   {
    "sev": "caution",
    "title": "Two KYC checks, long country ban",
    "sub": "FXIFY and Rise both",
    "why": "Failing either KYC means <em>no funding and no payouts</em>. Banned countries include Russia, Vietnam, Kenya, Ghana, Algeria, Venezuela and Iran.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "News and weekend holds allowed",
    "sub": "On 1, 2 and 3 Phase",
    "why": "News trading and weekend holding are permitted on phase accounts. Fifteen exotic pairs, including USDTRY and USDZAR, are <em>fixed at 1:6 leverage</em>.",
    "src": "Official"
   },
   {
    "sev": "info",
    "title": "Copy trading allowed with proof",
    "sub": "IP changes are fine",
    "why": "Copying between your own FXIFY accounts is allowed. Copying in from outside needs a <em>30-day statement in your name</em>. Shared IPs or devices across users get flagged.",
    "src": "Official"
   }
  ],
  "take": {
   "pros": [
    "Evaluation fee refunded with your first payout",
    "First payout on demand after funding",
    "News trading, weekend holds and approved EAs allowed",
    "Relaxed IP rules: different IPs and devices are fine",
    "Broker-backed, with scaling up to $4M"
   ],
   "watch": [
    "Trailing drawdown on One Phase and Two Phase Standard",
    "Drawdown locks at starting balance after payout, so never withdraw everything",
    "Default 80% monthly split; 90% and bi-weekly cost extra",
    "Vague gambling and high-leverage-news clauses give the firm discretion",
    "Some Trustpilot users report bans for 'latency arbitrage' without evidence (Fine print)"
   ],
   "verdict": "A flexible, established broker-backed firm with liberal trading rules, but the trailing drawdown and the floor lock after a payout punish careless withdrawals."
  },
  "sources": [
   "https://fxify.com/faqs/rules/",
   "https://fxify.com/faqs/all-faqs/what-are-the-rules-for-the-assessment-account/",
   "https://fxify.com/faqs/all-faqs/how-do-you-calculate-the-max-trailing-drawdown/",
   "https://fxify.com/faqs/all-faqs/how-do-you-calculate-the-daily-loss-limit/",
   "https://fxify.com/faqs/all-faqs/how-do-withdrawals-affect-drawdown-on-1-and-2-phase-accounts/",
   "https://fxify.com/faqs/all-faqs/what-are-the-rules-for-the-funded-account/",
   "https://fxify.com/faqs/all-faqs/what-strategies-can-i-use/",
   "https://fxify.com/blog/fxifys-prohibited-strategies/",
   "https://fxify.com/faqs/all-faqs/can-i-trade-the-news/",
   "https://fxify.com/faqs/all-faqs/do-i-need-to-close-positions-over-the-weekend/",
   "https://fxify.com/faqs/all-faqs/can-i-use-an-expert-advisor-for-mt-for-the-challenge-accounts/",
   "https://fxify.com/faqs/all-faqs/is-copy-trading-allowed/",
   "https://fxify.com/faqs/all-faqs/what-the-max-allocation/",
   "https://fxify.com/faqs/all-faqs/what-countries-are-accepted/",
   "https://fxify.com/faqs/all-faqs/what-happens-if-i-cannot-pass-my-kyc/",
   "https://fxify.com/faqs/all-faqs/what-are-your-ip-rules/",
   "https://fxify.com/faqs/all-faqs/how-do-i-withdraw-my-profits/",
   "https://fxify.com/faqs/all-faqs/performance-protect/",
   "https://fxify.com/faqs/all-faqs/how-does-your-scaling-plan-work/",
   "https://fxify.com/programs/one-phase/",
   "https://fxify.com/how-it-works/",
   "https://fxify.com/blog/top-prop-firms-with-two-phase-challenges/",
   "https://www.bestpropfirms.com/reviews/fxify/",
   "https://propfirm201.com/firms/fxify",
   "https://www.fxempire.com/prop-firms/fxify",
   "https://cryptoslate.com/prop-firms/fxify-review/",
   "https://thetrustedprop.com/prop-firms/fxify",
   "https://www.trustpilot.com/review/fxify.com?page=5"
  ],
  "trust": 3.5,
  "trustpilot": {
   "score": 4.3,
   "reviews": 6334
  },
  "trustWhy": "Broker-backed with $30M+ paid out; the newest of the five.",
  "rank": 5
 }
];
