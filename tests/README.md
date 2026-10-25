# tests

Playwright driving Chromium against the real app — no mocks below the network.
~1,750 checks across 69 suites.

```bash
npm install
npx playwright install chromium
./tests/run.sh               # everything
./tests/run.sh tags pborder  # just those
QUIRE_VERBOSE=1 ./tests/run.sh tags     # with each check printed
```

`run.sh` builds `Laminar.html` and serves `src/` on 8777 itself, and stops the
server again if it started it. Screenshots and scratch files go to
`QUIRE_TEST_OUT` (default `/tmp/quire-tests`), never into the repository.

| | |
|---|---|
| `suites/` | one file per suite; each is a standalone node program |
| `suites/e2e.mjs` | holds the `FAKE_FS` template every other suite reads to fake the vault. Not run on its own |
| `fixtures/` | real CSV exports and chart images the suites feed to the app |

`QUIRE_CHROMIUM` points at a browser binary if you do not want Playwright's
own. `QUIRE_PORT` moves the server.

The conventions these suites are built on — including why a check that passes
is not always a check that is worth having — are in `../HANDOVER.md`.
