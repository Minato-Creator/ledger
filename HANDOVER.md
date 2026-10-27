# Quire — how this is built, and why

Everything here is a decision that has already been made once. The point of
writing it down is that the next person — or the next model — does not have to
rediscover it by breaking it.

Quire is a trading journal. It keeps your data as plain files in a folder you
choose, and it runs two ways from one source: as a desktop app (Tauri), and as
a single `.html` file you can double-click.

---

## Getting it running

```bash
npm install                 # playwright, the tauri cli
npx playwright install chromium
npm run serve               # src/ on http://127.0.0.1:8777
node build-single.mjs       # -> Laminar.html
node build-single.mjs --preview   # -> Quire-preview.html, with demo data
./tests/run.sh              # every suite; name suites to run only those
npm run tauri dev           # the desktop app
```

`tests/run.sh` builds the single file and starts the server itself, so it is
the one command that needs nothing set up first. `QUIRE_CHROMIUM` points it at
a browser binary if you do not want Playwright's own.

---

## The shape of the code

No framework, no build step for the app itself. `src/js/` is plain ES modules
served as they are; `build-single.mjs` only exists to fold them into one file
for the double-clickable version, and it wraps each module in its own scope
rather than concatenating them, because view files legitimately reuse local
names like `row` and `stat`.

- **A view is a function that returns a DOM element.** `src/js/views/*.js`.
- **`nav.refresh()` rebuilds the whole view.** There is no diffing and no
  component state. If something must survive a repaint — an open menu, a
  keyboard focus — the view holds it in a variable above the paint function
  and re-applies it. `paintTags()` in the playbook is the pattern.
  **Scroll survives a repaint**: `render()` in app.js notes every scrolled
  box (by its place in the page) when the same page is drawn again and puts
  them back after — a fresh page still starts at the top. A view that
  repaints part of itself keeps its own (the review rail's list does).
- **One copy of prices per pair**: every chart (trade, review, Outlook,
  bias grading) asks `candles.loadDay`, which reads a day from Replay's
  two-year download first (`replaydata.dayFromDownload`, registered with
  `useLocalPrices` so the two files don't import each other) when the
  download holds that whole day; else the vault's day file; else OANDA
  (kept as a day file once over). Today always comes from OANDA. Day files
  saved before this stay where they are.
- **One growing store per downloaded pair** (Minato): every chart (trade,
  review, Outlook, bias grading) asks `candles.loadDay`. For a pair
  downloaded on Replay → Data, replaydata.js answers (`useLocalPrices({
  read, grow })`, registered so the two files don't import each other):
  `dayFromDownload` reads a day the month files hold whole; a finished day
  they don't reach yet makes `growFor` grow the download to now (missing
  months, and the current month from its last candle — `growMonth` asks only
  for what comes after), then it is read from there. No day file is written
  for it. Today always comes from OANDA. Pairs not downloaded work as
  before (vault day files, fetched once). Update on the Data page grows the
  current month the same way instead of refetching it. Day files saved
  before this stay where they are.
- **Charts that load** (`tradeChart`) expose `card.__ready` — resolved once
  the chart is drawn or a message shows. The review builds the next trade's
  chart out of sight and swaps it in on `__ready`, so switching trades no
  longer flashes a short message → a tall empty box → the chart. "Getting
  the prices…" only appears after 400ms (vault prices come at once).
- **`el(tag, props, ...children)`** in `ui.js` skips `null` and `false`
  children. **`replaceChildren` does not** — it renders the literal word
  "null". Always `.filter(Boolean)` before handing an array to
  `replaceChildren`. `tests/suites/views.mjs` checks for stray values on every
  page because this has happened more than once.
- **CSS custom properties are the design tokens.** `[data-theme]`,
  `[data-glass]` and `[data-bg]` on `documentElement` switch them. Text wears
  ink tokens (`--ink`, `--ink-2` …); only marks wear data colours.
  `--green`/`--profit` are overwritten at runtime by the user's chosen colour,
  so **`--profit-rgb` is the live triplet** — use that in `rgba()`.
- **Ink runs `--ink` → `--ink-5`**, loudest to quietest. `--ink-5` was used
  for months before it was defined, so everything wearing it quietly fell
  back to its parent's colour; it now exists in every theme. Check a new
  token is defined in `:root`, `[data-theme="dark"]` and the glass block.
- **Live is blue, forward test is magenta** (`--s-live`, `--s-fwd`) wherever
  the two appear as series. Never green or orange — those mean money made and
  lost everywhere in the app. The pair was run through the dataviz palette
  validator against both card surfaces.
- **`.lbl` and `.eyebrow` are `text-transform: uppercase`.** A test that reads
  `innerText` sees `CHARTS`, not `Charts`. This has caught me four times.

## Where the data lives

`store.js` owns seven JSON files in the user's vault:

```
data/accounts.json  data/trades.json  data/playbook.json  data/replay.json
data/outlooks.json  data/news.json    data/wire.json
```

plus `screenshots/` for chart images. `fs.js` puts four backends behind one
interface — **native** (Tauri/Rust), **browser** (File System Access API),
**local** (localStorage) and **memory** (the preview build) — so nothing above
it knows where it is running.

`store.heal()` migrates older shapes forward on load. Every shape change needs
a migration there and a case in `tests/suites/heal.mjs`; a vault written by an
older version must still open.

### The rule that matters most: say what you know

A number that was never entered is `null`, never `0`.

- An **open trade** has `netResult: null`. Not zero — zero is a break-even, and
  a break-even is a result.
- A **forward test** has `netResult: null` and a stated `rMultiple`. It has no
  money and no size, so the Trades table prints `FT` in those columns rather
  than a dash that would read as nothing.
- **A month you did not trade draws as nothing**, not as a flat line at zero.
- `calc.rMultiple()` prefers a stored `trade.rMultiple` over one derived from
  money, so a forward test keeps the R you gave it.

`c.pct(v)` **already multiplies by 100.** Passing `x * 100` gives "7273%".

### The Live / Forward test / All switch, and its one exception

`store.tradesFor()` filters by that switch, and every page is built on it —
that is why the whole app follows the switch without a line of its own.
**Analytics → Weekly winrate and The Lab are the two pages that do not.** Its purpose is
live and forward tests side by side, so it reads `store.everyTradeFor()` and
splits them itself; following the switch would leave one of its two columns
empty however it was set. The two are never added together there. The Lab has
its own Live / Forward test / Both setting, because which trades a simulation
is built on is a choice about that simulation, not about the whole app. Anything
else that needs to bypass the switch should be just as deliberate and just
as commented.

### The Lab

`src/js/lab.js` is a Monte Carlo of a prop-firm challenge, played on the
journal's own trades against a rule sheet the user types in. The page is two
routes: `#/lab/prop` (the "Prop firm" page) is the answer only — five figures and three charts, no form —
and `#/lab/rules` is the rule sheet. `#/lab` itself is now the plain Monte Carlo below. Keep writing off the answer page; the
suite fails if any piece of text there runs past twelve words. There are no
firm presets, on purpose — firms change their terms, and a guessed number
looks just as right as a real one. The sheets live in `data/lab.json`.

What it assumes, and why:

- **Whole days are resampled, not single trades.** A day from the journal is
  drawn with every trade in it, in closing order, so trades per day and what
  happens after a loss come from real behaviour, and a daily limit meets real
  days.
- **Seeded.** Same trades and rules, same answer. A number only moves when
  something changed.
- **It reports its own uncertainty.** The headline is run again on 40
  resampled histories; the spread of those averages, less simulation noise,
  is the "likely between" range. On a small sample that range is wide, and
  it should be.
- **Break-even edge** is found by shifting every trade's R by the same amount
  and bisecting to where the average is zero, on common random numbers.
- **Limits are checked on closed trades.** A journal cannot see how far a
  trade went against you while open, so an intraday trailing drawdown is an
  approximation (optimistic), and the page says so.
- Calendar rules (payout every 14 days, 6 months funded) are converted to
  drawn days at the rate the user actually trades, from their own calendar.

`tests/suites/lab.mjs` checks every rule on single-day histories, where the
answer can be worked out on paper.

**Monte Carlo** (`#/lab`, engine `src/js/mc.js`, page `views/montecarlo.js`)
is the firm-free simulation: 4,000 runs of the next 50/100/250/500 trades,
each run first resampling the journal (so edge uncertainty widens the
spread), everything in R and only scaled by the risk setting, so changing
risk never re-runs. Settings live in `lab.mc` {risk, horizon, ddLimit} and
stay pinned above the scrolling page. "How much to risk" uses `riskFor`,
which handles ties in the drawdown list so the suggestion never sits on the
limit; the shown value is rounded down. Kelly is the log-growth optimum,
shown as a ceiling only. Suite: `mc.mjs`.

**Ghost** (`#/lab/ghost`, engine in `src/js/ghost.js`) replays the user's own
trades keeping a rule they did not — stop after N losses, skip Fridays, only
one setup. It never simulates: the ghost only ever *leaves out* real trades.
Filters (days, sessions, setups, instruments, tags) apply first, then day
rules in the order trades were taken, and the trade that triggers a stop is
still taken. Every result carries a luck test — the share of random skips of
the same size it beats — because a rule found by looking back is the easiest
thing in trading to fool yourself with.

### Profit and loss colours

Settings → Appearance has a dropdown for each, both over one shared palette
(`PALETTE` in `views/settings.js`, grouped by family, ~60 colours including a
dozen greys). Any colour may be profit or loss — Minato asked for that
explicitly. White (#E9E9E9) and Black (#3D3D3D) keep their old values so
saved choices keep their names; a colour from before the palette shows as
its hex. The menus open upward, since they sit at the foot of the card.
Suite: `pnlcolours.mjs`.

### New trade form

Ten numbered sections (`sec()` in `views/addtrade.js`). Left column: the trade,
prices, timing & size, outcome (status, type, risk/result, exit reason),
context (setup, session, execution timeframe). Right column: mindset
(confidence going in, feeling after — both 1–5 slides), execution (mistakes,
price delivery), tags. Across the foot at full width: charts and notes. The
form scrolls inside its card; the header with Save stays put.
Trade fields: `confidence` 1–5 (1 Revenge … 5 Confident), `emotionAfter` 1–5
(1 Angry … 5 Satisfied), `exitReason` ('tp'|'sl'|'be'|'manual'|'trailed'),
`execTf` ('1m'…'D'), `mistakes` (array of MISTAKES keys), `delivery`
('good'|'neutral'|'poor'). Null means not answered. An open trade saves
`exitReason` and `emotionAfter` as null. Slides are built once and updated in
place so a drag is never interrupted. Suite: `tradeform.mjs`.

The lists themselves live in `src/js/questions.js` (pure, no DOM), which
`addtrade.js` re-exports. Also there: **if held** — `heldOutcome`
('win'|'be'|'loss') and a signed `heldR`, what a trade would have made had
it been left alone. Asked (`heldAsked`) only of a closed trade whose exit
was 'manual' or whose mistakes include 'closed_early' or 'be_early'; the box
(`views/held.js`, `heldEditor`) opens under the exit reason the moment that
is true, and the answer is cleared on save once it no longer applies.
`heldOf(t)` reads it back with the sign fixed; `questionCells` /
`readQuestions` write and read the CSV columns.

News is asked too (section 08 on New trade): `news` — 'none' | 'before' |
'during' | 'after' | 'between' (which news mattered to the pair is the
trader's call, so it is never set automatically) — and `holidays`, an array
of country keys from `HOLIDAYS` ('US', 'UK', 'EU', 'JP', 'CA', 'AU', 'NZ',
'CH', 'CN'), empty on an ordinary day. The day's red-folder events and
holidays from the kept calendar (`data/news.json`, this week only) are shown
under it as a reminder. "Trailed" was removed as an exit; the store heals a
saved 'trailed' to null.

Prices decide the result while you type them (`fromPricesOf` in
addtrade.js): exit at the target is a win and Take profit, at the stop a
loss and Stop loss, at the entry Break-even; otherwise profit or loss by
direction. An exit reason picked by hand is never overwritten, and opening an
edit never changes anything. Editing a forward test now opens on its saved
result (it used to read only the money, which a forward test has none of).

### Where the questions are read

- Trade page (`tradedetail.js`, `howItWent`): a "How it went" card, left off
  for trades logged before the questions.
- Analytics → Execution: "Around the news" (R per timing) and "Bank
  holidays" (ordinary days, any holiday, each country).
- CSV: ten columns after `mode` — `confidence, emotionAfter, exitReason,
  heldOutcome, heldR, execTf, mistakes, delivery, news, holidays` — in words ("Closed
  manually", "Closed early;Wrong bias", "None" for no mistakes, blank for
  never asked). The broker importer reads them back (`trade.questions`) and
  the import page saves them with the trade.
- Weekly review: the trade card shows what was logged ("When logged"),
  pictures in two rows (when you took it / after), and asks only what the
  close makes sense of (`closedBy`, `reviewOf`, `suggestWhat` in review.js):
  take profit — direction preset Right, Available from what was taken,
  Heat, Better exit; stop loss — Direction first, then Heat (from 1R) and
  "Ran after" only if Right; break-even — "Ran after BE" and Heat; closed by
  hand — Available, Heat and "If held" (the only kind asked it). Heat goes
  whenever the direction is Wrong (and is cleared from the trade). "Early
  entry" ticked on New trade presets Entry. Presets are outlined blue and
  count in the week's numbers until you change them; the likely "what
  happened" is outlined dashed and needs a click to count. The Week tab adds "How you
  traded it" (`weekHabits`): clean trades, mistakes by count, average
  confidence and feeling after, and what holding would have changed.
- Trades: filters for mistake (incl. "Clean — none" and "Any"), exit,
  confidence (incl. 4+ and 2 or less), timeframe and news (a timing, "Around
  news", or "Bank holiday") (`matchesQuestions`).
  The bar wraps; each select is sized to what it shows.
- Ghost: "Only confidence N+", "Only timeframes" (unanswered trades are left
  out), "Skip news timing" chips and "Skip bank holidays", and "Leave trades to TP" (`heldRows`), the one rule that changes
  results rather than skipping trades — it counts each held answer instead
  of what was taken.
- Dashboard: "Clean wins" was taken off Your edge in Laminar 3.1 (Minato
  did not want it there).

Suites: `carry.mjs`, `closing.mjs`.

### Weekly review

`#/review` (one trade at a time) and `#/review/week` (what it adds up to),
in `views/review.js`. Answers live on the trade as `trade.review`
{avail, heat (a positive size), better, dir, what, entry, plan, grade,
lesson, after[]}; a trade counts as reviewed once `what` is set. "After"
screenshots are `screenshots/<id>-after-<x>.jpg`, listed by `reviewShotsOf`,
carried on a vault move and deleted with the trade. Week notes are in
`data/review.json` keyed by ISO week ('2026-W38'). Ctrl+V on the Trades tab
adds an after picture, listened for on the document like New trade.
`weekStats` is the arithmetic; suite `review.mjs`.

### The dashboard

Four cards in `views/dashboard.js`: the result with its equity curve (cents
kept but small, so a $1.20 scratch still shows), "Your edge" (win rate on a
bar with the break-even rate marked, expectancy, payoff, profit factor, the
last 20 trades as a strip), "Where it comes from" (net by setup, session and
instrument on one shared scale), and the six trades closed last. It borrows
`sequence`, `deepest` and `streaks` from `an-overview.js`. `tradeRow` stays
exported because the Trades page still uses it. Suite: `dash.mjs`.

### Analytics · Overview and Timing

Both tabs are drawn in The Lab's hand and live in their own modules:
`views/an-overview.js` (six tiles with sparklines, equity with the drawdown
panel beneath it, the R spread, setups racing, instruments) and
`views/an-timing.js` (the week as a day × hour grid with totals on both
edges and your sessions bracketed above it, sessions, time in trade, trade
of the day). Shared pieces are in `views/chartkit.js`: `unitKit` formats in
whichever unit is on, `spark`, `tipLayer` and `hoverLayer` do the readouts.
Every figure follows the scope switch and the 7D/30D/90D/All window. The
suite `anviz.mjs` works every number out again from the trades.

Tags (still in `analytics.js`) is one list per tag group: trades, win rate,
a bar of R per trade either side of a zero shared by the whole page, and
total R. Sorting is by clicking the column names, which stay pinned while
the groups scroll; a group folds from its header; the "dim under N trades"
stepper sits in the page header. Won/lost/break-even and "points against
your own win rate" are in each row's hover text.

### Analytics · Execution

`views/an-execution.js` reads back the questions New trade asks —
confidence going in, feeling after, exit reason, mistakes, execution
timeframe, price delivery — all in R per trade. `execStats` works it out
once: a column per confidence level and per timeframe, a 5 × 5 grid of
confidence against feeling after (coloured by R a trade, count in each
cell), what each mistake cost against a clean trade (`(avg − clean avg) ×
times made`, costliest first), how trades ended (share bar plus rows), and
good/neutral/poor delivery. Only closed trades with an R count; a trade
without an answer is left out of that question only, and each card says
"N of M answered". Groups under `ENOUGH` (3) trades are faded and never
called the best. With nothing answered the tab shows a prompt instead.
The constants come from `addtrade.js`. Suite: `anexec.mjs`.

### The Ledger folder

Journal folders made while the app was called Ledger (Documents\Ledger) are
renamed to "Quire" once, when the desktop app opens them: `fromLedger` in
fs.js, through the `rename_dir` command in main.rs (never overwrites; Rust
tests `rename_tests`). Only a folder called exactly "Ledger" is touched, and
only if nothing called Quire is beside it; a refused rename (a file held
open, OneDrive mid-sync) just opens the old folder as before and tries again
next time. The app's own config stays where it is (identifier
`com.minato.ledger`, `ledger.json`) — changing the identifier would make
Windows treat it as a new app and forget the folder. Suite: `renamevault.mjs`.

### Prop firms

`#/firms` (and `#/firms/<id>`), last in the sidebar, in `views/firms.js`. The
data is `src/js/firms.js` — 6 futures firms (Topstep, MyFundedFutures, Apex,
Take Profit Trader, Tradeify, Lucid) and 5 forex (FTMO, The5ers, FundedNext,
FundingPips, FXIFY), researched on 2 Oct 2026 from each firm's own help centre
with independent guides filling gaps (those rules are tagged "Fine print").
Each firm: programs → sizes (price, activation, target, maxLoss and its type,
lock, dailyLoss, maxSize, minDays, consistency), stages, payouts, 8–12 rules
(danger / caution / info, most dangerous first), Quire's take (pros, watch,
verdict), sources. Trust (half stars) and the Trustpilot figures are set in
the build step. A null price means "depends on options — see site"; FTMO's
programs carry `currency: '€'`. The page: ranked rail with stars, hero with
account/size pickers, six tiles, the path, the max loss drawn by its type,
"Against your journal" (`journalChecks`: losses in a row the max loss
survives at your default risk, worst day, best day vs the consistency rule,
trades logged during news), payouts, a cost calculator (`costs`), filterable
fine print, Quire's take and sources (copied to the clipboard in the desktop
app, which has no opener). "Use in The Lab" writes a rule sheet
(`sheetFor`) — updated, not duplicated, on a second click. Firms change rules
often: re-research and bump `CHECKED` rather than editing numbers piecemeal.
Suite: `firms.mjs`.

### Weeks and months

`src/js/periods.js` holds the period arithmetic — ISO weeks (Monday to
Sunday, the same numbering the Replay page uses) and calendar months, keyed
as `'2026-W38'` and `'2026-09'` so they sort the way time does. It is pure,
and `tests/suites/weekly.mjs` checks it directly, including a 53-week year
and weeks that straddle a month or a year. A period's drawdown is measured
trade by trade in closing order, **from where the period started** — two
losses to open a week is a 2R drawdown with no win before them.

## Talking to the outside world

The desktop app's CSP is `default-src 'self'` with no `connect-src`, so the
webview cannot make cross-origin requests at all. Anything from outside goes
through the Rust command `fetch_text`, and `check_url` holds an allowlist:

```rust
const ALLOWED: [&str; 2] = ["nfs.faireconomy.media", "investinglive.com"];
```

**Every new host is a deliberate line here**, https-only, credentials in the
authority rejected, with tests in `main.rs` that try lookalike domains
(`investinglive.com.evil.tld`, `x@investinglive.com`). Adding a feed means
adding a line and its spoofing tests — not loosening the check.

Nothing about the user is ever sent. Each fetch is a GET for a public file.

The one exception is OANDA, for the trade chart, and it has its own command
rather than a line in `ALLOWED`: `fetch_oanda(path, token, live)` only ever
calls `api-fxpractice.oanda.com` or `api-fxtrade.oanda.com`, and
`check_oanda_path` only lets through `/v3/instruments/<NAME>/candles?<query>`
(tests in `oanda_tests`). The user's own key goes in the Authorization header
and nowhere else.

### Review: taken · available · planned

The week's (and month's) gauge card, redone at Minato's request:
**taken** = the R the trades made, losses included; **available** =
`leftOf` — only for a trade got out of early (closed by hand, BE, or no
reason) whose target was then reached: the rest of the way to the target
(held-to-target win R − R taken; for a BE/other exit with
`review.chart.reachedTarget`, planned R − R taken); **planned** =
`plannedR` summed over closed trades — had every one hit its target. The
arc and "of planned" % are taken ÷ planned. "Left on the table" tiles show
the same early-exit figure. `weekStats` keeps its older `available` /
`left` / `capturedTaken` fields (sums of "could have made") for the
scatter and averages, but the card no longer uses them.

### Red folders are not bank holidays

The Forex Factory feed keeps `impact` **High** (red folders) and **Holiday**
(bank holidays). They are shown apart everywhere (`isRedFolder`,
`isBankHoliday`, `holidayCountry` in `questions.js`): the Outlook strip
counts and lists red folders only, with bank holidays on their own line
("Bank holiday · Japan"); the Newswire ticker scrolls red folders and names
the day's holidays beside its label; the week list shows a holiday as "all
day · Bank holiday · <country>" with a plain square, not a folder; New trade
and the review say "Bank holiday", never "Holiday". The chart only marks red
folders.

### News on a trade, off the calendar (`newsday.js`)

- **The calendar keeps its weeks.** `store.saveNews` merges: what a read
  returns replaces only the stretch of time it covers (`span`, first to last
  event); earlier weeks stay. `news.spans` lists every stretch read (healed
  from the events on old vaults). The Newswire week list shows only the
  latest `span`.
- **Whose news counts.** A red folder counts only for the pair's own
  currencies (`pairCurrencies` = `currenciesOf(oandaInstrument(pair))`:
  AUDUSD → AUD, USD; gold and NAS100 → USD). A CAD release is not news for
  AUDUSD — Minato's rule, no "related currency" links. A bank holiday
  counts from any country.
- `covers(news, date)`: the calendar was read for that Mon–Sun week.
  `dayNews` → `{ red, holidays }` or null when not covered.
- **New trade → News**: Timing chips (unchanged, `news`), then **Red
  folder**: the day's red folders for the pair as chips; one is picked
  automatically, several → "pick the one that mattered"; none → N/A. Saved
  as `newsEvent {title, country, at}`. **Bank holiday**: read-only, from the
  calendar (`holidays`, country keys, `holidayKey` falls back to the
  currency), or N/A. The manual holiday chips are gone. A day not covered:
  a text field for the release (`newsEvent` with `at: null`) and a select
  for the holiday. Re-filled on date or pair change and on opening an edit,
  so a covered trade's old wrong ticks are corrected.
- Trade page: News timing · News ("USD · Core PCE…" or N/A) · Bank holiday
  (or N/A). Review "When logged" adds a Red folder pill.
- **Every page reads the calendar** (`newsOf`, `newsText`, `holidayText`):
  for a day the calendar was read, the trade page, the review's "When
  logged" pills, the Trades filter, Ghost and Analytics show the calendar's
  red folders and bank holidays — whatever was saved on the trade (an old
  tick, nothing). Only an uncovered day uses what's on the trade. Several
  red folders and none picked: all of them, "USD · NFP, Unemployment Rate".
- **A clock change is not a bank holiday.** FF files "Daylight Saving Time
  Shift" under impact Holiday. `isBankHoliday` needs "holiday" in the
  title; `parseFeed`, `saveNews` and `heal` drop the rest.
- Last week can't be filled in: FF publishes only this week's feed
  (`ff_calendar_lastweek.json` is a 404).
- **Analytics → Execution → News** (was "Bank holidays"): Red folder day /
  Bank holiday / No news, each with total R, trades, win rate
  (`execStats(..., news).newsDays`, `newsDayOf`). Calendar where covered,
  else the trade (`newsEvent` or a before/during/after/between timing → red;
  `holidays` → holiday). A day can be both, and counts in both. "Around the
  news" (timing) stays.
- Suite: `newsday.mjs`.

### Review → Month

A third tab beside Trades and Week (`#/review/month`, `monthTab` in
`review.js`). The month is its own state (`month`), following the week (the
month its Thursday is in) until stepped; stepping a month moves the week to
that month's last traded week. Top: the month added up (`weekStats` over its
trades — taken, win rate, plan followed, early entries, left on the table,
reviewed) beside the capture gauge. Then **Week by week** (`monthWeeks`,
exported: ISO weeks overlapping the month, each counting only its days
inside the month) with an R bar, trades, win rate, plan, early entries,
grades, reviewed and a ✓ for weeks marked done; best and hardest weeks are
tagged; a row opens that week. Then the month's habits and what-happened
mix, and, scrolling down, a card per week with its What worked / What to fix
/ Focus notes (read-only — "Open week" to edit). Suite: `reviewmonth.mjs`.

### The trade chart (OANDA)

**Mostly for looking.** The candles are OANDA's mid prices. At first Minato
wanted nothing computed from them; on 3 Oct 2026 he changed that for the
**weekly review only**, because he marks and enters on OANDA's chart so the
prices match his. Nothing else (stats, heat maps, Ghost inputs other than
the held answer below) is computed from candles.

**The review, read off the chart** (`src/js/tradeplay.js`, pure; `review.js`
`ensureFacts`/`factsOf`):
- `measure(trade, rows, window, kind)`: **heat** (furthest against you while
  in, R; 1R for a stop-out), **toStop** (how close to the stop, shown in
  pips — `pipOf`: FX 0.0001, JPY 0.01, XAG 0.01; **gold in points of $1**
  (4080 → 4081 is 1 point — Minato: gold is points, not pips); indices
  points. `inPips` rounds whole from 100, 1 decimal from 10, 2 below),
  **availR** (furthest your way from entry until the original stop is
  touched after the exit, or a day after the exit; for a stop-out only what
  it did *after* the stop), **held** (closed by hand: from the minute after
  the exit, original target or stop first — same minute counts as the stop),
  **reachedTarget**; **couldR** — "could have made": the target's R if price
  reached it, else the best it got, **never more than the target** (Minato:
  how far it ran past the target is not the trade's business) — this is
  what fills `avail` now (`review.chart.v` = 3; older caches are re-read);
  **duringR** (best while in); **pastStop** (stop-out that then reached the
  target within a day: how far price went *beyond* the stop — from the
  candle that took the stop to the one before the target — before turning;
  null if the target was never reached). "From your stop" (how far it went
  your way) was removed at Minato's request.
- **Heat is called Drawdown** everywhere on screen (Minato's word); the
  field is still `heat` / `heatR` in the data.
- **Ran before stopped out** (`review.ran`, filled from `duringR` — the best
  it got your way while in): asked of every trade that ended at a stop,
  break-even, or a loss (`gaveBack`). Yellow from `RAN_ENOUGH` (1R) — the
  trap of aiming at a level that never goes, up 5R and back to BE. Typable
  in Edit. Week and Month: a **Ran before stopped out** tile — how many were
  up ≥ 1R then BE/loss, the R they were up between them, the most
  (`weekStats().ranBack / ranBackR`). Month stats are 3 × 3.
- A stop-out's card says **Drawdown: Trade lost** (never "−1.0R"), the ruler key
  says "trade lost", and the Edit boxes for a stop-out are just Could have
  made. Direction Right + `pastStop` shows **Past your stop: N pips/points**
  — within `NEAR_STOP` (5) "then on to your target", further "not counted".
  Week and Month tabs: **Just past your stop** — how many stops went ≤ 5
  past and then to the target, of how many went on to the target at all
  (`weekStats().pastStops / nearStop`). Month also shows Stopped, but right. "What happened" gained **TP too far** (`tpfar`), suggested when a
  trade got ≥1R and ≥60% of the way to target while in, then turned and was
  stopped / BE'd / held to a loss.
- Kept on the trade as `review.chart` with a `key` of the trade's prices and
  times; read again only when the trade changes or the prices did not yet
  reach a day past the exit (`covered`).
- A manual close's held answer is written to `heldOutcome`/`heldR` with
  `heldAuto: true`; typing your own (review Edit box or New trade) sets
  `heldAuto: false` and the chart never overwrites it again.
- The card shows these as **information** in a "From the chart" box; one
  **Edit** at its right turns them into boxes (typed numbers win; "Use the
  chart" clears them). Without a key, or with no prices, the boxes show.
- The reviewer is asked only: **Direction** (losing trades only — a stop-out
  that reached the target after is pre-filled Right), **Better exit** (target
  hits), **Entry**, **Plan followed**, **Grade**, What happened, Lesson.

New trade, same day: the **Class** picker is gone — `classOf(pair)`
(`broker.guessAssetClass`) sets it, shown as a hint in the instrument box;
**Still open** hides Mistakes and Price delivery (saved as `null`, the
sections renumber) and the trade page hides them too; **Forward test** hides
**Size**.

- `src/js/candles.js` — instrument names (`oandaInstrument`: XAUUSD, GOLD,
  MGC → `XAU_USD`; NAS100, MNQ → `NAS100_USD`; any 6-letter FX pair), the key
  (`getKey`/`setKey`), parsing, `tradeWindow` (entry/exit; a close earlier
  than the open is the next morning; an open trade ends now),
  **`weekWindow`** (Sunday 00:00 UTC of the entry's week to Saturday 00:00
  UTC of the exit's week, Saturdays skipped, never past now),
  **`monthWindow`** (whole trading weeks from the week of the 1st to the week
  of the last day of the trade's calendar month, ~22 trading days, ~1.5 MB a
  pair), `loadDay`, `loadDays` (three at a time), `aggregate`.
- **Loading:** `candlesFor` returns the trade's **week** (chart up quickly)
  and names the rest of the month in `rest`; the chart fetches those behind
  it and `extend()`s, keeping the same moments on screen. The header says
  "loading the month…" meanwhile.
- **Timeframes** 1m · 3m · 5m · 15m · 30m · 1H on the clock; **4H and D from the 17:00
  New York rollover** (`rolloverOf`, `tradingDayOf`; DST via `Intl`), the way
  OANDA and TradingView draw them. Switching to 4H/D shows the whole week.
- **The key is not in the vault.** `fs.getSetting/setSetting`: the desktop
  app's `ledger.json` config, or `localStorage 'quire:setting:*'` in a
  browser. Settings → Charts (`views/oandakey.js`), at the bottom of the
  right column.
- **Candles are kept** as plain JSON, one candle to a line, at
  `candles/<INSTRUMENT>/<UTC day>.json` (~60 KB a day), only once the day is
  over and only in a real folder. Not in a vault export (they can be fetched
  again). The user said not to compress them. Days are also held in memory
  for the session (`forgetCandles()` clears it — tests use it); a day still
  running is asked for again after a minute. Every trade on the same
  instrument that week reads the same days.
- `views/tradechart.js` — `tradeChart(store, nav, trade, { height, now })`.
  Draws, and nothing more: candles; Playbook killzones shaded and named;
  red-folder news (`impact 'High'`) for the instrument's currencies — events
  at the same moment share one marker with names stacked, blocks that would
  overlap drop a row, names flip left near the right edge, nothing outside
  the loaded prices; the position as two boxes between entry and exit time
  (a manual close keeps the original TP box); **a small dot + "Entry" and
  "Exit"** — Minato asked for **no dotted level lines**; TP / SL / Entry /
  Exit prices as tags on the right axis (Exit only when it is not at TP, SL
  or entry). The candle under the crosshair is read in the **status line**
  (top left), not the footer. **No grid lines** by default (Minato asked
  them gone; Chart Settings → Canvas can turn them on). Everything but the killzone names is clipped to
  the plot, so candles dragged up or down never cover the time labels.
- Lines are kept per instrument **and per place**: the trade page and the
  weekly review share `lines[XAU_USD]` (the execution's markings); the
  Outlook passes `lines: 'outlook'` and keeps `lines['outlook:XAU_USD']`.
  Lines drawn on the Outlook before 2.19 sit in the shared set.
- Dragging sets `is-panning` on the plot — never `is-dragging`, which is the
  sortable lists' class (shadow, 1.5% zoom, fade) and made the card jump.
  **Sessions** and **News** switch on/off under **Indicators** in the top bar
  (`quire:chartSessions`, `quire:chartNews`). The expand button (or Esc to
  leave) takes the chart **full screen** — the card is moved to `<body>`
  behind a placeholder comment and put back after; leaving the page ends it.
- **Moving it — TradingView's rules** (`chart/core.js`, see
  below). Drag in the chart: time sideways, and prices up/down (a
  vertical drag past 6px turns auto off). Drag the **price scale**:
  squeeze/stretch prices. Drag the **time scale**: TradingView's grab — the
  right edge stays and the time you grabbed follows the pointer (left
  spreads the candles out, right squeezes them in; Minato). Wheel: time around the pointer (prices, over
  the price scale). Double-click the price scale → auto; the time scale →
  the trade's time; the empty chart → nothing (as on TradingView).
  **Alt + R** / right-click → Reset chart view → back to the trade. The
  **auto** button in the corner under the price scale. Auto is **off** by
  default (Minato: "make it so it doesn't move at all"): the price scale is
  placed once — on opening (`fit()`, opened up to show the whole position),
  on a new timeframe, or on reset — and then holds still.
- **Replay** works like TradingView's: pressing it first asks where to
  start — a line follows the pointer and everything after it is dimmed; a
  click starts there, paused (or "Just before the entry"; Esc cancels;
  "Select bar" picks again). **Up top**, beside the timeframes: one
  candle back · pause/play · one candle forward, and the speed (the Line
  button and the subtitle step aside while it runs). **Underneath**: Play,
  Follow price / Free view, the replay's time, Select bar, End replay.
  Speeds 1× 2× 5× 10×
  (250 → 25 ms a candle, `quire:replaySpeed`); **Follow price / Free view**
  (`quire:replayFollow`; follow keeps the newest candle in view sideways and,
  with auto off, up and down; dragging the chart while following switches
  to free), the replay's time, End replay. Space and ←/→ while the pointer
  is on the chart. It pauses at the last candle.
- **Drawings** — see "The drawing tools" below. The old `Line` button is
  gone; its lines (`{ id, t1, t2, p, label }`) still load, as dotted grey
  trend lines with the label above (`normalize`), and are saved in the new
  shape the first time they are changed.
- **Trade page**: the chart is the first card on the left; screenshots at the
  bottom; the left column scrolls.
- **Weekly review → Trades**: the chart for the picked trade runs across the
  whole width at the top (440px) and the tab scrolls as one page, the list
  sticky beside the questions. It is rebuilt only when the picked trade
  changes, never when an answer is saved. In the review card the
  screenshots come **last**, under the questions — only the ones logged
  with the trade: the "after" picture (paste/drop) was removed on 3 Oct,
  since the chart shows what price did after. Old after pictures stay in
  the vault (`review.after`, still exported and deleted with the trade).

- **Outlook**: each instrument block is half writing, half the
  instrument's live chart (`tradeChart(…, { plain: true, focus })` with a
  stand-in "trade" for the day — no levels, dots or position; opens on the
  day before and the day itself; 470px tall). Adding screenshots was
  removed (3 Oct): a block with older ones shows "N earlier screenshots",
  opening them full size; they are still deleted with the block.
  `obshots.mjs` went with it; `outlook.mjs` and `reviewauto.mjs` cover the
  chart.

The sandbox could not reach OANDA, so it was built to the documented v20 API
and `tests/suites/tradechart.mjs` fakes both hosts. Minato has since run it
against the real API (screenshots on 3 Oct 2026 showed real XAUUSD candles).

## The outlook, graded (`outlookedge.js`, `views/an-outlook.js`)

The morning outlook joined to the day and the trades (Minato):
- **Bias right**: each Long / Short call (`callsBetween`) graded on its
  **daily candle** — New York 17:00 to 17:00, the one holding the date's
  local midday (`dayCandleSpan`) — from the saved 1m prices (`loadDays`,
  kept in the vault). Long right = closed above its open, Short = below;
  Neutral is not a call; flat, no prices, no key, or a day not over → not
  graded (`gradeCalls` → `{ list, right, wrong, rate, waiting, why }`,
  memoised for the session).
- **With / against / no bias**: each closed trade beside the bias written
  that morning for its instrument (`biasFor`, `sideOf`): Same (Long →
  bought, Short → sold), Different, None (Neutral or nothing written) —
  `biasBuckets` gives n, total R, win rate, average.
- Shown on **Analytics → Outlook** (the period control applies; four tiles
  and a list of calls: the day's move, right / wrong, what was traded on it,
  R, › opens that morning), in a **strip** at the top of the Outlook page
  (last 30 days; click → Analytics → Outlook), and under each outlook
  block ("The day closed down 0.42% — your Long was wrong"; today's waits for
  its candle). The verdict line adds "With your bias." when every trade
  went the way you wrote. Suite: `outlookedge.mjs`.

## The chart engine (`src/js/chart/`, stage 2 of Replay)

Every chart — trade page, weekly review, Outlook, and Replay to come — is
one engine made to look and behave like TradingView's. Only the chart
follows TradingView; the page around it is Quire's.

- `chart/core.js` — `createCore(plot, { store, inst, dp, symbol, source,
  bars, tf, hooks })`. Time is **bar spacing** (px a candle) and the bar
  index at the right edge (`view.spacing`, `view.right`): zooming changes
  the spacing and the bodies with it (`bodyWidth`: TradingView's curve — 3px
  between 2.5 and 4px spacing, else a little under the spacing); a resized
  window shows more or fewer candles, never stretched ones. Spacing 0.5–60px,
  and never more than the loaded bars × 1.3 across. Candles are painted in
  device pixels (crisp, odd widths centred on the wick). The price scale is
  as wide as its widest label. Pane at the top-left, price scale right, time
  scale under (text size + 14px). Crosshair: the line down snaps to the
  candle; price and time tagged on the scales in TradingView's dark label.
  **Status line** (HTML, `.tv-status`): `XAUUSD · 5m · OANDA` O H L C and
  the change, coloured by the candle; the candle under the crosshair, else
  the newest. **Last price**: its tag on the price scale; the dotted line
  across is **off by default** (Minato took it for an exit line — Settings →
  Scales and lines turns it on). **No »** scroll-to-newest button (Minato
  didn't want it; `toLatest()` is still there for code). **Time scale**: candidates
  weighted year 70 > month 60 > day 50 > hours 31–34 > minutes 20–23; the
  finest weight that fits evenly is chosen, then the heaviest first, none
  closer than "00:00" + 18px. Day numbers bold.
  Hooks: `limit()` (replay's last candle), `tags()` (TP/SL/Entry/Exit on
  the price scale), `back`/`front` (paint under/over the candles, clipped
  to the pane), `claim(x, y, G)` → `{capture, move, up}` (a drag of its
  own) or `{click}` (a click, else it pans), `hover` → 'pointer', `onPan`,
  `onReset`, `onTimeReset`, `onInterval(m)`, `menu(ctx)` → extra items, `dbl`.
- **Keyboard**: while the pointer is on the chart or it was last pressed:
  a digit or **d** opens **Change interval** (`menu.js intervalBox`,
  `parseInterval`: "1", "15", "1h", "4h", "d"/"1D"); it says what it means,
  or that the chart doesn't have it; Enter switches, Esc / blur cancels.
  **Alt + R** resets.
- **Right-click menu** (`menu.js openMenu`, TradingView's look): Reset chart
  view (Alt + R), Copy price N, the chart's own items (trade chart: Hide /
  Show drawings, Remove N drawings → asks), Settings….
- **Chart Settings** (`dialog.js`): tabs Symbol (candles **Quire's profit /
  loss** or **Custom** body / borders / wick up+down; precision; timezone),
  Status line (title, OHLC, change), Scales and lines (last price line /
  label, text size 10–16), Canvas (background Quire's / solid / gradient,
  grid vert / horz + colour, crosshair colour / width / style, margins
  top % / bottom % / right bars). Every change previews on every chart at
  once; Cancel / × / Esc drop it, Ok saves. **Template ▾**: Save as…, Apply
  default, the saved ones (× removes). Trading tab arrives with stage 5.
- `settings.js` — one set for the whole app, in the vault:
  `data/drawings.json` → `settings` (and `settingTemplates`), laid over
  `DEFAULTS` by `merge` (junk and wrong types ignored). `onSettings`
  listeners repaint; `offsetOf(tz, T)` / `wall(tz, T)` read the time in the
  chosen zone (Intl, remembered an hour at a time).
- `colour.js` — TradingView's palette: greys, ten hues, four tints and two
  shades of each (80 swatches), + for any colour, opacity. Returns hex or
  rgba().
- Menus and dialogs have TradingView's layout but **Quire's greys and
  font** (Minato): `--tv-bg: var(--card)`, `--tv-bg2: var(--inset)`,
  `--tv-line: var(--inset-2)`, `--tv-ink*: var(--ink*)`, `--tv-font:
  var(--mono)`. The canvas text is `--mono` too; the crosshair labels are
  `--inset-2` (or #2B2F2E when it is see-through), the Entry tag `--flat`.
  The chosen timeframe in the top bar is only brighter text — **no box**
  behind it (Minato).
- The trade chart (`views/tradechart.js`) is now the engine plus the trade:
  position boxes, dots, tags, killzones (names along the bottom), news
  (under the status line), lines, replay, full screen. Its top bar: the
  title and month, timeframes, Indicators ▾ (Sessions, News · red folders),
  Line, Replay, reset, ⚙ Settings, full screen. In the Outlook the
  Indicators and Line labels are hidden to fit.
- Suite: `tradechart.mjs` (TradingView section + chart settings).

## The drawing tools (`chart/drawings.js`, `chart/drawdialog.js`, stage 3)

Only five tools (Minato): **Trend line, Rectangle, Callout, Long position,
Short position** — no highlighter. `createDrawings(core, plot, { store,
dkey, inst, dp, tf(), rows(), replayT(), hideFuture, account(), onTool })` gives the
chart its left toolbar (`.tv-left`: cross, the five, magnet, eye, bin),
paints them (`paint`, in the trade chart's `front` hook, under the dots),
and takes the pointer first (`claim`, `hover`, `dbl`, `menu`, `key`, `tags`).

- **Kept** where the old lines were — `data/drawings.json → lines[dkey]`,
  per instrument and per place (trade page + review share, Outlook has
  `outlook:INST`). Shape: `{ id, type, pts: [{t, p}, {t, p}], style, text,
  hideOn: [tf minutes], locked, at }`, plus `tp, sl, inputs { account, risk,
  riskMode '%'|'$' }` for a position. `store.heal` keeps either shape.
  Tool state: `drawings.json → tools { magnet, favourites: [type], favPos,
  ftbPos, last: { type: { style, text } } }`; drawing templates:
  `drawTemplates[type][name] = { style, text, inputs? }`.
- **Points** sit on the middle of a candle (time = the bar's open), prices
  rounded to dp + 2. **Magnet** (click: on/off; right-click: Weak / Strong,
  `tools.magnetMode`): weak snaps within 10px of the candle's O/H/L/C,
  strong always to the nearest of them.
- **Thickness** from 0.5px (`WIDTHS` in drawdialog.js: 0.5, 1, 2, 3, 4);
  positions have their own `lineWidth` (Style → Lines). Text in the
  **middle** of a trend line breaks the line around it (an even-odd clip)
  — it used to `clearRect` a box, which showed as a dark square on a
  painted background. Hollow candles are drawn as four sides for the same
  reason, their wicks stopping at the body.
- **Price tags** carry no words ("TP", "Entry"…): colour and price only,
  so the price scale stays narrow (Minato).
- **Undo / redo / copy / paste** (per chart, in memory, 100 deep): every
  save / delete / Remove all is recorded as before → after; Ctrl+Z undoes,
  Ctrl+Y or Ctrl+Shift+Z redoes. Ctrl+C takes the selected drawing (shared
  by all charts), Ctrl+V pastes a copy in the same place, selected. Moving
  a drawing shows the plain crosshair pointer (claim `cursor: 'crosshair'`).
- **Drawing**: click–click (the second click finishes the pending one) or
  press–drag–let go; Shift keeps a trend line flat; a tool draws once and
  puts itself away; the new one is selected. Positions: one click — stop
  7% of the visible prices away, target twice that, right edge ~18% of the
  view on; sized from the active account (`startingBalance`,
  `defaultRiskPercent`). A callout opens its Text tab ready to type.
  A new drawing starts in the **style last used** for its type (text empty).
- **Selected**: handles (round; square for positions: entry, tp, sl, end;
  rectangle has 8), the **floating toolbar** (`.tv-ftb`: grip, template,
  colour, background for rect/callout, text, thickness, style, settings,
  visibility, lock, delete — positions: template, settings, visibility,
  lock, delete). Drag the body: moves by whole candles and price; drag a
  handle: reshapes (a long's stop stays below its entry, target above).
  Dragging a position's target, stop or entry draws a dotted guide right
  across the chart at that price, with its tag on the scale (`guide()`).
- **Replay moment**: the trade chart's replay keeps back drawings that
  start after it (not the one being dragged or selected); Replay sessions
  pass `hideFuture: false` — a tool dragged past now stays (Minato).
- **Dotted** = `[w, max(2, 1.6w)]` with butt caps (round caps closed the
  gaps up — Minato wanted TradingView's small gap).
  Locked: won't move. Delete / Backspace removes (only while the pointer is
  on the chart or it was last pressed); Esc lets go / puts a tool away.
- **Double-click → settings** (`drawdialog.js`, TradingView's top tabs):
  Style, Text (colour, size, bold, italic, words, alignment top/middle/
  bottom × left/center/right), Coordinates (price and time — time in the
  chart's timezone), Visibility (per timeframe → `hideOn`); positions have
  Inputs (account, risk % or $) and Style (Candle colours, zones, lines, text, size,
  **Always show stats** — otherwise the labels show when hovered or
  selected). Live preview; Cancel / × / Esc drop it.
- **Template ▾** on the toolbar: Save Drawing Template As…, Apply Default
  Drawing Template, the saved ones (× removes). Applying copies style and
  text (so a "BOS" template brings its words).
- **Position numbers** (`positionNumbers`): qty = risk ÷ (stop distance ×
  USD per quote unit) — quote USD → 1, base USD → 1/entry, else amounts in
  the quote currency (said). **What price did** (`positionOutcome`) on the
  1m rows between its times (and before the replay's moment): stop first if
  both in one candle; else open at the last close. Drawn as a deeper shade
  from the entry to that point, a dotted line to it, and TradingView's
  labels: "Target: dist (%) ticks, Amount", "Open/Closed P&L, Qty /
  Risk/Reward Ratio", "Stop: …". **Colours** default to `'auto'` (profit,
  stop, textColor): zones = the candles' up / down at 20%, labels the
  candles' colours, text `inkOn(bg)`; the old fixed TradingView defaults
  are read as `'auto'`. Style → **Candle colours** ticks back to auto.
- **`inkOn(colour)`** (core.js): dark `#131722` on light colours, white on
  the rest — the last-price tag (white candles), trend-line price tags,
  RSI tags, position labels.
- **Favourites**: right-click a tool on the left → Add to / Remove from
  favorites; a floating bar (`.tv-fav`) you drag by its grip; where it is
  (fractions of the chart) is kept.
- Right-click on a drawing adds its settings, Lock, Remove to the chart
  menu; anywhere: Hide drawings, Remove N drawings (asks).
- In a replay, drawings that start after its moment are not drawn.
- Suite: `drawings.mjs`.

## Replay (being rebuilt in stages)

The old Replay page (an FX Replay CSV compared with the live week) is gone —
the view, and the suites `fxclock`, `realcsv`, `minato`, `repe2e`. Its data
file (`data/replay.json`) is still read and healed by the store but nothing
shows it; `src/js/replay.js` stays because `periods.js` uses its ISO weeks
(suite `rep.mjs`). The full plan — agreed with Minato over many mockups — is
the project doc **quire-backtest-plan.md**. Build order: 1 data, 2 the new
TradingView-style chart (built — see above), 3 drawing tools (built — see above), 4 sessions (built — below), 5 trading (built — below), 6 analytics (built — below),
7 indicators (built — below). Rule: Replay pages use Quire's own design; only the chart is
TradingView's.

**Stage 1 — prices** (`src/js/replaydata.js`, `views/replay.js`):
- Two years of OANDA M1 mid candles per pair (`monthsWanted`: this month and
  the 24 before it), one file a month: `replay/prices/<INST>/<YYYY-MM>.qrc`,
  written with `fs.writeImage` (binary works in every backend).
- Format: `QRC1` magic, uint32 header length, JSON header `{inst, month, dp,
  n, complete, source}`, then 20 bytes a candle — int32 minutes since the
  last candle, open − last close, high − open, open − low, close − open, all
  in units of 10^-dp (dp = the most decimals seen, ≤ 6). The whole file is
  gzipped with `CompressionStream` where available (`pack` / `unpack` sniff
  0x1f 0x8b). ~6 bytes a candle → ~4 MB a pair for two years.
- `chunksOf(month)`: requests of ≤ 3 days (OANDA's cap is 5,000 candles),
  Saturdays skipped, this month cut at the current minute.
- `downloadPair`: every missing month, plus this month again if saved more
  than a day ago; complete months are never fetched twice. Stop (AbortController)
  keeps what was saved. `removePair` deletes files and index line.
- `replay/prices/index.json` is a summary for the screen only;
  `readMonth` / `candlesBetween` read the files themselves (a few months
  kept in memory).
- The page: Price data card (rows: pair, months n of 25, range, size,
  status / progress / Update / Remove; chips for the usual pairs; any pair
  typed), and a Sessions placeholder until stage 4.
- Suite: `replaydata.mjs`.

**Stage 4 — home and sessions** (`replaysessions.js`, `views/replay.js`,
`views/replaysession.js`):
- **Kept** in `data/replay.json` beside the old `weeks`: `groups [{ id,
  name, collapsed }]`, `sessions [{ id, name, groupId, inst, from, to, at,
  layout, tfs[4], balance, risk, riskMode, trades, created, opened,
  finished }]`, `settings { balance, risk, riskMode }` (what a new session
  starts with). Unix seconds. `healReplay` (called by the store's heal)
  drops broken sessions, keeps `at` inside its period, lets go of unknown
  groups. A session's drawings are `drawings.json → lines['replay:<id>']`
  (all its charts share them) and go when it is deleted.
- **Home** (`#/replay`): header Data · pairs · size (→ `#/replay/data`, the
  stage-1 card), Settings, + New group, + New session; tiles Sessions,
  Trades, Total (R; $ when every balance is the same, else "in R —
  balances differ"), Win rate, Last opened, Continue; a card per group
  (folds, kept) and "No group"; rows: name + where it is, pair, period,
  progress bar, trades, win rate, total, Analytics, Open / ▶ Continue, ⋯
  (Rename, Move to group ›, Duplicate — from the start, Delete session…).
  Group ⋯: Rename, Delete group… → "Move the sessions out" or "Delete
  everything inside". Dialogs are Quire's (`.rp-modal`). New session:
  name, pair (downloaded ones), group, from/to dates (inside the saved
  months, refused in words otherwise), balance, risk % / $ → Create and
  open. Analytics pages are placeholders until stage 6.
- **Inside** (`#/replay/session/<id>`): an overlay on `<body>` (`.rs`, so
  the app's re-renders don't touch it), opened/closed by `syncSession`
  from the Replay view and on `hashchange`. Loads 1m rows from a month
  before `from` to `to` (`makeFeed`: `rowIdx`, `barsOf(tf)` cached,
  `barIdx`, `lastRowIn`, `partial`, `stateAt`, `priceAt`, `timeOf`,
  `doneAt`). **T** = the last 1m candle that exists — or, in the 45s
  before a minute's time, that minute forming tick by tick (r0−45 its
  open, −30 / −15 its extremes, r0 whole; `rt.tickPath`: O→L→H→C rising,
  O→H→L→C falling — simulated, only minutes are saved). Each chart's bars array is the full aggregation; `limit` = the
  bar T is in, and that bar is swapped for `partial(tf, k, T)` (the hour
  forming) — so nothing after T is ever drawn. Charts start on auto
  (TradingView's replay default).
- Moving: **Each step** (`.rs-step`, `quire:rsStep`): the chart's
  timeframe (TF), or a set 15s / 1m / 5m / 15m / 30m / 1h / 4h. Step
  forward = finish the forming bar of that size, else the next one (15s:
  the next tick); step back = the previous one; Play at 0.5×–10× steps a
  second (`quire:rsSpeed`); the time shows seconds on 15s. Trades fill
  with `rt.runMoments`: a minute passed whole as before (stop first), a
  minute passed in part tick by tick. **Following**: after a reset (or a
  new chart / timeframe change that puts the view back) the view moves
  with the candles (`c.follow`); a pan by hand (`onPan`) leaves it free; Space / ← / →. Jump to:
  Date and time…, Next <Playbook session> open (each session by name, the
  minute before its start, weekends skipped — `nextSessionOpen`), Next day
  (the minute before 17:00 New York — `nextDay`). At the last candle of the
  period: stops, marks `finished`, **Session finished** modal → Go to
  analytics / Stay here.
- Top bar: name and group, pair, timeframes (active chart), Layout (1–4:
  side by side; one big + two; 2×2), Balance / Open P&L / Risk, full
  screen, chart settings, Exit. The chart last pressed is active (blue
  edge with more than one); the left tools are its. Floating **replay
  bar** (grip → `quire:rsBar`), **bottom panel** (Positions · n / History ·
  n / Session stats; drag the handle, under 30px it shuts; `quire:rsPanel`).
  **Full screen** (`is-bare`): no top bar, tools or panel, OHLC hidden from
  the status line, a draggable timeframe bar with a leave button; Esc.
  `at`, `layout`, `tfs` saved (600 ms after a change, 4 s while playing,
  on pause and on Exit).
- Suite: `replaysessions.mjs`.

**Stage 5 — trading** (`replaytrades.js` the numbers, `views/replaytrading.js`
on the charts):
- A trade lives in its session's `trades`: `{ id, side 'buy'|'sell', from
  'tool'|'manual', openT, entry, qty, sl, tp, initSl, riskAmt, closed,
  closeT, exit, reason 'tp'|'sl'|'manual', pnl, r, drawing? }`.
- **Sizing, the OANDA way**: `sizeFor` = risk ÷ (stop distance × dollars a
  point), rounded **down** to OANDA's unit step (gold and FX whole units,
  NAS100 0.1). `usdPerPoint`: USD quote 1, USD base 1/price, a cross
  through `<QUOTE>_USD` (or `USD_<QUOTE>`) saved prices — loaded when the
  session opens; without them amounts are in the quote currency (a toast
  says so). Risk = `riskMode '%'` of the **balance now** (start + closed
  P&L), or a set `$`. `riskAmt` is what it really risks after rounding;
  `r = pnl / riskAmt`.
- **Fills** on mid 1m prices, no spread: market orders at the close of the
  candle at T. `runTrades(rows, fromT, toT)` on every forward move: each
  row after the trade's open — the stop first (both in one candle → the
  stop), then the target. **Every** stop on the losing side of the entry
  sizes the trade to the risk — the first and each move (Minato); the
  amount is fixed at the first sizing (`riskTarget`), so closes in between
  don't change it. A stop at / past the entry (break-even) keeps the size.
  `initSl` = the stop it was last sized on. While a stop is dragged the
  cluster shows the units it would take.
- **Manual**: right-click → Buy / Sell at market <price>. No stop, no size:
  the replay will not move forward (step, play, jump) until a stop is set —
  `.rt-need` banner, shakes on a try. **From the tool**: a selected Long /
  Short drawing shows a Buy (green) / Sell (red) button (`.rt-go`) just
  right of its right edge, at the entry (kept inside the chart; shown
  even with the trade lines off; the drawing is let go of after a buy) →
  market at the candle's price with the drawing's stop and target; refused
  if price is already past either; the drawing is left alone.
- **On the chart**: dotted lines across — entry grey, TP green, SL red —
  with HTML clusters at the right (`.rt-cl`): entry `[TP][SL] (only while
  unset, drag off to set — "Drag to set target") [qty, blue] [open P&L]
  [✕ close at market]`; TP / SL `[qty] [P&L there] [✕ remove]`. The P&L
  cell is a green box when up, red when down. Drag a TP /
  SL cluster, or its line on the canvas, to move it (refused on the wrong
  side of price). No "BUY" text. Tags on the scale. Closed trades,
  TradingView's way: an **execution arrow** per fill — a buy under its
  candle's low pointing up (green), a sell over its candle's high pointing
  down (red) — and a dotted line from entry price to exit price in the
  trade's side colour. Chart Settings → **Trading** (session charts only):
  lines on/off, P&L on the lines, execution arrows on/off (`trading.arrows`).
  `marks()` on the session handle lists the arrows last painted (tests).
- **Going back** before trades taken (a step back or a jump): "Go back
  before a trade?" → Cancel / Keep / Delete the trade(s). Asked once (a
  second press while it is open does nothing); `.rs-modal-wrap` is fixed
  and centred (it had no positioning before — every Replay dialog fell to
  the bottom left).
- Panel: Positions (side, opened, entry, stop, target, units, risk, P&L,
  R, Close), History (… exit, how), Session stats (trades, win rate, total
  R, P&L, balance, profit factor, average win, period). Top: Balance, Open
  P&L (coloured), Risk. Home tiles and rows count closed trades.
- Suite: `replaytrading.mjs`.

**Stage 6 — analytics** (`views/replayanalytics.js`, at
`#/replay/analytics/<session>` and `#/replay/group/<group>`):
- `analyse(sessions, playbook)`: the closed trades of the sessions in
  view, ordered by close time; equity in R after each, max drawdown (R and
  %), won / lost / BE (pnl > 0 / < 0 / 0), profit factor (won R ÷ lost R),
  average win (R, $), trades by pair, **by day** (Mon–Fri, the day it was
  opened, this computer's time) and **by session** (the Playbook's, by the
  open time; "Outside" only when there are some). `sameBalance` — every
  session started with the same balance — decides whether dollars show.
- Page: Quire's design. Header ‹ Replay, the name, "group · N sessions
  combined" (or pair · period, with Continue). A group has **Combined /
  each session** (remembered while the app is open) and, when balances
  differ, the note "In R and % — the sessions started with different
  balances". Tiles: Total (R; % · $), Trades (by pair), Win rate (won ·
  lost · BE), Profit factor, Max drawdown, Average win. Equity (the app's
  Analytics look: green above zero, red below, the deepest fall shaded,
  crosshair readout; **click** picks that trade). By day / By session bars
  from zero (profit / loss colours, value on each, hover: total, trades,
  win rate).
- Right: the picked trade (default the last) — **its own chart** from the
  saved prices (a timeframe to suit how long it was held: ≤3h 1m, ≤12h 5m,
  else 15m; 1m–4H to switch), the position as boxes from the first stop and
  the target, a dotted line from in to out, Entry / TP / SL tags, the
  session's drawings; Entry, Stop (first), Target, Exit, Result (R · $),
  How, Held, Units; the trade list (newest first) to pick from.
- No trades: "No trades yet" with Open / Continue. A deleted one: "Not here
  any more".
- Suite: `replayanalytics.mjs`.
- **What if** (`views/replaywhatif.js`, numbers in `replaysim.js`), a card
  under the charts with three tabs — Monte Carlo first (the default), then
  Risk : reward, Stop loss (Minato's order; remembered while the app is open). It
  loads each session's saved 1m prices once (`rd.candlesBetween`), then:
  `pathOf(rows, t, end)` = the minutes after the open minute up to the
  original close (closed by hand) or the session's end; `simTrade(t, path,
  { stopMul, targetR })` replays it — stop first in a minute; a hand-closed
  trade no level reaches still exits where it did; one that ran to a level
  runs on to the end (then the last close). R is the new stop's distance.
  Nothing moved (`stopMul` 1, no target) = the trades exactly as closed.
  **Stop loss**: −50 % … +100 % of each stop's distance, target kept; a
  line of total R per step, best marked, tiles beside "as taken" (total,
  win rate, PF, max DD, trades that change). **Risk : reward**: stops
  −40/−20/0/+20/+40 % × targets 1–5R, a heat grid (profit / loss tint by
  size), the sweet spot outlined, pick a square for its tiles. **Monte
  Carlo**: `monteCarlo(rs, { n, runs: 1000, seed })` — bootstrap of the
  real R results (seeded, `rng`), runs of as many trades as taken or 50 /
  100 / 250; fan of 5–95 % and 25–75 %, the median, 12 runs, yours dashed;
  tiles: median end, worst 5 %, ended below zero, max drawdown, longest
  losing streak. Run again = next seed.
- **What if motion** (Minato: "futuristic, minimal, expensive"): plays only
  when something is worked out afresh — first shown, a tab changed, Run
  again, another run length — never on picking a square or a step (those
  glide the figures from their last values, `countTo`). Monte Carlo: a
  canvas cloud of 180 runs (additive light, `keep: 180`; the SVG keeps 12)
  streams in left to right behind a scanning line, the bands open behind
  it, the median draws itself with a light riding its tip (by the line's
  own length), then the figures count up. Risk : reward: the squares
  cascade in diagonally with a flash, the sweet spot breathes. Stop loss:
  the line draws, the area fades, the dots pop, the best one's halo
  breathes. Off when the system asks for reduced motion (the
  replayanalytics suite runs that way and checks the motion separately).
  The helpers (`calm`, `ease`, `easeInOut`, `countTo`, `whenSeen`, `once`,
  `along`, `tintRGB`) live in `views/motion.js`, shared with The Lab.
- **Lab motion** (same language). Monte Carlo (`views/montecarlo.js`): the
  fan gets the What if's cloud (`samples: 180` — drawing only, the sums use
  every run), scan, opening bands and lit median; tiles count up; the
  histograms and streak bars rise left to right, the risk curve draws and
  its dots pop, the table rows cascade. Plays on opening the page, a new
  horizon or source — a new risk or drawdown limit only glides the figures
  (module flag `quiet`). Prop firm (`views/lab.js`): tiles count, the 90
  accounts run out behind a scanning line with each end dot landing as the
  line reaches it, outcome bars fill and count, the payout and EV curves
  draw. Charts below the fold wait on their first frame (`.mo-wait` pauses
  their CSS animations) until scrolled to (`whenSeen`, IntersectionObserver).
  CSS: "The Lab · motion" at the end of app.css. mc/lab suites run with
  reduced motion; mc.mjs checks the motion on its own.
- **Quant** (`src/js/quant.js` engine, `views/quant.js` page, `#/lab/quant`, fourth Lab tab): Minato's own strategy as rules, run over the XAU_USD prices Replay downloaded (gold only). Project doc `claude/strategy-rules-draft.md` has the rules, his answers and what his own trades showed. **Version 2** (9 Oct, after studying his 29 gold trades; his direction: no HTF alignment, focus on protected structure, LTF OFS, MTF structure, NC+S; break-even on 5m structure of the same leg only): direction = 15m external structure (fractals KX=5 either side; internal K=2 gives IPL/IPH) — no 4H/daily gate. Levels: the 15m protected level and every internal one still standing in the 15m leg (entries on 5m candles), and the 5m protected levels once the 5m has shifted with the 15m (entries on 3m). DC = a first reaction swing low near the level (bottom 30% of the leg or below it), a second push sweeps it with no full close past the protected level, then the first opposite candle closes → entry next open. Stop past the lowest point since the DC low + 2 pips; target = nearest strong level made before the DC low with its liquidity untouched; ≥ 1.5R. Break-even: a 5m swing formed after entry, then a full close past it. $0.30 spread on entry, stop first in the same minute, no entries 30 min before → 60 min after the 5pm NY close, one trade at a time. Options: K, KX, zone, mtfEntry, ltfEntry, kinds, breakEven, spread. Result on 2 years: 1,119 trades, +98.1R, PF 1.12, 15% won, max DD −65R (v1 was 49 trades, +6.8R). Engine trade 1108 is his own 1 Oct 16:49 long almost exactly (entry 4155 vs 4154, stop 4149, target 4193). Suite `quant.mjs` (structure unit checks; with gold present — QUIRE_GOLD or the staged uploads folder — the rules' invariants and the page; otherwise skipped). **Version 3** (same day, "keep improving and test it"): filters tried one at a time and kept only where BOTH years (Oct 2024–Sep 2025 and Oct 2025–Oct 2026) improved: 15m external swings 8 candles either side (KX 8), the double confirmation at least 12 entry candles from its first low to the sweep (dcBars 12), and no trade once the leg's weak high/low has been run (tier 3, `structure().tier3`). Tried and dropped: capping targets (maxR 4/6 — worse; the wins are the far targets), RSI divergence on the entry candles, stop at the protected level, a session filter (good alone, not with the rest). v3: 414 trades, +152.8R, PF 1.53, 16% won (53/287/74 BE), avg win +8.3R, max DD −37R, 22 losses in a row at worst; year 1 +76.8R, year 2 +76.0R; without break-even +161.9R; without spread +263.5R (stops are ~$3, so the spread matters). Sep 1–Oct 7 2026: 27 trades, +5.8R (he took 29). **Versions** (`src/js/quantversions.js`): the page has a version picker; each version = name, note, prompt (the whole strategy in words — `rulesInWords(settings)` — with a Copy button, to paste into an AI) and frozen settings. Built-in: Version 2, 3, 4 (default), 5 · A+. His own: "New version from …" copies the open one as the next number into `lab.json → quant.versions` (store heals it); its knobs (`KNOBS`) and prompt are editable, a change reruns it and rewrites the prompt unless he edited the prompt by hand. A "Versions" card runs every version on the same prices (one at a time after the page is up) with trades, total, PF, won, max DD, year 1, year 2. **Version 4** = v3 + aim past a target under 1.5R (`pickR`, his "<1.5R don't worry about it") + up to 2 more goes at a level from a fresh DC low (`reentry`, he re-enters): 522 trades, +198.0R, PF 1.58, max DD −44R, year 1 +122.3R, year 2 +75.7R. **Version 5 · A+** = v4 + RSI divergence at the second push on every one of 1m/3m/5m/15m (`divAll`, his "DIV on all LTF"): 44 trades, +50.5R, PF 3.41, max DD −6R, both years PF > 2.9. Tried and dropped for v4 (his ideas included): target caps 3R/4R/5R (all ~0R — the profit is in the far targets), stop +$1/+$2 wider, minimum stop $2/$3, divergence on only 1–3 of the four timeframes (worse than none), DC zone 0.2/0.25/0.4/0.5 (0.3–0.35 is the stable band). **Version 6 · HTF windows** (10 Oct, his idea): `htf: true` — a 4H candle that runs a 4H swing (fractal `htfK` either side, 5) without a full close past it opens a window that way (`windows`); inside it setups that way are allowed on any level/TF even against the 15m (trades carry `via: '4H NC'`), until a 4H full close past that candle's extreme, price reaches the nearest 4H swing on the other side, or a window the other way opens. 633 trades, +236.0R, PF 1.57, max DD −63R, year 1 +128.9R, year 2 +107.1R; the window trades alone 174, +42R, PF 1.35; with htfK 4 or 6 year 1 dips a little below v4 — promising, not proven; v4 stays the default. Also tested on his ask: TP capped at 10R (+79.4R) or trades over 10R skipped (+12.4R) — both far worse; costs: v4 at $0.50 spread +148.8R, at $0.80 +97.3R. Options also kept: `htfLevel` (the 4H NC extreme as a level), `htfOfs`, `htfOnlyLevel`. Each trade also carries `struct` — the 15m and 5m structure at the entry (direction, protected level, weak end) — drawn faintly on its chart ("15m PL", "5m weak H"…); chart labels are pushed apart so they never sit on each other. Option `nearest` (only the nearest standing level to the DC low) tested and left off: year 2 fell. **Version 7 · Your sessions** (10 Oct): v4 + `sessions` (his Pre-Asia, Asia, Pre-London, London = 07:00–12:00 and 13:00–17:00, `tz` 8) + his playbook day rules `maxPerDay` 3, `dayLossR` 3 (also available: `weekLossR`, `pauseAfter`). 223 trades, +78.6R, PF 1.52, max DD −30R, year 1 +10.8R, year 2 +67.8R. By his session (v4): Pre-Asia −9R, Asia +28R, Pre-London +47R (PF 4.1), London +13R; outside his sessions his 00:00–07:00 +54R and 21:00–24:00 +44R. He asked how to keep drawdown under −5R: daily/weekly stops and pauses only take it from −30R to −26R (losing runs span days); only the A+ version (v5, divergence on all four TFs) stays near it (−6R over two years, −5R and −3R a year). **Version 8 · High win rate** (10 Oct, his goal "40–50% win rate and low drawdown"; now the page's default): v4 + `dcBars` 40, `tier3` off, `confirm` (after the rejection candle, wait up to `confirmMins` 60 for a 1m internal break — a full close past the last 1m swing high/low made before the sweep's extreme, known only once its K candles after closed; already there → in at once; a new extreme moves the stop; a full close through the level cancels — `confirmed()` in quant.js; trade carries `conf {t,p}`, drawn as "1m BOS"), `stopAt: 'level'` (versions knob `stopLevel`) and `fixedR` 1.5 (target fixed at 1.5R; trade `fixed: true`, `tpT` = rejection time). With `confirm` the break-even swing must form after the actual entry. 190 trades, 40 won / 30 lost / 120 BE, 57% won (54% / 60% by year), PF 2.00, +30R, max DD −4R, 4 losses in a row at worst, every quarter positive (Jul–Oct 2026 +4.5R while v4 lost 30R); without break-even 45% and PF 1.2. Found with a research harness (scratch: signals once with features, each trade simulated alone, then one-at-a-time): DC length is the strongest, smoothest filter (win rate climbs steadily from 12 to 80 entry candles); a stop past the protected level and the 1m confirmation both lift it; ATR-padded stops, engulfing/close-back rejection candles, later break-even (+0.5R, 15m), 4H windows, a 0.5 zone, 15m/3m MTF entries and 2–3R targets all tested and dropped. **Version 9 · Structure target** = v8 with the structure target (pickR) capped at 3R instead of 1.5R fixed: 179 trades, 47% won, PF 2.05, +28R, max DD −5R. Suite quant.mjs: 41 checks (v8 invariants: DC ≥ 40, conf before entry and after the first DC low, stop past level and sweep, wins exactly 1.5R, ≥40% won both years; the page opens v8, compare has 8 rows, New version → Version 10). e2e's "dashboard KPIs are real" step times out in this sandbox (blocked network) — unrelated to Quant, not touched. **Fill fixes (10 Oct, all versions):** a stop the market opens past (gap) fills at that open (`gap: true` on the trade; r can be below −1); break-even only moves the stop when the 5m close that broke the swing is in profit (previously some trades were set to BE while under water and exited at the entry — a fake fill). v4 → 519 trades +198.4R; v8 → 185, 55% won, PF 1.85, +29R, DD −4R; v9 → 174, 45%, PF 1.90, +27.9R. Notes of v2–v7 still quote the pre-fix figures (differences ≤ 3R); the compare card shows live ones. **Robustness:** the scratch harness now scores every idea averaged over 10 neighbouring structure settings (zone 0.2–0.4 × KX 5/8): v4 averages +54R (worst −60R) — its +198R is a lucky setting; v8 +13.6R PF 1.42. **Version 10 · Robust** (default now) = v8 + `int15Agree` (15m internal structure — int15, K=2 — points the trade's way at the signal close) + `confirmMins` 120: 153 trades, 58% won, PF 2.08, +28R, DD −4R; neighbour average +20.2R PF 1.83, both years positive 10/10. **Version 11 · 1H aligned** = v10 + `h1Agree` (1H structure, K=2, built only when asked): 102 trades, 61% won, PF 2.37, +26R, DD −3R; neighbour average +19.3R PF 2.12. Dropped on the robust score: other entry TFs pooled, DC 30/50/60, no 00–07, tier 3, 5m agrees, 2R, 15m BE, trailing stops, re-entries 0. BE lock +0.2R scored well (+18R, 10/10) but inflates the win rate with tiny wins — not used. Suite: 45 checks. **More history (2.27.0, 10 Oct):** Replay → Data has a History choice — 2, 5 or 10 years (`HISTORY`, `historyOf(ix)`, `setHistory(years)` in replaydata.js; kept as `years` in replay/prices/index.json; `monthsWanted(now, years)`). More years → the older months show as missing and Update fetches only them; fewer → nothing is deleted. Quant still reads only the last 25 months (all versions were measured on two years) until the Edge report uses the full history. replaydata suite: 37 checks. **Lag and replays (10 Oct, after 2.27.0):** (1) Replay's download called `nav.refresh()` after every month, which redraws whatever page is open — every few seconds for the whole 10-year download, replaying Monte Carlo / Prop firm animations and stalling Quant. Now only the Data page is redrawn (`refreshData` in views/replay.js). (2) Monte Carlo and Prop firm play their animation when the chart is new and not otherwise (his rule: "the animation is needed when the chart changes"): Monte Carlo keys it on the run plus risk and drawdown limit (`playedSig` — risk and limit now replay too, they no longer only glide), Prop firm on the answer's own sig (`propPlayed`); coming back or a redraw with nothing changed shows it settled; recorded only when it actually played, so reduced motion doesn't use it up. (3) Quant's backtests run in a module Web Worker (`src/js/quantworker.js`; prices sent once as a transferable Float64Array; runs return trades/signals/skipped/from/to only — no frames, so far less memory). `engine` in views/quant.js queues runs (the open version goes first, `hurry`), and falls back to the page's thread, one run per frame, where a worker can't start (the one-file build from disk). CSP `default-src 'self'` already allows it. Tests: quant (longest main-thread task during all versions' runs < 1.5 s — 52 ms measured), mc (+2: no replay on return or horizon change), lab (+1), replaydata (+1: a background download leaves another page's DOM alone). **10-year study and Version 12 (10 Oct):** with 10 years of XAUUSD and AUDUSD (his vault, `replay\prices`), every version up to v11 loses on Oct 2016–Sep 2024 (never seen when built) on gold and on AUDUSD in every period; random-entry twins beat them on 2016–24 gold. The one robust signal: RSI divergence at the second push on ≥3 of the 4 timeframes, with structure on 30m–90m — positive in all 8 runs (2 markets × 4 scales), while 0–1 divergences lose in all 8. Engine: new option `scale` (default 1) stretches every timeframe but the 4H (`agg[m] = aggregate(rows, m * scale)`, `SZ` scaled, trades' `tf`/`etf` in real minutes); `divAll` already took a count. Versions: `divMin` and `scale` settings/knobs (`optionsOf` → `divAll: s.divAll ? 4 : s.divMin`), "Timeframes stretched ×N" line in the prompt. **Version 12 · A+ 1H (10-year tested)** = v4 exits + divMin 3 + scale 4 + tier3 off, now the page's default: 10 years gold 239 trades +68R PF 1.47, AUDUSD 292 +11R PF 1.06; last 2 years of gold (what the page shows) 43 trades +6R. v4/v8/v10/v11 notes carry their 10-year loss. Chart labels name the stretched timeframes (1H/20m). quant suite now reads only the last 25 months of whatever is staged (48 checks). Research scripts in /tmp/claude-0/wk (lab10.mjs harness with `prepare(inst, opts)`, `simRaw` null twins, wf/wfeval walk-forward, divstudy); full write-up in the project doc, Round 3. **Three versions, ten years, volatility (2.28.0 — his "2.09.0", 12 Oct):** the built-in versions are now only the three that held up over ten years, named as he asked. **Version 1 · Risk entries** and **Version 2 · Risk entries · 3SL** run the new engine `src/js/quant13.js` (his risk entry at MTF structure, built from his own chart-1 markup); **Version 3 · A+ 1H** is the old Version 12 on `quant.js`. Structure for quant13 is `src/js/structure.js` — a causal hierarchy of degrees (degree 0 = 5m swings; degree d+1 = swings of degree d; LTF = 1, MTF = 2, the one above = 3), no CHoCH, a real break = full-bodied close + next candle carrying on + no close back for 3 candles + ≥1 ATR travelled, otherwise NC+S; a defended leg needs a 1.5-ATR body. quant13: levels = protected lows/highs behind every real break (LTF / IPL / PL, merged), gone on a real break by their own degree or after `maxAgeDays` (5 — tested: PF 1.67→1.95 on 2021–26 and 1.87→2.03 on the 2016–21 holdout); a DC on 15m candles (reaction swing within 30% of the leg, a later push sweeps it; the level's own first sweep — IPL+S — skipped), rejection close, in at the next open, stop past the sweep + 2 pips; risk entry = MTF with the trade, LTF not yet, MTF level, empty space (no other MTF level within `isoAtr` 3 ATR15) or RSI divergence on ≥ `divMin` 3 of 1/3/5/15m; not after the MTF failed twice its way; target = weak structure (MTF leg extreme / failed leg extreme / HTF leg), or the nearest standing internal swing ≥1.5R when the weak target is further than the 20-day ADR has left today; BE on an LTF real break in profit; a gap past the stop fills at the open (`gap`). `sessions` (3SL) = `OPENS` [Tokyo 9:00, London 8:00, New York 8:00 — each in its own time zone via Intl, DST-safe] ±1h, `perSession` 1; `sessionOf(t)`. It also keeps `kinds` 'cont' and 'counter' (both lose as coded — off). Trades come out in the page's shape (dir, setup, because, level{label}, s1, s2, rej, sweepX, tpT, why, session). quantversions.js: `BUILTIN` = q1/q2/q3 with `engine` ('13' or '12'), `BASE13`, `KNOBS13` (3SL, NY open, trades a session, level age, empty space ATR, divergence count, DC zone, re-entries, min R), `rulesInWords13`, `promptOf`, `engineOf`, `knobsOf`, `baseOf`, `currentOf(state)` (an old pick like 'v12' opens Version 1); his copies keep their engine; the old v2–v11 settings are gone (tests keep their option sets locally). Ten-year results (gold, 2016-10..2026-10, chunked by year): V1 155 trades +101R PF 2.04 39% won DD 12.5R (every year from 2019 positive); V2 54 trades +48R PF 2.51 DD 6R; V3 229 +65R PF 1.47; AUDUSD V1 −28R, V2 −17R, V3 +27R — V1/V2 are a gold edge. `src/js/pips.js`: pip size, typical spread and stop buffer for every market (quant.js now uses `pipOf`). **The 10-year cards** (`src/js/quant10.js` + `views/quant10view.js`, under the page): one controller for the app's life reads Replay's index, runs every pair with ≥6 months, gold first: (1) its days (17:00 NY days, [t, open, close], read month by month), (2) every built-in version a calendar year at a time (`planYears`: 2 months warm-up before, 1 after for exits; only trades opened inside the year kept, as [openT, closeT, r, dir]) in its own quantworker instance ('chunk' message → `runChunk`; falls back to the page thread). Results and days are cached in localStorage `quire.q10.<inst>` keyed by the pair's month signature and the versions' options, so it runs once per download (~30 s a pair for 10 years). Cards: **Ten years** — small multiples, one panel per pair, the three versions' R lines (blue #3987e5, amber #c98500, violet #9085e9 — validated categorical set on the dark card), end labels, a crosshair readout; a line growing with new years draws on from where it stood. **Every year** — a pair chip row, grouped bars per calendar year: each version's R as % at 1% risk vs buy-and-hold % (neutral grey), rounded data ends, bars rise once per new chart (`playedYears`). **Volatility** — a canvas 3D surface (no library): realised volatility (annualised, daily log returns, ×√260) for lookbacks 10d–9m (`LOOKBACKS`) at each month end (`volSurface`); height on one scale for every pair compared, colour = that pair's own low→high (blue ramp); drag turns it any way (yaw and pitch unbounded, a glide after), wheel/pinch zooms, arrows turn, double-click resets; only the box's back panes are drawn, and on them the compared pairs (up to 3 chips; the first is the surface) as lines — the latest term structure on a date wall, the 20-day volatility through time on a lookback wall; hover reads the nearest point. The surface rises and swings in when its pair changes; reduced motion shows it still. quant suite: 66 checks (V1 invariants, 3SL windows and clocks, planYears, volSurface, buy-and-hold; page: three versions, V1 open, compare = 3 rows matching the engines, New version → Version 4 with quant13 knobs, ten-year panel with 3 lines, 4 bars a year, dragging and arrow keys turn the surface).
- **Lab minimum** is 10 trades (was 20) for both Monte Carlo (`mc.js`) and
  Prop firm (`lab.js`, still over 5 days). Only the gate changed, not the
  sums — fewer trades just means a wider, less certain answer.

**Stage 7 — indicators** (`chart/rsi.js`, `chart/overlays.js`, panes in
`chart/core.js`):
- **Panes**: `hooks.panes()` → `[{ key, ratio, min, hidden(), range(i0, i1),
  ticks(A), fmt, paint(g, G, A, C), tags(A), legend(i) }]`. They take their
  height (ratio of the chart, at least `min`) from under the candles —
  drag the line above a pane (`q.resize(r, keep)`, row-resize pointer) to
  change it; the RSI keeps it as `rsi.height` (0.06–0.75); the
  time scale stays at the bottom (`G.bot`). Each has its own scale, tags
  and an HTML legend (`.tv-plegend`, ⚙ and × on hover). The crosshair's
  line down crosses every pane; the line across and its value only the pane
  it is in. Dragging in a pane (zone `sub`) moves time, never the candles'
  prices; drawings only take the main pane.
- **RSI** = TradingView's built-in: RMA (Wilder; seeded with the SMA of the
  first `length`) of gains and losses of the source's change; 100 when no
  losses, 0 when no gains; first value on bar `length`. RSI-based MA: None,
  SMA (default 14), SMA + Bollinger Bands (population stdev × mult), EMA and
  SMMA (RMA) seeded with the SMA (Pine's `ta.ema` / `ta.rma`), WMA. Checked
  against Wilder's worked example (70.46 …) and an independent loop on the
  chart's own closes. Settings (Inputs / Style / Visibility, Defaults,
  live preview) are **one set for the app** in `drawings.json → rsi`
  (`rsiSettings` cleans them; `previewRsi` / `saveRsi` / `onRsi`). Defaults:
  14 close, SMA 14, RSI #7E57C2, MA #F7B924, bands 70/50/30 dashed grey,
  fill rgba(126,87,194,.1), labels on the scale, values in the legend.
  In a replay it counts the forming candle up to the moment.
- **Sessions / News** moved to `overlays.js` (`paintSessions`,
  `paintSessionNames`, `newsFor`, `paintNews`) and are used by both charts.
  News labels are short, with the currency: `newsLabel` → "USD - CPI",
  "USD - NFP", "EUR - Lagarde" (`shortNews` in news.js, re-exported by
  overlays.js: a table of patterns, else the title without m/m · y/y ·
  Prelim…, at most 16 characters). The trade page and the weekly review use
  the same labels (`newsText`); the trade page's News cell shows the first
  (the one picked on the trade) and "+N more" — a click lists every red
  folder of that day with its time, full title on hover (`dayRedFolders`). Every release
  at a moment is listed (no "+N more"); a block flips left only when it
  would run off the right edge.
- On/off: trade charts — Indicators ▾ (`quire:chartRsi`, `quire:chartSessions`,
  `quire:chartNews`); Replay — the top bar's Indicators ▾, kept on the
  session (`s.ind { sessions, news, rsi }`, default on/on/off). News in
  Replay is whatever red folders the app has fetched for those weeks.
- Suite: `indicators.mjs`.

## The FX Replay clock

Read this before touching CSV import times.

FX Replay writes its timestamps **as they appear in its own UI** — no zone, no
offset. So they are read exactly as written. `replay.js` detects an FX Replay
export by its header signature (`looksLikeFxReplay`, three or more of `upnl`,
`rpnl`, `avgriskreward`, …) rather than by what the user picked in a dropdown,
because the user had already set an offset that was wrong.

How this went wrong the first time is the useful part: the app shifted these
times by eight hours, and the suite was **green**, because the suite clicked
the same wrong toggle the app defaulted to. A test that encodes the bug is
worse than no test. When a fixture and a bug agree, check the fixture against
the real artefact — the user's actual CSV next to the actual screenshot —
before believing either.

---

## Testing

- **Pinned clocks**: suites whose fixtures carry fixed dates pin the page
  clock (`page.clock.setFixedTime`) — wire (headlines 23–25 Sep), motion
  (trades June–Sep). On the real clock they broke as October went by.
  `run.sh` also builds the preview bundle (`--preview`, for prev.mjs), and
  broker.mjs says "skipped" when Minato's uploaded sample export is not on
  the machine. In the cloud workspace set
  `QUIRE_CHROMIUM=/opt/pw-browsers/chromium`.

~2,495 checks across 84 suites in `tests/suites/`, Playwright driving
Chromium. `tests/suites/e2e.mjs` holds the `FAKE_FS` template string that
every other suite reads to fake the vault. **`FAKE_FS` persists only strings to
localStorage — Blobs live in memory and are lost on reload**, which is why chart
tests that reload check names rather than pixels.

What a check is worth:

- **Write the check so it fails if the behaviour is removed.** After adding
  one, break the code on purpose and confirm it goes red. Several checks here
  were worthless until that was done.
- **Presence in the DOM is not visibility.** The tag menu on the New trade page
  had all the right tags in it and could not be seen: it was inside a 25px box
  that scrolled, and a box that scrolls also clips. Reading `innerText` never
  noticed. Hit-test instead — `document.elementFromPoint` at the element's
  centre must land on the element — and check no ancestor with a non-visible
  overflow is cutting it. `tests/suites/tags.mjs` has the helper.
- **`page.route()` to serve a fixture feed**, so the real fetch, the real
  parser and the real merge all run and only the network is stood in.
- Suites are independent processes. A suite that needs a file writes it to
  `QUIRE_TEST_OUT` (default `/tmp/quire-tests`), never into the repository.

## Releasing

1. Bump the version in **three** files: `package.json`,
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
2. `node build-single.mjs` and `node build-single.mjs --preview`.
3. `./tests/run.sh` — all green, including the suites that load `Laminar.html`
   itself rather than the source.
4. `cargo test` in `src-tauri/` when `main.rs` changed.
5. Ship: `src/` and `src-tauri/` are what the GitHub Actions Windows build
   needs; `Laminar.html` renamed `index.html` is what the website needs.

---

## Working with Minato

- **Version names in chat are his own count**: the build zipped as
  2.23.0 (4 Oct 2026) is **"2.00.0"** to him; 2.24.0 (the whole Replay
  system, stages 3–7) is **"2.05.0"**; 2.25.0 (the Replay fixes, steps,
  magnet, undo, What if) is **"2.06.0"**; 2.26.0 (scroll kept, outlook graded,
  short news names, one growing price store, Analysis mistake) is
  **"2.07.0"**; count up from there when talking to
  him. The files keep their real numbers — don't change them for this.
- Perth, Australia — **UTC+8, no daylight saving**. Trades forex, futures and
  gold; XAUUSD, NAS100, AUDUSD.
- The app should be **minimalist, clean, expensive**. When a layout choice is
  close, take the quieter one.
- **Three words set the depth of a reply**: *quick* (no verification),
  *check* (verify it), *careful* (the full treatment).
- **Build only when asked.** Zips and `.html` files are not produced every
  turn.
- He is new to GitHub: name the exact buttons, in order, and do not assume a
  step is obvious.
- He will see the finished thing himself — don't send screenshots unless he
  asks for them.


## Laminar (2.29.0 — his "2.10.0", 12 Oct)

The app is now called **Laminar** (it was Quire, and before that Ledger). Renamed where it shows: window title and product name (tauri.conf.json — the installer is `Laminar_<version>_x64-setup.exe`), page title, sidebar wordmark, welcome screen, the folder prompt, vault export (`app: 'Laminar'`), error messages, firms' "Laminar's take", chart dialog labels, the single-file build (`Laminar.html`, `Laminar-preview.html`), the GitHub workflow (*Build Laminar*, artifact `laminar-windows`), SETUP.md. Left alone on purpose: the identifier `com.minato.ledger` (so his settings, OANDA key and vault location carry over), the vault folder on disk (Documents/Quire stays where it is — main.rs's first-run default and the Ledger→Quire rename are unchanged), internal names (`quire-vault` kind, `quire.q10.*` cache keys, the `'quire'` candle-colour mode value, QUIRE_* test env vars) and code comments. **The icon and wordmark:** the icon is his isometric L (two slanted slabs) in black, optically centred and at ~72% size, on a soft square (superellipse, n=5) filled with a red-to-black glow (bright orange-red top right, deep black down the left and bottom, fine grain) — source `outputs/laminar-logos/red-optical.svg`, rendered to `icon-1024.png`; every file in src-tauri/icons (png sizes, Square*Logo, icon.ico 16–256, icon.icns) and the favicon (64 px) come from it; `brandMark(size)` (ui.js) is that icon as a 128-px embedded PNG (`MARK_PNG`), used on the welcome screen. The **wordmark** — the L plus LAMINAR in Montserrat Regular (OFL), letters outlined to paths so no font is loaded, tracking +6% — is `brandWordmark(height)` (inline SVG, `currentColor`, aria-label "Laminar"); it replaces the old mark + name in the sidebar (22 px) and on the vault cards (24 px). dark2 checks the sidebar wordmark (22 px, white) and the tab icon.

## Laminar 3 — the new look (2.30.0 — his "2.11.0", 24 Oct)

Minato asked for the whole app redesigned after liquidjournal.app: its
pages, its motion and above all its Appearance sheet, with duplicated pages
folded together. Every view's layout and every number is unchanged; what
changed is the frame around them, the surfaces, the type, the motion, and
where a few things live.

**The shell** (`js/shell.js`). The sidebar is gone. A top bar carries the
wordmark, seven sections — Dashboard · Journal · Plan · Analytics · Lab ·
Replay · Playbook — and on the right the scope switch (only once there are
forward tests), the $ / % / R switch, the account chip (a popover of accounts,
Manage, New account) and your initials (the "Your account" sheet: Profile,
Appearance, Vault & data, Accounts, Settings). Under 900 px the sections move
into a floating bar at the bottom (Dashboard, Journal, Analytics, Plan, More)
with a + for a new trade on pages that do not already have one. The account
chip keeps the old `.acct-name` / `.acct-meta` classes because tests read them.

**Sections that share tabs.** Routes did not change; `SECTIONS` groups them.
Journal = Trades · Calendar · Review. Plan = Outlook · News (the old
Newswire). Lab = Monte Carlo · Prop firm · Ghost · Quant · Firms (the firms
directory moved under the Lab, beside the simulation it feeds). `dressHead`
in app.js puts the section's tabs where the page's `h1` was — the `h1` stays
in the DOM as `.sr-only` so anything reading it still can — and removes the
Lab's own `.lab-views` switch, which the tabs replace.

**Folded together.** The Year view left Analytics and is now Calendar →
Month / Year (`yearPanel` in analytics.js, drawn by calendar.js). Accounts
live in one place: Settings → Accounts; `#/accounts` is that page with the
new-account form open (`accounts(store, nav, { formOnly: true })`), except on
first run, where it is still the welcome form on its own.

**Settings** (`views/settings.js`) is a list now, the way a phone does it: a
profile card, a search box, and grouped rows — Account (Profile, Accounts),
Trading (Risk rules → Playbook, Charts & prices, Import trades), App
(Appearance, Vault & data, Trades as a spreadsheet). Sub-pages are
`#/settings/profile|accounts|vault|charts`. The P&L colour dropdowns, theme
switch, glass switch and background picker moved to the Appearance sheet.

**The look** (`js/look.js`, stored as `accounts.json → look`). Fields: theme
(light · platinum · midnight · onyx · graphite — Graphite is the original
grey-ground/black-card Laminar), accent (mono + ten + your own), text tone
(ink · graphite · espresso · navy · your own; paper themes only), lines
(theme · text · accent · your own), font (Jakarta · Geist · Newsreader ·
Mono, bundled in `src/fonts`, OFL, inlined as data by build-single), motion
(full · calm · off). A journal without `look` opens on Light, or Midnight if
its old `theme` was dark. `applyLook` writes everything as custom properties
into one `<style id="look-tokens">` rule keyed `html[data-look]:root`, which
out-ranks app.css's theme and glass blocks — so glass is handled there too
(`tokensFor(look, { glass, bg })`). `data-look`, `data-paper`, `data-motion`
and `data-font` go on `<html>`; `data-theme` is still 'dark' for Midnight and
Onyx so the old dark rules keep working. The last look is also kept in
localStorage (`laminar:look`) and drawn before the vault loads.

**Three ramps — the one thing to understand before touching colours.**
Laminar's views were written for dark cards on a light grey ground, so
`--grey-1` means "the palest thing" and `--grey-8` "the card". On the paper
themes the card ramp is mirrored (grey-1 is the ink, grey-8 the white card)
and every inline colour in every view lands the right way round untouched.
Two places are written the other way and get their own ramp: what a page
header writes inline in grey (`.head [style*="var(--grey"]` — the calendar's
month name, its round buttons), and the pale cards (`.card.light`, which are
dark on paper). If a header control is drawn with a class instead (`.seg`,
`.day-nav`), it keeps the card ramp. New code: use `--ink…--ink-5`,
`--card`, `--inset`, `--line`, `--accent` and you never have to think about it.

**The Appearance sheet** (`views/appearance.js`, opened from Settings, the
"Your account" sheet or More). Hero with the font and the look fanned out as
cards; undo / redo for as long as it is open; Save this look. Tabs: Themes
(theme cards drawn as tiny Laminars; Your looks — save, wear, download as
`.laminar-look.json`, import, delete; Day and night — two saved looks
switched by the clock, checked every minute in app.js), Colours (accent,
text, lines, font), Custom (background — a looping video since 2.33.0, see
"Video backgrounds" below; glass: Solid / Frosted / Clear; motion; setup chip
colours), Money (win / loss
/ break-even colours from the shared palette, three ready sets, the default
unit, and the daily guardrails — the same Playbook risk rules). Break-even
now has a colour of its own (`colours.flat`, `--flat`), empty = theme grey.
A theme change spreads from the click with the View Transitions API.

**Motion** — see README. `arrive()` / `segGlide()` / `glide()` in shell.js;
keyframes at the foot of look.css. The README's old "cards never fade"
rule was written for grey ground under black cards; the new page sits close
to its cards' colour, so they rise in.

**Toasts** spring up from the bottom (`#toast.is-in` / `.is-out`), with a dot
in the tone's colour instead of a coloured edge.

**Under automation** (`navigator.webdriver`, i.e. Playwright) boot() puts
`data-auto="on"` on `<html>` and the arrival animations are skipped, so a
suite never measures a card mid-rise. Everything else still moves.

**Tests.** The suites waited for `.sidebar`; they wait for `.topbar` now.
Suites that drove the old Appearance card (theme, appear, pnlcolours, glass,
bgfirst, dark2 …) drive the sheet. `tests/suites/look.mjs` covers the sheet
itself: every theme, accent, tone, font, saved looks, undo, day and night.

## Laminar 3.1 — fixes and instrument marks (2.31.0 — his "2.12.0", 24 Oct)

His list after trying 3 on a narrow window and on his phone, plus
TradingView-style instrument logos.

**A narrow window.** The top bar folds in four steps instead of letting the
tabs run under the $ / % / R switch: `fitTopbar()` (shell.js) measures the
bar and adds `.f1`…`.f4` until nothing overflows — f1 hides the Journal count,
f2 the tab icons, f3 shows icons only for the tabs that are not on, f4 hides
the account name. It runs on boot and on every resize. Each tab has a `title`
so an icon-only tab still says what it is.

**A phone.** Every side-by-side pair of cards or charts stacks under 900 px
(`.an-row`, `.rv-row`, `.gh-cols`, `.td-row`, `.an-split`, the year's
`.yr-row`). The new-trade form is one column, its strip wraps, the confidence
ticks lose their in-between labels. Calendar day cells write a short figure
(`shortText` in calendar.js: +1.1k, 1.2R, 0.8%). The year's stat strip is a
two-column grid (`.yr-strip-in`). The year chart writes each bar's figure in
the longest form every column has room for — full, short (+$3.9k), bare
(+3.9k) or none — so two can never collide, and uses J F M … when a column is
under 30 px. Its figures are `--profit` / `--loss` now, not the pale
`-ink` variants meant for the calendar's tinted cells.

**Closed early → win / lose.** The held-R box doubled its border because
`html[data-look] .field` out-ranked `.held-num .held-r`. The look's field
rules are `html:where([data-look]) .field…` now (specificity 0,1,1). Keep it
that way: a look rule should never beat a component's own.

**Motion.** Cards rise 10 px over .52 s, 45 ms apart, no scale. A chart waits
for its card (`--chart-wait` = the card's delay + 300 ms) and then draws over
1.5 s (lines) or 1.1 s (bars); app.js keeps `.enter` on for 2.8 s so nothing
is cut off. `whenSeen` (motion.js) waits the same delay inside an arriving
card. The page header never animates — on a section with tabs only the page
body moves. `.main` has `scrollbar-gutter: stable both-edges` on desktop, so a
card rising past the fold cannot bring a scrollbar in and narrow the page.

**Monte Carlo and Prop firm play every time the page is opened.** app.js sets
`nav.fresh` when the route changed (not on a refresh from a control);
montecarlo.js and lab.js play when `ctx.nav.fresh` or the inputs changed. Both
animations are longer (fan ~2.1 s, median 1.5 s, tiles count up after it).

**Dropdowns in light themes.** No view sets an `<option>` background inline
any more; look.css gives `select option` the look's `--card` / `--ink`
(`--float` on the dark themes).

**Clean wins** is gone from the dashboard (and its test).

**Instrument marks** (`js/flags.js`). `instrumentOf(symbol)` reads a symbol
the way a broker writes it — suffixes (`.r`, `m`), prefixes (`OANDA:`),
futures months (`NQZ5`, `GC1!`), CME FX codes (`6E`) — and returns
`{ kind: 'pair' | 'one' | 'none', base, quote, name }`. `pairMark(symbol,
size)` draws it: a pair as two overlapping round flags (base in front, lower
left; quote behind, upper right), an index or future as its market's flag
(the Nasdaq and the S&P have their own marks since 2.34.0), metals as bars,
oil and gas as their own glyphs, BTC / ETH / SOL / XRP as coins, anything
unknown as a disc with its first two letters. Flags are
drawn in code on a 30×30 view box (no images, nothing fetched). Used in:
Trades, the dashboard's recent trades and Where it comes from, Review's rail
and header, the calendar's day list, the trade page, the trade chart's title,
Analytics → By instrument, Weekly, Import, the new-trade instrument field and
the outlook. CSS is `.pmark` / `.pm-disc` at the end of look.css.

## Sharing a trade (2.32.0 — his "2.13.0", 25 Oct)

After liquidjournal.app's share card: a closed trade as a card, a video
with sound, or a GIF. **Share** on the trade page (`.td-share`) and the
share icon that shows on a closed row in Trades (`.row-share`) open the
sheet (`views/share.js`, `openShare(store, nav, id)`; open trades cannot be
shared — `canShare`).

**The sheet.** Timeframe (Auto · 1m · 5m · 15m · 1h; Auto picks the
smallest that shows the trade in ≤ 40 candles), the live card, Replay, and
three tabs: **Background** (your clips and pictures; five made in code —
Night, Aurora, Money, Grid, Paper), **Adjust** (trim strip with a window you
drag or resize, Position — drag the card, Center —, Dim, Sound; Length for
anything that is not a clip), **Format** (Show $ / % / R, Style Candles /
Line / No chart / P&L only, Candles Colour / White, Figure White / Win-loss
colour, Numbers Plain / Boxed / Hidden, Corners, Size Landscape 1200×630 ·
Portrait · 16:9 · Square · 4:5, Quality Standard (long edge 1920) / 4K).
Out: **Video**, **GIF** (720 wide, 15 fps), **Photo** (PNG, transparent
round corners). The desktop app asks where to save (Save dialog — the
capability `dialog:allow-save` was added; written with `write_image`); a
browser downloads.

**One renderer.** `share/card.js` → `drawCard(g, W, H, t, model)` draws a
frame at `t` seconds; the preview, the video, the GIF and the photo all call
it. The card comes in over `ANIM` (3.4 s): the instrument, the figure
counting up with a glow, the numbers, then the candles walking in left to
right with Entry and Exit pills popping on as the candles reach them and a
dashed line between. Only the candles are drawn — no grid, axis or panel —
straight on the background. A clip shorter than the card's run loops under
it (`MIN_LEN` = ANIM + 1.2 s).

**The candles** are the trade's own OANDA one-minute prices (`cd.tradeWindow`
+ `cd.loadDays` — the vault's day files first, OANDA only for what is
missing), built up with `cd.aggregate`. `chartFrom` takes the trade plus
~70% of its length before and ~35% after, at most 150 candles. Entry / exit
pills sit at the logged prices, or the candle's open / close when none was
logged. Messages: no times ("Add the entry and exit times…"), no key (with
Open Settings), no OANDA instrument, OANDA errors (`cd.explain`).

**Your clips** live in the vault as `screenshots/share-<id>.<ext>` (so a
vault backup carries them — they are in `shotNames()`), listed in
`accounts.json → share.clips` with name (from the file name), kind, type,
duration, a thumbnail (the most contrasty of six stills — never a black
frame) and how you left it: start / len (trim), fx / fy (crop), dim, sound.
The sheet's own choices are `share.prefs` (`SHARE_DEFAULTS` in store.js).
Pictures other than GIFs are re-encoded like screenshots (`shots.prepare`);
80 MB is the most one clip can be.

**The video** (`share/encode.js` + `share/mp4.js`). Not a screen recording:
each frame is drawn on its own and handed to WebCodecs' H.264 encoder
(High profile, 12 Mb/s, 40 Mb/s at 4K, `latencyMode: 'realtime'` so there
are no B-frames), so the file is a steady 30 fps however busy the computer
is. Frames from a clip are caught as it plays at half speed
(`requestVideoFrameCallback`, `playFrames` in share.js) — seeking to every
frame decodes from the last keyframe each time and was 73 ms a frame. The
sound is the clip's, decoded once (`OfflineAudioContext` at 48 kHz), cut to
the trim, looped if the card runs longer, set to the Sound level, faded in
50 ms and out 300 ms, and encoded as AAC (Opus where the window has no AAC
encoder — Playwright's Chromium does not). `mp4.js` writes ftyp, moov first,
mdat; one sample per chunk; ctts only if an encoder used B-frames; esds for
AAC, dOps for Opus. Where WebCodecs is missing it falls back to
MediaRecorder (`recordVideo`), which records the canvas and the clip's
sound through Web Audio as it plays.

**The GIF** (`share/gif.js`) is written here: per-frame 256-colour palette
by median cut on a 5-bit grid, a light 4×4 ordered dither, LZW.

**The preview's sound** is off until you press the speaker on the card; the
clip's sound runs through Web Audio (one gain to the speakers, one to the
recorder), which is why `createMediaElementSource` is made once per clip
and kept (`media` map).

**Tests.** `tests/suites/share.mjs` (47): where it is offered, the card's
words, timeframes, format choices kept, the five backgrounds, adding a clip
(fixtures/share-clip.mp4 — a 4 s test pattern with a tone), trim / crop /
dim, the PNG's size, a real GIF, a playable MP4, the three no-candle
messages, removing a clip, and the phone.

## Video backgrounds and two kinds of glass (2.33.0 — his "2.14.0", 25 Oct)

The three background pictures (Lounge, Ridge, Canopy) and "your own picture"
are gone. A background is now a **video on a loop**, muted, behind the whole
app. A journal that had a picture opens with none (the old picture file is
still in the vault and still in `shotNames`, so nothing is lost).

**Ours** (`backgrounds.js` → `BACKGROUNDS`): Torii, Samurai Path, Moon, Rain,
Susanoo, Topography — Minato's live wallpapers, re-encoded to 1920×1080,
30 fps, H.264 CRF 27, no sound, each checked to loop without a seam (first
and last frames match; Rain's duplicated last frame was cut). They live in
`src/media/backgrounds/` with their first frame as a JPEG poster. The desktop
app serves them from there; `build-single.mjs` inlines the posters always and
the videos only with `--with-media` (~25 MB), so a website build needs
`src/media` copied beside the page. Each carries a `scrim` (default dim) set
from its brightest 5%: bright Torii 0.6 … dark Topography 0.3. Four carry
their site's name small in the bottom-right corner (mylivewallpapers.com /
moewalls.com); they were left as sent.

**Yours**: Appearance → Custom → Add video. Kept as
`screenshots/bgvideo-<id>.<ext>` (`store.addBgVideo`, listed in
`accounts.bgVideos` with name, still, length), carried by a vault backup,
removed with the × on its tile. Value `'yours:<id>'`; read from the vault
into a blob URL once (`store.bgVideoUrl`). 100 MB at most.

**The layer** (`store.js` → `applySurface`): one `.bg-layer` on `<body>`
(outside `#app`, which is rebuilt on every click and would restart it) with
the `<video>` and a `.bg-scrim` (`--bg-scrim`, the **Dim** slider —
`accounts.bgDim`, null = the video's own). `#app` sits above it at z-index 1.
The video pauses while the window is hidden and for Motion: Off / reduced
motion (its poster stays). In the desktop app our clips are fetched whole and
played from a blob (`playable()`): the app's file server does not answer the
range requests a `<video>` makes to loop. **The CSP now has
`media-src 'self' data: blob:`** — without it neither the share sheet's clips
nor the backgrounds would play in the desktop app (csp.mjs checks this).

**Glass** is `false` (Solid), `true` (Frosted — the old glass) or `'clear'`
(`store.glassMode`, `data-glass-kind` on `<html>`). Clear: panels at ~20%
tint, 6 px blur, saturate 125%, lighter wells, and a soft text shadow on the
page so writing holds on a moving picture (`tokensFor(look, { glass:
'clear' })` and the `data-glass-kind="clear"` block in look.css). The first
background ever chosen turns Clear on (once, `glassNudged`), and says so.

Tests: glass.mjs (41) and bgfirst.mjs (18) were rewritten for videos and the
three glasses; lookhelp's `setGlass(p, false | true | 'clear')`.

## Instrument marks like LiquidJournal's (2.34.0 — his "2.15.0", 25 Oct)

He asked for the non-forex marks to follow LiquidJournal's, and for the
forex flags to stay exactly as they were. In `js/flags.js`:

- **Anything that is not a currency is one disc, whatever it is priced in.**
  `instrumentOf` returns `kind: 'one'` when a six-letter symbol's base is in
  `ASSET` (gold, silver, platinum, palladium, copper, BTC, ETH, SOL, XRP),
  so XAUUSD is gold alone and BTCUSDT is the coin alone. `quote` and the
  name ("Gold / U.S. Dollar") are kept.
- **Metals** are three bars stacked two-and-one (`bars(bg, ink)`), dark on
  the metal's colour: gold `#C9A032`/`#3A2A05`, silver `#A7ADB4`/`#26292D`,
  platinum and palladium `#8A939D`, copper `#B0673A` (new: COPPER, HG, MHG,
  XCU…). LiquidJournal's colours.
- **Nasdaq** (NAS100, NQ, MNQ, US100, USTEC, NDX, QQQ) is a white italic N
  on `#0090BA`. It is a plain letter drawn by us, deliberately not a copy of
  the exchange's trademarked N.
- **S&P 500** (SPX500, US500, SPX, ES, MES, SPY) is "500" in heavy white on
  `#D6002A` with a faint inner ring — what he asked for. LiquidJournal writes
  "S&P"; to switch, change the glyph in `ASSET.SPX`.
- A disc's letters can now carry a weight and tracking (`coin(…, { weight,
  track })` → `--g-weight` / `--g-track` in CSS, and the share card's canvas
  reads the same from `markParts`).
- Unchanged, checked shape for shape against 2.33.0: every forex flag, the
  CME FX codes, the index flags (Dow, DAX, FTSE, Nikkei…), oil and gas.

Tests: marks.mjs (21) is new.

**2.34.1 (his "2.15.1").** From his TradingView watchlist: an index written
with its currency on the end (NAS100USD, US30USD, DE30EUR, UK100GBP) is the
index — `instrumentOf` tries the symbol without a trailing USD/EUR/GBP/JPY/
AUD/HKD/CNH once nothing else matched. And the U.S. Dollar Index (DXY, USDX,
DX futures) has its own mark: a heavy white $ on green `#1E8C66`. marks.mjs
is now 24. (He said not to worry about those two; they were already done,
so they stayed.)

## No outlines, Clarity, your picture and banner (2.35.0 — his "2.16.0", 25 Oct)

His list, from screenshots of Clear over Rain:

- **No outlines.** Clear no longer puts a shadow behind the writing (it read
  as an outline round every word, figure and mark) and no lit lip or drop
  shadow on a panel: one half-pixel ring instead (`inset 0 0 0 .5px
  var(--glass-rim)`, border made transparent — a CSS border cannot go under
  one whole pixel on an ordinary screen), rim alpha .26 on light, .09 on
  dark. Without the shadow the quiet greys on light Clear had no footing, so
  that look pulls `--ink-2…5` and `--grey-3…5` much nearer the ink, and the
  page ramp for headers likewise (`pageRampFor`, k = .55 when the page is
  transparent).
- **No ring round marks or your picture, on any glass.** `.pm-disc` lost its
  `0 0 0 1.5px var(--card)` ring and inset edge; where a pair's base
  overlaps the quote, the quote is masked away (`--cut` radial-gradient)
  leaving a hair of what is behind. `.tb-you` and `.st-avatar` lost theirs.
  The share card draws marks the same way (`drawMark`: clip with an evenodd
  hole, no ring).
- **TradingView's colours.** Gold `#D69A00` with white bars (sampled from his
  watchlist), Nasdaq is now "100" in heavy white on `#0091BA` like TV (the
  italic N is gone), S&P "500" on TV's `#C4162E`, no inner ring.
- **Clarity**, under Glass while Clear is on: `accounts.clarity` 0–1
  (default `CLARITY` .65 in store.js), written to `<html>` as `--clear-k` by
  `applySurface`; look.js writes the Clear tint and blur as `calc()`s of it,
  so dragging repaints without a pass through the look. Saved looks carry it.
- **Sheets are glass with Clear** (`--sheet-glass`, a touch thicker than the
  cards; the Appearance sheet's hero and sticky title follow, `--sheet-top`).
- **The Custom preview** is one picture with the video playing in it — the
  inline `background` shorthand had put the size back to auto and tiled a
  small still 3×3. It wears the Dim scrim and Clear's live tint too.
- **Share sheet.** On a video the chart is a line unless you choose
  otherwise for videos (`prefs.clipStyle`, default 'line'; drawn
  backgrounds keep `prefs.style`). Sound: one `applySound()` decides what is
  heard on every change of clip (the new clip straight away, nothing from
  any other); a play() that is merely interrupted no longer mutes the clip
  for good (only NotAllowedError does); Remove takes the clip off the card
  before anything else, so the preview loop cannot restart it, and
  `dropMedia` stops, unhooks and frees it; closing the sheet frees them all.
  `__share.sound` reports it for the tests.
- **Your picture and banner**: a picture or a looping muted video
  (`store.setProfileMedia('avatar'|'banner', blob, meta)`, files
  `screenshots/avatar-*` / `banner-*`, in `shotNames` so backups carry them;
  `profileUrl`/`profileUrlNow` read them once). `shell.profileFill(store,
  which, host)` puts one into any frame — the top bar, Settings' hero, the
  Profile rows. Settings' hero has a camera badge on the picture and
  "Add/Change banner" on the banner; Profile has Choose/Change/Remove for
  both. Pictures go through `shots.prepare` (GIFs kept as they are); videos
  up to 50 MB (picture) / 100 MB (banner). The share card draws your picture
  (or the video's frame) in place of your initials.
- **The picture in the top bar opens Settings** (the "Your account" sheet is
  gone; Appearance, Vault and Accounts are rows there). lookhelp.mjs now goes
  that way and returns to the page the suite was on.
- Names of your own videos lose the wallpaper site they came from
  (`clip.tidyName`: "Mylivewallpapers.C Girl Samurai Rain" → "Girl Samurai
  Rain"), and names already saved are tidied once on open (`heal`).

Tests: clarity.mjs (17) and profilepic.mjs (18) are new; share.mjs gained the
line default and the sound (56); marks.mjs checks TV's colours and no rings
(26).

## The writing on the picture (2.36.0 — his "2.17.0", 25 Oct)

Over some videos the top bar and the top of each page could not be read
(dark look over bright fog, light look over cloud). Appearance → Custom now
has **Text**, shown while a background is on: Auto · White · Black · Grey ·
Theme (`accounts.picInk`, default 'auto'; saved looks carry it).

- `store.paintPicInk` (from `applySurface`) reads the background's still
  once (`topLuma`: a 48×27 draw — the top third for the heading, the whole
  for the panels), allows for Dim (`seenOf`: black laid over a dark look, a
  pale wash over a paper one) and sets on `<html>`:
  `data-pic-ink` = white | black | grey-l | grey-d (none for Theme),
  `data-shade` = dark | light, and `data-pic-flip` (below). Auto: white on a
  dark picture, black on a light one; Grey: light grey / dark grey the same
  way. `picInkFor` is exported for the tests.
- look.css: `--pic-ink`, `--pic-ink-2`, `--pic-chip` (the backing for
  controls sitting on the picture), `--pic-on` (the selected pill),
  `--pic-soft`. The top bar always follows it (frame tokens); the page's own
  writing (`--ink-on-light`, the header ramp) once the page is glass; the
  segments and steppers on the page outside panels take the chip backing.
  Panels keep the theme's writing (`--ink-on-light-t` etc., copies look.js
  keeps; cards, menus and the settings list re-take `color` from it, since
  they inherit theirs from body).
- `.bg-shade`: a soft gradient down from the top of the picture, dark under
  light writing and light under dark — the legibility comes from this, not
  from a shadow on the letters (he did not want outlines).
- **Clear panels turn** (`data-pic-flip`, look.js `clearFlip`): Clear panels
  are see-through, so when the picture is well over on the other side from
  the theme (seen brightness of the whole still > .62 on a dark look, < .38
  on a paper one) — or when he chose White/Black/Grey against the theme —
  the panels are drawn with the other family's tokens (tint, writing, lines,
  accent). Frosted and Solid panels never turn.

Tests: picink.mjs (23) is new.

## Accounts as cards — evals, funded, live (2.37.0 — his "2.18.0", 25 Oct)

He sent LiquidJournal's accounts page as the model: prop-firm accounts as
cards with the firm's logo, a FUNDED badge, Account / Gross P&L / Payouts,
the net after payouts, Log payout, Update balance, balance and peak, and a
line of the balance. Settings → Accounts (`#/settings/accounts`, and
`#/accounts` with the New account sheet open) is now `views/acctboard.js`;
the old list in settings.js is gone (the first-run form in accounts.js is
unchanged).

- **The account carries** `kind` ('eval' | 'funded' | 'live'), `firm` (an id
  from `acctfirms.js`, or 'other' with `firmName`), `payouts`
  [{ id, amount, date, at, note }], `adjustments` [{ id, amount, date, at }],
  and, once put away by the page, `status` ('passed' | 'blown') and
  `closedAt`. Accounts from before have no kind: `kindOf` reads it from the
  name (Combine/Challenge/Eval… → eval, Funded/PA/Express → funded, else live).
- **The money** is `calc.accountMoney(a, closedLiveTrades)` → `{ start,
  gross, paid, after, balance, peak, series }` (forward tests are not money;
  corrections count as P&L; payouts and withdrawals come out). `store.moneyOf`
  / `balanceOf`. **The top bar and the account switcher show the balance
  after payouts now**, and it is the account's real money in every scope (a
  forward-test view used to show the starting size; scope.mjs updated).
  Returns (%) are still measured on the starting size and follow the scope.
- **Store:** `addPayout`, `removePayout`, `setBalance` (a dated correction of
  the difference), `removeAdjustment`, `passEval` (puts the eval away as
  passed and starts the funded account it earned — same firm, size, risk —
  and makes it active), `blowAccount`, `liveClosedFor`.
- **Firms** (`acctfirms.js`): futures props Apex, Topstep, Lucid, Tradeify,
  MyFundedFutures; forex props FTMO, The5ers, FundingPips, Alpha Capital;
  brokers OANDA, Pepperstone, Fusion Markets; plus Other. Each has a short
  name for the chip, its sizes, a tint for the card's glow and a monogram.
  **The logos are not drawn or fetched by us** — each firm has a logo slot
  ("Add logo" in the account sheet): his own image of the logo goes through
  `logo.js squareLogo` (background read from the corners and kept; the mark
  found, centred at 72%, or edge to edge for an icon that fills its box; a
  dark mark on no background gets white, a light one near-black; a photo is
  cut square) to a 256-px PNG in `screenshots/logo-<firm>-*.png`,
  `accounts.firmLogos[firmKey]`, in `shotNames`. Every account at the firm
  wears it; until then its initials on its tint.
- **The page:** a summary (across accounts, paid out, counts), "Add another
  account", shelves EVALS / FUNDED / LIVE / PUT AWAY (folds remembered in
  localStorage; Put away folded by default). Cards (`.card.ab-card`, so the
  glass rules and Clear's turn apply): logo, firm, badge, "On" for the active
  one, size, chip with the name; stats; the big figure; Log payout (funded),
  Withdraw (live), Passed (eval, confirm); Balance · Peak; Update balance;
  the sparkline. Pressing a card switches to it; the pencil edits. "Select
  for payout/withdrawal" ticks cards and logs the same amount on each. A
  payout just logged counts the card down and floats the amount off.
- **The sheet** (new/edit): Type, the firm tiles for that type, the firm's
  logo row, the firm's sizes as chips (or any amount), the name (made up
  until you type one: "Apex 50K", "Apex 50K #2"), currency, risk, opened /
  weekly target, colour; editing adds the payouts and corrections (each can
  be taken back) and Blown / Archive / Delete.

Tests: acctboard.mjs (36) is new; acct, acctdel and settings were rewritten
for the cards and the sheet.

## His clips with sound built in; the whole clip by default (2.38.0 — his "2.19.0", 25 Oct)

- The four clips he sent for sharing (cut clean earlier: Luffy, Levi, Asta,
  Wall Street — TikTok marks, black openings and the TikTok end cards off)
  now come with the app: `src/media/clips/*.mp4` + a lively still each
  (`*.jpg`, the most contrasty of nine frames), listed in
  `share/clips.js` (`BUILTIN_CLIPS`, ids `builtin:<name>`). The share
  sheet's Background tab shows them under **With sound**, between his own
  and the drawn ones. `store.builtinClips` merges how he left each one
  (trim, position, dim, sound) from `share.prefs.builtin[id]`;
  `updateShareClip` writes there for a built-in; `shareClipBlob` fetches the
  file once. They cannot be removed. The preview strips the list (the
  single-file build carries the mp4s only with `--with-media`).
- **The whole clip by default.** A new clip's trim is its full length (it
  was the first ten seconds). Clips left at that old ten-second default are
  healed to their full length on open; Adjust shows "the whole clip" or a
  **Use the whole clip** button. The card is as long as the trim, so the
  video runs to the end.

Tests: share.mjs gained the built-in clips (62).

**Logos he made, built in (same version).** He sent images of the firms'
and brokers' logos he made himself: FTMO, The5ers, FundingPips, Alpha
Capital, Topstep, Lucid, Tradeify, Apex, MyFundedFutures, OANDA,
Pepperstone, Fusion Markets, and Tradovate (added as a broker for it). Each
went through `logo.js squareLogo` (Pepperstone's was cut inside its border
first) to `src/media/firms/<id>.png` and is the firm's `logo` in
acctfirms.js — the tile uses his own in-app image if he has added one, else
this, else the initials (`logoTile`). The account sheet's logo row says
"Change" for these and "Use the first one" once he has put his own in.
`squareLogo` now also treats an app icon saved on white, filling most of the
picture, as an icon (edge to edge).

**Add account, one question at a time (same version).** He pointed at
LiquidJournal's Add account: it first asks *Prop firm* or *Live*, then for a
prop firm *Futures or CFD?*, then the firm; for live, the broker. New
account (and "Add another account", and `#/accounts`) now opens that,
in `views/acctnew.js` (`newAccount(store, nav, { path })`):

- **Start** — two cards, Prop firm (an office block) and Live (the
  columns), each with its firms' logos in a row.
- **Prop firm:** *Futures or CFD?* (big word, what it trades, "5 firms" /
  "4 firms" — `MARKETS` and `firmsIn()` in acctfirms.js; the forex firms
  are the CFD ones) → *Choose a firm* (big logo tiles on the firm's tint,
  the sizes it sells, a search, "Another firm") → *Pick a plan* (Stage:
  Evaluation / Funded, then the sizes as cards, or "Another size") → *Name
  this account* (a suggested name and two others to tap, **Current balance
  (optional)** for an account he is already trading — kept as a dated
  correction through `store.setBalance` — and how the card will look; More
  holds currency, risk, opened, colour) → *Confirm* (every field, and the
  logo row) → Create account.
- **Live:** *Choose your broker* (logo, name, what it trades — `trades` on
  each broker; Other to type one) → *Account details* (name, starting
  balance, journaling from) → *Confirm*.

Picking a card moves on by itself; steps with typing have Continue, which
says what is missing. A rail on the left shows the steps, what was picked
under each, and goes back to a done one; on a phone the rail hides and the
head says "2 of 4". Editing an account is still the one sheet
(`accountSheet` in acctboard.js). `logoTile` and the logo row moved to
`views/acctlogo.js` so both can use them. Nothing about LiquidJournal's
rule sets (targets, drawdowns) is copied — Laminar does not keep firm rules.

Tests: acctboard.mjs walks both paths (50); acct.mjs checks the first
question.

**The firm's logo in the top bar (same version).** He asked for the logo
of the prop firm or broker in place of the colour dot top right. `acctMark`
(views/acctlogo.js) is the logo tile for an account at a firm — the one he
picked, else one read from its name (`guessFirm` in acctfirms.js: whole
words like "Apex", "Topstep", "OANDA", or a long name run together like
"fundingpips10k"; "Alpha" alone is not enough) — and the old colour dot
for an account at none. It is in the top bar's account button, every row
of its menu (dots are spaced to line up with the logos), and the "Saving
to" / "Adding to" pill on New trade and Import. Editing an older account
now starts with the firm its name says picked.

Tests: acctboard.mjs (53) — the guesses, the top bar and its menu.

**Three fixes from his screenshots (same version).**
- Plan (Outlook): the instrument's chart now sits in a soft-cornered panel
  like the notes beside it (`--r-inset`, the notes' fill when the glass is
  off, the glass card fill when it is on), with room round the name — it
  was flush to the block with square corners and the name on the edge.
- Gold and silver: the stack of bars was 2.3 low on the disc; `bars()` in
  flags.js lifts it so it is centred like TradingView's gold.
- No win/loss bar before the instrument's logo — gone from Recent trades
  on the Dashboard, the trades table, and the Review list and card head
  (the result still says it, coloured, at the end of the row).

Tests: marks (27), dash (33), outlook (28).

## The headline counts up (2.38.1 — his "2.19.1", 26 Oct)

He asked for the Dashboard's big number to count up like LiquidJournal's,
quicker. LiquidJournal's runs about three seconds, easing from roughly half
the figure. Laminar's (`countUp` in views/dashboard.js) runs 1.6 s from zero (0.9 s at first; he asked for it slower)
when you arrive on the Dashboard or switch unit or account (`nav.fresh`), and
0.9 s from what it read before when the 7D / 30D / 90D / All window
changes; ease-out (quart). $, % and R all count, cents included. The width is
held at the final figure's (min-width, cleared at the end) so the trades and
days beside it do not move. A re-render mid-count carries on from where it
was. Motion off or reduced motion: no count. Only the headline counts.

Tests: dash.mjs (36) — mid-count, final figure, width held, motion off.

**OANDA and Tradovate logos swapped back (same version).** The two images
had gone to the wrong brokers: the blue one with the white mark is
Tradovate's, the dark blue one with green is OANDA's. The files are
swapped, and so are the tints (OANDA #12305C, Tradovate #2F7BEA).

**Fonts: Inter, Manrope and IBM Plex Sans in, Newsreader and Mono out
(same version).** He kept Jakarta and Geist, asked for Inter
(rsms.me/inter) and one or two more that suit a trading app. Added Manrope
(rounded, the fintech feel) and IBM Plex Sans (technical, clear figures).
Each is the latin variable woff2 from @fontsource-variable (5.3.0) in
src/fonts, inlined by the bundler like the others. Newsreader's file and
rules are gone; Geist Mono stays (it is still the --mono face). A saved look
on 'newsreader' or 'mono' falls back to Jakarta (fontOf). Five options in
the 2-column picker: the odd last one spans the row.

**The − value + steppers redone (same version).** He said most of them
looked heavy: a square box with a hairline ring and two dark tiles. Now one
soft rounded field (36 px, radius 12, the panel's inset), the − and + quiet
until hovered, the figure in the sans at 600 with tabular numbers. Inside a
card or sheet there is no second pane of glass and no ring; on the bare
picture a stepper keeps its glass. Risk rules labels on the Playbook are
the sans at 13 px in --ink-3 (they were tiny grey mono).
(clarity.mjs's "dragging it clearer" check is flaky under load — it fails
now and then with or without this change; worth a longer wait one day.)

**A glow on the headline (same version).** The Dashboard's Net P&L has a
soft text-shadow glow in its own colour (green, red, or the ink): two
layers, 18 px at 42% and 42 px at 20% (color-mix with currentColor); on the
light paper themes one gentler layer, 16 px at 22%.

**The Dashboard curve runs smooth (same version).** Like LiquidJournal's:
`smoothPath` in dashboard.js draws a monotone cubic (Fritsch–Carlson)
through the same points, so it never overshoots — a peak drawn is a peak
reached. The green/red split at zero, the fill, the draw-in and the hover
are as they were; the line is 2.4 px and its end dot glows in its colour,
with no ring round it and no figure beside it (he asked for both gone).

**No page scrollbar (same version).** He spotted the page widening for a
moment as Analytics arrived: the page's scrollbar showed while a card rose
past the bottom edge, then went, and the page grew back. The page (.main,
and html/body for the phone layout) now has no scrollbar at all
(scrollbar-width:none and ::-webkit-scrollbar display:none) and still
scrolls with the wheel, trackpad and keys; the old scrollbar-gutter rule is
gone. Lists and sheets inside keep their own thin bars.
Then his video showed it was not the page at all: Analytics scrolls inside
its own body (.an-body), and that bar flashed as the cards rose. The same
no-bar rule now covers every page that scrolls inside itself — .an-body,
.lab-body, .rv-body, .rp-body, .wk-scroll, .tg-scroll, .outlook-scroll.

**No 30-day strip on the Plan (Outlook) page (same version).** He asked for
the "Last 30 days · bias right · with it · against it · no bias" line at the
top of the page to go. outlook.js no longer puts `outlookStrip` there (the
function stays in an-outlook.js, unused); the same figures are on
Analytics → Outlook. outlookedge.mjs checks it is gone (16).

**His GT3 RS video as a background (same version).** The seventh built-in
background, "GT3 RS" (id gt3): his 10 s studio clip of the car, 1080p H.264
as he sent it (re-wrapped with faststart, no audio), poster = its first
frame at 960×540. It is pale, so its scrim is 0.55 (the dark ones sit at
0.3–0.6). bgfirst and glass count eight tiles now.
**…and his water clip (same version).** "Water" (id water): a Pexels clip
(Rostislav Uzunov, 4K, 6 s) scaled to 1920×1080 30 fps, H.264 CRF 27 like
the others, no sound; its last second is cross-faded into its first (1 s
xfade), so the 5 s loop has no seam (the join differs from its neighbour by
about as much as any two frames do). Scrim 0.45 (bright glints, dark
water, like Moon). Nine tiles now.

**Topography removed (same version).** He asked for it to go: out of
BACKGROUNDS, its mp4 and poster deleted. A journal still set to 'topo'
simply opens with no background (findBackground → null). Seven videos now;
bgfirst/glass count eight tiles with None; the scrim check compares Torii
with Rain instead.

**The default picture is frosted glass (same version).** With no picture
and no colour of his own chosen (accounts.userColour unset), the avatar in
the top bar and on Settings is a frosted disc — the ink at 12–16% with a
14 px backdrop blur, no ring — with the initials (or the person icon) in
the ink. Choosing a colour in Settings still paints it that colour; a
picture or video still covers it. avatar.mjs expects the frost now.

**Confidence and Feeling after sliders (same version).** Three things he
asked for on New trade:
- The numbers sit under the knob: each tick is placed at the knob's own
  centre for that step (12 px + (100% − 24 px) × i/4) instead of in even
  fifths, so 2 and 4 line up (they were off by ~10 px).
- No ring round the knob: the slider's own thumb is now invisible (it is
  still what you drag and what the keys move) and a `.conf-knob` is drawn
  over it — the ink with a soft highlight and shadow, no dark ring.
- It moves: the knob glides to each step with a small spring (left, .26 s),
  swells a little on hover, and while held (`.is-held`, pointerdown →
  pointerup) grows to 1.22× with a soft halo. Motion off: no transitions.

**The sliding highlight everywhere (same version).** He liked the top bar's
pill sliding between tabs and wanted it on most buttons. The bars the whole
app redraws already had it (segGlide). New `glide.js` (started once in
app.js, `initGlide`) covers the groups that update in place or redraw only
themselves: the chart timeframes (.tc-seg/.tv-seg/.rv-seg), the share sheet
(.sh-seg), the trade form's single-choice chips (.exit-reasons, not
Mistakes, which is several-at-once), the Appearance tiles (.lk-opts), and
any switch inside a sheet or popover (Add account's Stage among them). On a
press it notes where the chosen one is; after the click (polled for up to
0.6 s, so a save-then-redraw still counts) it finds the group again — the
same element or the one drawn where it was — and a pill in the new choice's
own colour, radius and shadow slides from old to new (.seg-pill.go, .28 s),
with the buttons above it (.has-glide). Skipped when motion is off, when
nothing was chosen before, or when segGlide is already gliding it.

**The slide without the twitch (same version).** He saw the pill twitch on
New trade, 7D…All and the Lab's trades-ahead. Measured frame by frame, the
chosen button's brightness jumped, dipped and wobbled: the old pill was not
dressed like the button (its own fill, radius and ring), and at the end the
button's fill faded back in from nothing over its 150 ms transition as the
pill vanished. Now one `slidePill` (glide.js) does both paths (segGlide in
shell.js calls it too): the pill copies the chosen button's computed
background, radius and shadow; the button's transition is held off while
the pill runs and for the frame it hands back; an old choice that is the
same element loses its fill at once instead of fading under the pill; the
end is the pill's own transitionend (fallback 420 ms); a group whose chosen
button has no fill gets no pill. The same measure now rises smoothly to the
final value and stays there.

**Analytics' tabs read like the Journal's and the Lab's (same version).**
Overview · Weekly winrate · Tags · Timing · Execution · Discipline · Outlook
were a boxed seg beside the "Analytics" title; now they are the subnav —
words, the chosen one underlined, the line sliding (shell.glide, name
'sub-analytics'), the title kept for screen readers only, the head marked
has-subnav like the others. They are still buttons on the page's own tab
state (not routes). Tests that clicked `.head .seg button` for them use
`.head :is(.seg, .an-tabs) button` (anviz, weekly, anexec, theme, newsday,
anal, outlookedge, yearview, motion).

## Page notes moved off the title row (2.38.1)
- A page's note (`.head .sub`, e.g. Playbook "Shared across every account") is now a caption under its title: app.js `stackTitle()` wraps the h1 and its `.sub` in `.head-title` after `dressHead`.
- On pages whose title is a row of tabs, nothing sits beside the tabs any more: Trades' "N closed on <account>" is gone (the Journal badge and top bar already say it); the Outlook save stamp (`.ol-stamp`, blank until something is saved), the Newswire source/stamp, the Analytics and Calendar-year counts and the Prop-firms disclaimer moved to the right, by the controls, as `.head-meta`.
