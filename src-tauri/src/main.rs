// Prevents a console window appearing behind the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/* ============================================================
   Quire — the native shell.

   A handful of file commands and two path commands, and that is the whole
   backend. Screenshots go over the same bridge as base64 and land as ordinary
   image files in the journal folder.
   The journal is an ordinary folder of JSON files, so there is nothing here
   but std::fs; no database, no server, no sync.

   Every command returns Result<_, String> so a failure arrives in the UI as
   a message rather than an unhandled rejection.

   Off the window's thread (7 Nov). A plain #[tauri::command] runs on the
   main thread — the one that draws the window and takes its clicks — so
   while it waited on the disk or, worse, the network (OANDA, the prices, the
   news), the whole app stood still with it: the desktop app went slow where
   the web page did not. Everything that touches the disk or the network now
   runs on Tauri's pool of blocking threads (`off_main`); the page asks and
   is answered exactly as before. The page keeps calls on one file in the
   order it made them (fs.js), since the main thread no longer does.
   ============================================================ */

use std::path::{Path, PathBuf};
use tauri::Manager;

/// Do blocking work — a file, a request — away from the window's thread, and
/// hand back its answer.
async fn off_main<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_text(path: String) -> Result<String, String> {
    off_main(move || std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))).await
}

/// Writes a file, creating the folders above it first.
#[tauri::command]
async fn write_text(path: String, contents: String) -> Result<(), String> {
    off_main(move || write_text_now(&path, &contents)).await
}

/* Never a half-written file (7 Nov). A plain write cut off part way — the app
   closed by Windows while it was "Not Responding", a crash, the power — left
   a file with half a journal in it, and the next opening read that as no
   journal at all. Now the new text goes to <name>.tmp beside it, is made
   whole on disk, and then takes the old file's place in one step: a cut-off
   save leaves the old file or the new one, never half of either. The file it
   replaces is kept as <name>.bak first, so the version before the last save
   is always one step away (store.js opens it when the file itself is
   damaged). If the swap is refused — a sync client or an editor holding the
   file open — it is written in place, as before. */
fn write_text_now(path: &str, contents: &str) -> Result<(), String> {
    use std::io::Write;
    let target = Path::new(path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    let tmp = beside(target, "tmp");
    let written = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(contents.as_bytes())?;
        f.sync_all()
    })();
    if let Err(e) = written {
        let _ = std::fs::remove_file(&tmp);
        return std::fs::write(target, contents).map_err(|e2| format!("{path}: {e2} (and {e})"));
    }
    if target.exists() {
        let _ = std::fs::copy(target, beside(target, "bak"));
    }
    match std::fs::rename(&tmp, target) {
        Ok(()) => Ok(()),
        Err(_) => {
            let _ = std::fs::remove_file(&tmp);
            std::fs::write(target, contents).map_err(|e| format!("{path}: {e}"))
        }
    }
}

/// `<name>.<ext>` in the same folder: trades.json → trades.json.bak.
fn beside(p: &Path, ext: &str) -> PathBuf {
    let mut name = p.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(".");
    name.push(ext);
    p.with_file_name(name)
}

/* Screenshots. They cross the bridge as base64 because that is what a JSON
   IPC call can carry, and land as real image files you can open from the
   folder — the point of keeping the journal as files at all. */
#[tauri::command]
async fn read_image(path: String) -> Result<Option<String>, String> {
    off_main(move || match std::fs::read(&path) {
        Ok(bytes) => Ok(Some(b64_encode(&bytes))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{path}: {e}")),
    })
    .await
}

#[tauri::command]
async fn write_image(path: String, data: String) -> Result<(), String> {
    off_main(move || {
        let bytes = b64_decode(&data).ok_or_else(|| format!("{path}: not valid base64"))?;
        if let Some(parent) = Path::new(&path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
        }
        std::fs::write(&path, bytes).map_err(|e| format!("{path}: {e}"))
    })
    .await
}

/// Show a folder in the operating system's own file manager. Every platform
/// spells this differently and none of them need a crate for it.
#[tauri::command]
async fn open_path(path: String) -> Result<(), String> {
    let program = if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    off_main(move || {
        std::process::Command::new(program)
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("{path}: {e}"))
    })
    .await
}

/// Removing one file. Already gone counts as done.
#[tauri::command]
async fn delete_path(path: String) -> Result<(), String> {
    off_main(move || match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("{path}: {e}")),
    })
    .await
}

/* Base64, by hand. Pulling a crate in for forty lines would add a dependency
   to audit and a version to keep, for a job that is entirely specified. */
const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn b64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(B64[(n >> 18 & 63) as usize] as char);
        out.push(B64[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6 & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[(n & 63) as usize] as char } else { '=' });
    }
    out
}

fn b64_decode(text: &str) -> Option<Vec<u8>> {
    let mut acc: u32 = 0;
    let mut bits = 0u8;
    let mut out = Vec::with_capacity(text.len() / 4 * 3);
    for ch in text.bytes() {
        if ch == b'=' || ch == b'\n' || ch == b'\r' { continue; }
        let v = B64.iter().position(|&c| c == ch)? as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    Some(out)
}

#[tauri::command]
async fn make_dir(path: String) -> Result<(), String> {
    off_main(move || std::fs::create_dir_all(&path).map_err(|e| format!("{path}: {e}"))).await
}

/* (a folder on a cloud drive can take a moment to answer even this) */
#[tauri::command]
async fn path_exists(path: String) -> Result<bool, String> {
    off_main(move || Ok(Path::new(&path).exists())).await
}

/// Renames a folder where it stands. Used once: a journal folder made while
/// the app was still called Ledger becomes "Quire". It never overwrites — if
/// the new name is taken, nothing happens and the old folder is kept.
#[tauri::command]
async fn rename_dir(from: String, to: String) -> Result<(), String> {
    off_main(move || rename_dir_now(&from, &to)).await
}

fn rename_dir_now(from: &str, to: &str) -> Result<(), String> {
    let (f, t) = (Path::new(from), Path::new(to));
    if !f.is_dir() {
        return Err(format!("{from}: not a folder"));
    }
    if t.exists() {
        return Err(format!("{to}: already exists"));
    }
    std::fs::rename(f, t).map_err(|e| format!("{from} -> {to}: {e}"))
}

#[tauri::command]
fn path_sep() -> String {
    std::path::MAIN_SEPARATOR.to_string()
}

/// Where the app keeps its own tiny config — which folder you chose, and
/// nothing else. Your trades never live here.
#[tauri::command]
fn config_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir: PathBuf = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

/// First run, no questions asked: Documents/Quire. Somewhere you can find
/// it, back it up, and open the files yourself.
#[tauri::command]
fn default_folder(app: tauri::AppHandle) -> Result<String, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;
    Ok(base.join("Quire").to_string_lossy().to_string())
}

/* A TradingView snapshot, as a picture (7 Nov). The Charts box takes a
   snapshot link (camera → Copy link: tradingview.com/x/<id>/) and saves the
   picture behind it, which TradingView keeps at
   s3.tradingview.com/snapshots/<letter>/<id>.png. One host, that one shape
   of address, reading only, no bigger than a screenshot should be, and only
   a PNG or JPEG comes back — as base64, like read_image. */
#[tauri::command]
async fn fetch_image(url: String) -> Result<String, String> {
    off_main(move || fetch_image_now(&url)).await
}

fn check_image_url(url: &str) -> Result<(), String> {
    let refuse = || Err(format!("not a TradingView snapshot: {url}"));
    let Some(rest) = url.strip_prefix("https://s3.tradingview.com/snapshots/") else { return refuse() };
    let mut parts = rest.split('/');
    let (Some(dir), Some(file), None) = (parts.next(), parts.next(), parts.next()) else { return refuse() };
    let Some(id) = file.strip_suffix(".png") else { return refuse() };
    let ok = dir.len() == 1
        && dir.chars().all(|c| c.is_ascii_alphanumeric())
        && (4..=20).contains(&id.len())
        && id.chars().all(|c| c.is_ascii_alphanumeric());
    if ok { Ok(()) } else { refuse() }
}

fn fetch_image_now(url: &str) -> Result<String, String> {
    use std::io::Read;
    check_image_url(url)?;
    const MOST: u64 = 16 * 1024 * 1024;
    let res = ureq::get(url)
        .timeout(std::time::Duration::from_secs(20))
        .set("User-Agent", "Mozilla/5.0 (compatible; Laminar)")
        .call();
    match res {
        Ok(r) => {
            let mut bytes = Vec::new();
            r.into_reader().take(MOST + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            if bytes.len() as u64 > MOST {
                return Err("that picture is too big to be a chart".into());
            }
            let png = bytes.starts_with(&[0x89, b'P', b'N', b'G']);
            let jpeg = bytes.starts_with(&[0xFF, 0xD8, 0xFF]);
            if !png && !jpeg {
                return Err("TradingView did not send a picture".into());
            }
            Ok(b64_encode(&bytes))
        }
        Err(ureq::Error::Status(code, _)) => Err(format!("s3.tradingview.com said {code}")),
        Err(_) => Err("could not reach s3.tradingview.com".into()),
    }
}

/* Journals on this computer (7 Nov). Laminar can lose track of the folder
   it was using — its settings file reset, and it opens a new, empty journal
   while the real one sits somewhere else (Minato's on another drive, in
   D:\<name>\Documents). This finds folders holding a Laminar journal — a
   vault.json that says "quire-vault" — in, or one level inside, the usual
   places: Documents, the home folder and the desktop, and on Windows the same
   folders kept on any other drive (X:\<name>\Documents, X:\Users\<name>\...).
   Names and that one small file are read; nothing is opened or changed. */
#[tauri::command]
async fn find_vaults(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for p in [app.path().document_dir(), app.path().home_dir(), app.path().desktop_dir()]
        .into_iter()
        .flatten()
    {
        roots.push(p);
    }
    let user = app
        .path()
        .home_dir()
        .ok()
        .and_then(|h| h.file_name().map(|n| n.to_os_string()));
    off_main(move || {
        if cfg!(target_os = "windows") {
            if let Some(name) = &user {
                for letter in b'C'..=b'Z' {
                    let drive = PathBuf::from(format!("{}:\\", letter as char));
                    if !drive.is_dir() {
                        continue;
                    }
                    for base in [drive.join(name), drive.join("Users").join(name)] {
                        roots.push(base.join("Documents"));
                        roots.push(base.join("Desktop"));
                        roots.push(base);
                    }
                }
            }
        }
        Ok(vaults_in(&roots))
    })
    .await
}

/// Each root, and each folder directly inside it, that holds a Laminar vault.
fn vaults_in(roots: &[PathBuf]) -> Vec<String> {
    let is_vault = |dir: &Path| {
        std::fs::read_to_string(dir.join("vault.json"))
            .map(|t| t.contains("quire-vault"))
            .unwrap_or(false)
    };
    let mut found: Vec<String> = Vec::new();
    let mut add = |dir: &Path| {
        let s = dir.to_string_lossy().to_string();
        if !found.iter().any(|f| f.eq_ignore_ascii_case(&s)) {
            found.push(s);
        }
    };
    for root in roots {
        if !root.is_dir() {
            continue;
        }
        if is_vault(root) {
            add(root);
        }
        if let Ok(entries) = std::fs::read_dir(root) {
            for entry in entries.flatten() {
                let dir = entry.path();
                if dir.is_dir() && is_vault(&dir) {
                    add(&dir);
                }
            }
        }
    }
    found
}

/// The allowlist, on its own so it can be tested without a network.
///
/// A webview that can ask the shell to fetch any URL is a hole: a page bug,
/// or anything that gets to run script in it, could read an intranet address
/// or post somewhere. So the shell will call exactly one host, over https,
/// and nothing else — including addresses that merely end with the right
/// letters, which is the trick this check exists to refuse.
fn check_url(url: &str) -> Result<(), String> {
    /* Every host this app will call, named one at a time. A feed added to
       the app is a deliberate line here, not something a URL can decide. */
    /* Plan → Markets (6 Nov): coin prices from CoinGecko's keyless API or
       Binance's public market data, and company prices from Stooq, or from
       Finnhub once a key is added — reading only, like the rest. 7 Nov:
       Stooq's quote address went away, so company prices come from Yahoo
       Finance's public chart host instead, and Stooq is off the list. */
    const ALLOWED: [&str; 6] = [
        "nfs.faireconomy.media",
        "investinglive.com",
        "api.coingecko.com",
        "data-api.binance.vision",
        "query1.finance.yahoo.com",
        "finnhub.io",
    ];

    let rest = url.strip_prefix("https://").ok_or("only https")?;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    /* No credentials in the authority: https://nfs.faireconomy.media@evil.example
       is a request to evil.example. */
    if authority.contains('@') {
        return Err("that address carries credentials".into());
    }
    let host = authority.split(':').next().unwrap_or("");
    if !ALLOWED.contains(&host) {
        return Err(format!("{host} is not a host this app will call"));
    }
    Ok(())
}

/// What may be asked of OANDA, checked before anything is sent. Reading only,
/// never an order: an instrument's candles (the charts), and for the trade
/// sync the list of your accounts, an account's summary, its trades and its
/// transactions by number. Every one of these is a GET (fetch_oanda sends
/// nothing else), so a key that could trade is only ever used here to read.
/// The host is never taken from the page — it is one of OANDA's two, chosen
/// in fetch_oanda.
fn check_oanda_path(path: &str) -> Result<(), String> {
    if path == "/v3/accounts" {
        return Ok(());
    }
    if let Some(rest) = path.strip_prefix("/v3/instruments/") {
        let (inst, query) = rest.split_once("/candles?").ok_or("not a candles request")?;
        if inst.is_empty() || inst.len() > 20 || !inst.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_') {
            return Err("that is not an instrument name".into());
        }
        return check_query(query);
    }
    if let Some(rest) = path.strip_prefix("/v3/accounts/") {
        let (id, tail) = rest.split_once('/').ok_or("not an account request")?;
        if id.is_empty() || id.len() > 40 || !id.chars().all(|c| c.is_ascii_digit() || c == '-') {
            return Err("that is not an account number".into());
        }
        if tail == "summary" {
            return Ok(());
        }
        if let Some(query) = tail.strip_prefix("trades?") {
            return check_query(query);
        }
        if let Some(query) = tail.strip_prefix("transactions/idrange?") {
            return check_query(query);
        }
        return Err("that is not something Laminar reads".into());
    }
    Err("not a request Laminar makes".into())
}

/// A plain query string: letters, digits and the few marks a query needs.
fn check_query(query: &str) -> Result<(), String> {
    if query.is_empty() || !query.chars().all(|c| c.is_ascii_alphanumeric() || "=&:._-%".contains(c)) {
        return Err("that query has characters it should not".into());
    }
    Ok(())
}

/// Read from OANDA with your own key — candles, or your own trades. The key
/// goes in the Authorization header and nowhere else, and only to OANDA's
/// practice or live API.
#[tauri::command]
async fn fetch_oanda(path: String, token: String, live: bool) -> Result<String, String> {
    off_main(move || fetch_oanda_now(&path, &token, live)).await
}

fn fetch_oanda_now(path: &str, token: &str, live: bool) -> Result<String, String> {
    check_oanda_path(path)?;
    let token = token.trim();
    if token.is_empty() || token.len() > 200 || !token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("that key does not look like an OANDA key".into());
    }
    let host = if live { "https://api-fxtrade.oanda.com" } else { "https://api-fxpractice.oanda.com" };
    let res = ureq::get(&format!("{host}{path}"))
        .timeout(std::time::Duration::from_secs(20))
        .set("User-Agent", "Laminar")
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept-Datetime-Format", "UNIX")
        .call();
    match res {
        Ok(r) => r.into_string().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, r)) => {
            let body = r.into_string().unwrap_or_default();
            Err(format!("OANDA said {code}: {body}"))
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Fetch a URL and hand back the body as text.
///
/// The economic calendar is the one thing in Quire that comes from somewhere
/// else. It is fetched here rather than in the page for two reasons: a
/// webview will not make a cross-site request without the other end's
/// permission, and doing it in Rust means no exception has to be carved into
/// the app's content policy to allow it.
///
/// Only https, and only a host on the list — this command is reachable from
/// the page, and a general-purpose "fetch anything" handed to a webview is a
/// hole, not a feature.
#[tauri::command]
async fn fetch_text(url: String) -> Result<String, String> {
    off_main(move || fetch_text_now(&url)).await
}

fn fetch_text_now(url: &str) -> Result<String, String> {
    check_url(url)?;
    let host = host_of(url);

    /* "compatible; Laminar": it says what is asking, in the form servers
       expect — Yahoo turns away requests that carry no browser-style name */
    let res = ureq::get(url)
        .timeout(std::time::Duration::from_secs(20))
        .set("User-Agent", "Mozilla/5.0 (compatible; Laminar)")
        .call();
    match res {
        Ok(r) => r.into_string().map_err(|e| e.to_string()),
        /* the host and its answer, never the whole address: the message is
           shown on screen, and a Finnhub address carries its key */
        Err(ureq::Error::Status(code, _)) => Err(format!("{host} said {code}")),
        Err(_) => Err(format!("could not reach {host}")),
    }
}

/// The host of an https address already passed by check_url.
fn host_of(url: &str) -> String {
    let rest = url.strip_prefix("https://").unwrap_or(url);
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    authority.split(':').next().unwrap_or("").to_string()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        /* The window's name, set here as well as in tauri.conf.json, so the title bar says Laminar whatever an older config carried */
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title("Laminar");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_text,
            read_image,
            write_image,
            delete_path,
            open_path,
            make_dir,
            rename_dir,
            fetch_oanda,
            path_exists,
            path_sep,
            config_dir,
            default_folder,
            fetch_text,
            find_vaults,
            fetch_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running Laminar");
}

/* Base64 written by hand is base64 worth testing. A bug here would not throw;
   it would quietly corrupt every screenshot the desktop app ever saved. */
#[cfg(test)]
mod url_tests {
    use super::{check_url, host_of};

    #[test]
    fn an_error_names_the_host_not_the_address() {
        assert_eq!(host_of("https://finnhub.io/api/v1/quote?symbol=AAPL&token=secret"), "finnhub.io");
        assert_eq!(host_of("https://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL"), "query1.finance.yahoo.com");
        assert_eq!(host_of("https://investinglive.com:443/feed/"), "investinglive.com");
    }

    #[test]
    fn allows_the_named_hosts_over_https() {
        assert!(check_url("https://nfs.faireconomy.media/ff_calendar_thisweek.json").is_ok());
        assert!(check_url("https://nfs.faireconomy.media/anything?x=1#y").is_ok());
        assert!(check_url("https://investinglive.com/feed/").is_ok());
        assert!(check_url("https://investinglive.com/feed/centralbank/").is_ok());
        assert!(check_url("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=60").is_ok());
        assert!(check_url("https://data-api.binance.vision/api/v3/ticker/24hr?type=MINI").is_ok());
        assert!(check_url("https://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL,BRK-B&range=1d&interval=1d").is_ok());
        assert!(check_url("https://query1.finance.yahoo.com/v8/finance/chart/BRK-B?range=1mo&interval=1d").is_ok());
        assert!(check_url("https://finnhub.io/api/v1/quote?symbol=AAPL&token=x").is_ok());
    }

    #[test]
    fn refuses_everything_else() {
        for bad in [
            "http://nfs.faireconomy.media/x",              // not https
            "https://evil.example/x",                      // another host
            "https://nfs.faireconomy.media.evil.example/x",// ends with the right letters
            "https://evilnfs.faireconomy.media/x",         // starts with the wrong ones
            "https://nfs.faireconomy.media@evil.example/x",// credentials trick
            "https://investinglive.com.evil.example/feed/", // the new host, spoofed
            "https://evilinvestinglive.com/feed/",
            "http://investinglive.com/feed/",               // not https
            "https://api.coingecko.com.evil.example/x",     // the market hosts, spoofed
            "https://coingecko.com/api/v3/ping",            // only the API host, not the site
            "https://api.binance.com/api/v3/order",         // Binance's trading API is not on the list
            "https://stooq.com/q/l/?s=aapl.us",             // off the list since 7 Nov
            "https://query1.finance.yahoo.com.evil.example/v8/finance/chart/AAPL", // Yahoo, spoofed
            "https://query1.finance.yahoo.com@evil.example/v8/finance/chart/AAPL",
            "https://evilquery1.finance.yahoo.com/x",
            "https://finance.yahoo.com/quote/AAPL",         // only the data host, not the site
            "https://query2.finance.yahoo.com/v8/finance/chart/AAPL", // nor its twin
            "http://query1.finance.yahoo.com/v8/finance/chart/AAPL",  // not https
            "https://finnhub.io.evil.example/api/v1/quote",
            "file:///etc/passwd",
            "https://127.0.0.1/x",
            "",
        ] {
            assert!(check_url(bad).is_err(), "should have refused {bad}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{b64_decode, b64_encode};

    #[test]
    fn matches_known_values() {
        assert_eq!(b64_encode(b""), "");
        assert_eq!(b64_encode(b"f"), "Zg==");
        assert_eq!(b64_encode(b"fo"), "Zm8=");
        assert_eq!(b64_encode(b"foo"), "Zm9v");
        assert_eq!(b64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(b64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(b64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn round_trips_every_byte_and_every_length() {
        for len in 0..=600usize {
            let bytes: Vec<u8> = (0..len).map(|i| (i * 7 % 256) as u8).collect();
            let back = b64_decode(&b64_encode(&bytes)).expect("decodes");
            assert_eq!(back, bytes, "length {len}");
        }
        let all: Vec<u8> = (0..=255u8).collect();
        assert_eq!(b64_decode(&b64_encode(&all)).unwrap(), all);
    }

    #[test]
    fn rejects_rubbish_but_tolerates_newlines() {
        assert!(b64_decode("Zm9v\nYmFy").is_some());
        assert!(b64_decode("not base64!").is_none());
    }
}

#[cfg(test)]
mod image_url_tests {
    use super::check_image_url;

    #[test]
    fn only_tradingview_snapshots() {
        assert!(check_image_url("https://s3.tradingview.com/snapshots/k/krNx1I9g.png").is_ok());
        assert!(check_image_url("https://s3.tradingview.com/snapshots/a/AbC123de.png").is_ok());
        for bad in [
            "http://s3.tradingview.com/snapshots/k/krNx1I9g.png",
            "https://s3.tradingview.com.evil.example/snapshots/k/krNx1I9g.png",
            "https://s3.tradingview.com@evil.example/snapshots/k/krNx1I9g.png",
            "https://www.tradingview.com/x/krNx1I9g/",
            "https://s3.tradingview.com/snapshots/k/krNx1I9g.png?x=1",
            "https://s3.tradingview.com/snapshots/kk/krNx1I9g.png",
            "https://s3.tradingview.com/snapshots/k/../krNx1I9g.png",
            "https://s3.tradingview.com/snapshots/k/sub/krNx1I9g.png",
            "https://s3.tradingview.com/snapshots/k/krNx1I9g.svg",
            "https://s3.tradingview.com/other/k/krNx1I9g.png",
        ] {
            assert!(check_image_url(bad).is_err(), "should refuse {bad}");
        }
    }
}

#[cfg(test)]
mod find_tests {
    use super::vaults_in;

    #[test]
    fn finds_journals_one_level_in_and_nothing_else() {
        let base = std::env::temp_dir().join(format!("laminar-find-{}", std::process::id()));
        let docs = base.join("Documents");
        for d in ["Ledger Vault/data", "Quire/data", "Photos", "Other"] {
            std::fs::create_dir_all(docs.join(d)).unwrap();
        }
        std::fs::write(docs.join("Ledger Vault").join("vault.json"), "{\"kind\":\"quire-vault\"}").unwrap();
        std::fs::write(docs.join("Quire").join("vault.json"), "{\"kind\":\"quire-vault\"}").unwrap();
        std::fs::write(docs.join("Other").join("vault.json"), "{\"kind\":\"something-else\"}").unwrap();
        let mut found = vaults_in(&[docs.clone(), docs.clone(), base.join("missing")]);
        found.sort();
        let names: Vec<String> = found
            .iter()
            .map(|f| std::path::Path::new(f).file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["Ledger Vault", "Quire"]);
        std::fs::remove_dir_all(&base).unwrap();
    }
}

#[cfg(test)]
mod write_tests {
    use super::write_text_now;

    #[test]
    fn writes_whole_and_keeps_the_one_before_as_bak() {
        let base = std::env::temp_dir().join(format!("laminar-write-{}", std::process::id()));
        let file = base.join("data").join("trades.json");
        let path = file.to_string_lossy().to_string();
        write_text_now(&path, "{\"v\":1}").unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "{\"v\":1}");
        assert!(!base.join("data").join("trades.json.bak").exists(), "nothing to keep the first time");
        write_text_now(&path, "{\"v\":2}").unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "{\"v\":2}");
        assert_eq!(std::fs::read_to_string(base.join("data").join("trades.json.bak")).unwrap(), "{\"v\":1}");
        assert!(!base.join("data").join("trades.json.tmp").exists(), "no half-file left behind");
        std::fs::remove_dir_all(&base).unwrap();
    }
}

#[cfg(test)]
mod rename_tests {
    use super::rename_dir_now as rename_dir;

    #[test]
    fn renames_a_folder_and_keeps_what_is_inside() {
        let base = std::env::temp_dir().join(format!("quire-rename-{}", std::process::id()));
        let from = base.join("Ledger");
        let to = base.join("Quire");
        std::fs::create_dir_all(from.join("data")).unwrap();
        std::fs::write(from.join("data").join("trades.json"), "{}").unwrap();
        rename_dir(&from.to_string_lossy(), &to.to_string_lossy()).unwrap();
        assert!(!from.exists());
        assert_eq!(std::fs::read_to_string(to.join("data").join("trades.json")).unwrap(), "{}");
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn never_overwrites_a_folder_already_there() {
        let base = std::env::temp_dir().join(format!("quire-rename-b-{}", std::process::id()));
        let from = base.join("Ledger");
        let to = base.join("Quire");
        std::fs::create_dir_all(&from).unwrap();
        std::fs::create_dir_all(&to).unwrap();
        assert!(rename_dir(&from.to_string_lossy(), &to.to_string_lossy()).is_err());
        assert!(from.exists() && to.exists());
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn refuses_something_that_is_not_a_folder() {
        let p = std::env::temp_dir().join(format!("quire-rename-c-{}", std::process::id()));
        assert!(rename_dir(&p.to_string_lossy(), &p.with_extension("x").to_string_lossy()).is_err());
    }
}

#[cfg(test)]
mod oanda_tests {
    use super::check_oanda_path;

    #[test]
    fn allows_a_candles_request() {
        assert!(check_oanda_path("/v3/instruments/XAU_USD/candles?granularity=M1&price=M&from=1757894400&to=1757980800").is_ok());
        assert!(check_oanda_path("/v3/instruments/NAS100_USD/candles?granularity=M1&from=2026-09-15T00%3A00%3A00Z").is_ok());
    }

    #[test]
    fn allows_reading_your_own_trades() {
        assert!(check_oanda_path("/v3/accounts").is_ok());
        assert!(check_oanda_path("/v3/accounts/101-011-1234567-001/summary").is_ok());
        assert!(check_oanda_path("/v3/accounts/101-011-1234567-001/trades?state=ALL&count=500").is_ok());
        assert!(check_oanda_path("/v3/accounts/101-011-1234567-001/trades?state=ALL&count=500&beforeID=1200").is_ok());
        assert!(check_oanda_path("/v3/accounts/101-011-1234567-001/transactions/idrange?from=1&to=1000").is_ok());
    }

    #[test]
    fn refuses_orders_and_anything_that_is_not_reading() {
        assert!(check_oanda_path("/v3/accounts/101-011-1234567-001/orders").is_err());
        assert!(check_oanda_path("/v3/accounts/101-011-1234567-001/trades/42/close").is_err());
        assert!(check_oanda_path("/v3/accounts/101-011-1234567-001/positions/EUR_USD/close").is_err());
        assert!(check_oanda_path("/v3/accounts/101-011-1234567-001/trades").is_err());
        assert!(check_oanda_path("/v3/accounts/../instruments/summary").is_err());
        assert!(check_oanda_path("/v3/accounts/101-011/summary?x=1").is_err());
        assert!(check_oanda_path("/v3/accounts/101-011/trades?state=ALL#x").is_err());
        assert!(check_oanda_path("/v3/accounts/").is_err());
    }

    #[test]
    fn refuses_anything_else() {
        assert!(check_oanda_path("/v3/accountsX").is_err());
        assert!(check_oanda_path("/v3/instruments/XAU_USD/orderBook?x=1").is_err());
        assert!(check_oanda_path("/v3/instruments/../accounts/candles?x=1").is_err());
        assert!(check_oanda_path("/v3/instruments/XAU_USD/candles?x=1#frag").is_err());
        assert!(check_oanda_path("/v3/instruments/xau_usd/candles?x=1").is_err());
        assert!(check_oanda_path("https://evil.example/v3/instruments/X/candles?x=1").is_err());
    }
}
