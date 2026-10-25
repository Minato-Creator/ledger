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
    css/app.css        components
    css/look.css       the frame, the page, the sheets and the motion
    fonts/             the four typefaces, bundled (all OFL)
    js/store.js        the folder — read and write the JSON files
    js/calc.js         every number the app shows, and nothing else
    js/csv.js          export and import
    js/replay.js       reading an FX Replay export
    js/ui.js           element helpers, icons, the line chart
    js/look.js         themes, accent, text, lines, font — as CSS variables
    js/flags.js        instrument marks: a pair's two flags; gold, silver, Nasdaq, S&P and coins as one disc
    js/share/          the share card (card.js), its MP4 (encode.js, mp4.js) and GIF (gif.js)
    js/clip.js         small things done to a video file (length, best still, seeking, a tidy name)
    media/backgrounds/ the looping background videos and their stills
    js/shell.js        the top bar, the section tabs, the phone's bottom bar, your picture (profileFill)
    js/sheet.js        panels that rise over the app
    js/views/*.js      one file per screen (appearance.js is the look sheet)
    js/app.js          boot, routing

## Money, percent, or R

One switch in the top bar changes the unit every screen reads in. Nothing is
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

**Nothing animates on a re-render.** The app rebuilds its DOM on every click,
so an entrance tied to element creation would replay constantly. `app.js`
compares view, trade id, unit and account against the last render and only
then marks the page as arrived (`enter` on `.main`, `arrive` on its cards) —
and takes it off again after 2.8 seconds, once the slowest chart has drawn.
Filtering, stepping a month, switching an analytics tab: no replay. The page
header never moves; only the body under it does.

What moves when a page is new: the cards rise into place one after another
on the curve a phone sheet uses (the page behind them is close to their own
colour now, so nothing strobes). The big figures write themselves in a glyph
at a time where they already sit — they never count up, so the number is
right from the first frame. Each chart waits until its card has landed, then
bars grow from their baseline (1.1 s) and lines stroke themselves in (1.5 s;
`pathLength="1"` normalises the dash maths). Monte Carlo and the prop-firm
simulation replay every time their page is opened (`nav.fresh`).

What moves on every click: the pill under the section you are on, the
underline under a section's tab and the chosen segment of any switch slide to
their new place instead of jumping (`glide` and `segGlide` in `shell.js`).
Sheets rise and sink; a new theme spreads out as a circle from where you
clicked (the View Transitions API, where the webview has it).

Appearance → Custom → Motion has Full, Calm (cards only) and Off.
`prefers-reduced-motion: reduce` behaves as Off.

## Typing numbers

Amounts are read forgivingly. `25000`, `25 000`, `$25,000`, `$25 000`,
`1 234.56`, `(750)` for a negative, and a trailing `%` or `R` are all
understood — see `parseNumber` in `calc.js`. Where a dot and a comma both
appear, whichever comes last is the decimal point, so `$1,234.56` and
`1.234,56` both read as 1234.56.

Because it guesses, it shows its work: the starting-balance field echoes back
the figure it read (and what 1R will cost), and the trade form says when it
cannot read an amount rather than just grey out the save button.

## Sharing a trade

**Share** on a closed trade (its page, or the icon on its row in Trades)
opens a card you can save as a video with sound, a GIF or a picture: the
instrument, the result counting up, the numbers, and the trade's own OANDA
candles drawn straight over a background — one of your own clips (kept in
the journal folder) or one of five drawn in code. Everything is set on the
sheet and remembered. HANDOVER.md has how it is made.

## The one rule

The screens are deliberately quiet: a figure, its label, and nothing
explaining how to read it. What is worth knowing but not worth permanent
screen space lives on a tooltip — hover the Sessions heading, the year in the
replay strip, or the folder name in the sidebar.

`calc.js` holds one rule worth keeping: if a number cannot be derived from a
stored field, it does not go on screen. No claims about what price would have
done after you exited.
