# Ledger

A trading journal that keeps your data as plain files in a folder you choose.
No account, no server, nothing uploaded.

## Running it

**As a desktop app** — see `SETUP.md`. GitHub builds the installer for you
for free; you never install a toolchain. The app opens straight onto your
journal: no browser, no server, no permission prompt.

**In a browser** — `npm run serve`, then http://localhost:8777. Chrome or
Edge only, since it leans on the File System Access API, and the browser
asks permission for your folder once per session. The server exists because
browsers will not give a double-clicked `file://` page access to a folder.

Both run the same code. `src/js/fs.js` is the only file that knows the
difference: native goes through six small Rust commands, the browser goes
through the File System Access API. Every view and every calculation above
that line is identical.

## Your data

On first run you pick a folder. Ledger writes:

    accounts.json      your accounts
    trades.json        every trade
    playbook.json      setups, tags, sessions, risk rules
    screenshots/       chart images
    replay/weeks.json  your imported backtest weeks
    replay/*.csv       a copy of every CSV you imported

These are ordinary files. Open them, read them, copy them. **Backing up is
copying the folder.** Moving to another machine is copying the folder, or
using Export & import for a single CSV.

## The shape of it

    index.html         the page
    css/app.css        design tokens and components
    js/store.js        the folder — read and write the JSON files
    js/calc.js         every number the app shows, and nothing else
    js/csv.js          export and import
    js/replay.js       reading an FX Replay export
    js/ui.js           element helpers, icons, the line chart
    js/views/*.js      one file per screen
    js/app.js          boot, sidebar, routing

## Money, percent, or R

One switch in the sidebar changes the unit every screen reads in. Nothing is
recalculated behind your back — the same trades, said three ways:

    $   the money, exactly as you entered it
    %   that money against the account's STARTING balance
    R   what the trade was worth in units of the risk you took

Percentages are always of the starting balance, never of the balance at the
time. It is the same base 1R is worked out from, so a +2% week in January and
a +2% week in September are the same size, and nothing shrinks just because
the account grew.

R is never converted from dollars. Two trades that made the same money are not
the same number of R if they risked different amounts, so R is summed trade by
trade — and a set where even one trade has no risk on it shows no R total at
all rather than a partial one.

The trade form stays in money whichever unit is on: that is where you type
what the broker actually paid you.

## Weekly target

Optional, one per account, set from the calendar's by-week card or from the
playbook's risk rules. Set it and the by-week bars fill against the target
instead of against your biggest week — a full bar means you hit it.

You type it in whichever unit is switched on and it is stored as a percentage
of the account's starting balance, so it means the same thing on a 25k account
and a 200k one. Read back in R it needs a default risk per trade to convert
through; without one the app says so rather than guessing.

## Replay

Import the FX Replay CSV for a week and it lines up against the trades you
actually took. Two trades are the same trade when the instrument matches, the
direction matches, and the entries fall inside your match window (± 15 minutes
by default) — which gives four verdicts: Matched, Diverged, Missed, Extra.

The window never touches the session labels. Each side keeps the killzone its
own entry time earned, and a matched pair that straddles two killzones is
flagged rather than smoothed over: the right setup at the wrong time is a
finding, not a rounding error.

Everything compares in **R**, never dollars. Your replay account is sized
differently from your live one, so the CSV's dollar columns are read and then
left alone. `avgRiskReward` is taken as the R multiple, as-is.

FX Replay exports UTC; the CSV clock toggle shifts it onto your clock (+8 for
Perth). Change it and re-import — it decides which session every replay trade
lands in.

## After a loss

The Discipline tab's second panel is the one worth reading. For every losing
trade it finds what you did next, and compares it to your own baseline:
expectancy and win rate after a loss, how often you re-entered inside 30
minutes of that loss closing, how often you sized up, and your longest losing
run. `afterLoss` in `calc.js` does the work.

All of it is derived from what is already stored — the order trades happened
in, what each risked, what each made. It reports what the next trade did and
leaves the reading of it to you.

## Motion

Two rules, and the code enforces both.

**Nothing animates on a re-render.** The app rebuilds its DOM on every click,
so an entrance tied to element creation would replay constantly. `app.js`
compares view, trade id, unit and account against the last render and only
then puts `enter` on `.main` — every animation is scoped to that class, and it
is taken off again after 900ms. Filtering, stepping a month, switching an
analytics tab: no replay.

**Cards never fade.** The ground is light grey and the cards are near-black,
so fading a card up from zero flashes the background through it — on a dark
app that reads as a strobe. The card paints instantly and only its *contents*
animate, over the card's own surface, exposing nothing.

**Nothing you read moves.** Figures fade in where they already sit. They never
slide into place and they never count up — a number you have to wait to read
is a number you cannot check at a glance, which in a trading journal is the
whole point.

What does move: bars grow from their baseline, the equity line strokes itself
in (`pathLength="1"` normalises the dash maths so one keyframe draws any
curve), and controls sink about 2% under the cursor on press.

`prefers-reduced-motion: reduce` collapses every duration to 1ms.

## Typing numbers

Amounts are read forgivingly. `25000`, `25 000`, `$25,000`, `$25 000`,
`1 234.56`, `(750)` for a negative, and a trailing `%` or `R` are all
understood — see `parseNumber` in `calc.js`. Where a dot and a comma both
appear, whichever comes last is the decimal point, so `$1,234.56` and
`1.234,56` both read as 1234.56.

Because it guesses, it shows its work: the starting-balance field echoes back
the figure it read (and what 1R will cost), and the trade form says when it
cannot read an amount rather than just grey out the save button.

## The one rule

The screens are deliberately quiet: a figure, its label, and nothing
explaining how to read it. What is worth knowing but not worth permanent
screen space lives on a tooltip — hover the Sessions heading, the year in the
replay strip, or the folder name in the sidebar.

`calc.js` holds one rule worth keeping: if a number cannot be derived from a
stored field, it does not go on screen. No claims about what price would have
done after you exited.
