# Turning this into a real app

You never install Rust. GitHub builds the installers for you, free.

---

## The five minutes of setup

**1. Make a GitHub account** at github.com if you don't have one. Free.

**2. Make a new repository.** Green *New* button. Call it `ledger`.
Private is fine — you get 2,000 free build minutes a month. GitHub counts
a Windows minute as two, so a Windows-only build costs about 15–25 of them
(less once Rust is cached). A public repo builds for free.

**3. Upload the CONTENTS of the `ledger-desktop` folder.**

Unzip the download. You get a folder called `ledger-desktop` with six
things inside it:

    ledger-desktop\
    ├── .github\          the build instructions for GitHub
    ├── src\              the app itself
    ├── src-tauri\        the native shell
    ├── package.json
    ├── README.md
    └── SETUP.md

On the empty repo page click *uploading an existing file*. Then open the
`ledger-desktop` folder, select all six items (Ctrl+A), and drag **those**
onto the page. Commit.

> **Do not drag the `ledger-desktop` folder itself.** Your repo needs
> `.github` sitting at the very top, because that is the only place
> GitHub looks for build instructions. Nest it one level deeper and the
> Actions tab will simply be empty — no error, no explanation.
>
> Getting it right, your repo's file list starts with:
> `.github` · `src` · `src-tauri` · `package.json`
>
> Getting it wrong, it shows a single folder called `ledger-desktop`.
> If that happens, delete the files and upload them again one level up.

**4. Build it.** Go to the **Actions** tab → *Build Laminar* →
**Run workflow** → the green button.

**5. Wait about ten minutes** (a few, once Rust is cached). When the run
goes green, scroll to the bottom of it. Under **Artifacts** there is one
download, **laminar-windows**. Inside it: **`Laminar_<version>_x64-setup.exe`**. Run it. Done —
Ledger is in your Start Menu with its own icon.

---

## The first launch

Windows will say **"Windows protected your PC"**. That is not a problem
with the app; it is what every unsigned installer does. Click
**More info → Run anyway**. You will only ever see it once.

Getting rid of that message permanently needs a code signing certificate,
around $250 a year. Not worth it for an app only you run. If you ever
publish Ledger properly, it becomes worth it, and adding one is a config
line — nothing about the build changes.

On first open the app makes **Documents\Ledger** and starts. No folder
picker, no permission prompt, no terminal window. To keep your existing
journal, copy your current `.json` files into that folder — or click the
folder name at the top of Settings and point it at where they already are.

---

## Changing something later

Edit the files in `src`, commit, run the workflow again. That's the loop.

To cut a proper release instead of a bare download, tag it:

```
git tag v1.0.1
git push origin v1.0.1
```

The workflow builds the Windows installer for that tag too. (It used to
build macOS and Linux as well — macOS minutes count ten times on a private
repo, which used the monthly allowance up; it is Windows only now.)

---

## Building on your own machine instead

Only worth it if you're changing things constantly and don't want to wait
ten minutes each time.

1. **Rust** — https://rustup.rs, run `rustup-init.exe`, accept the defaults.
2. **C++ build tools** — the *Build Tools for Visual Studio* installer,
   tick *Desktop development with C++*. This is the ~2GB part.
3. Then, in this folder:

```
npm install
npm run tauri dev      # live window, reloads as you edit
npm run tauri build    # produces the installer
```

The installer lands in `src-tauri/target/release/bundle/`.

---

## What is in here

    src/                 the app — unchanged from the web version
    src-tauri/src/main.rs   the native shell: six commands, ~80 lines
    src-tauri/tauri.conf.json   window size, icons, installer settings
    .github/workflows/build.yml  the free build machine

`src/js/fs.js` is the only file that knows which of the two it is running
in. Everything above it — every view, every calculation — is identical.

---

## Still running it in a browser

`npm run serve` then open http://localhost:8777. The same code, using the
browser's folder API instead of the native one. Useful for a quick look
without a build.
