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
   ============================================================ */

use std::path::{Path, PathBuf};
use tauri::Manager;

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

/// Writes a file, creating the folders above it first. Journal files are
/// small, so this is a plain whole-file write — no partial states to reason
/// about.
#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("{path}: {e}"))
}

/* Screenshots. They cross the bridge as base64 because that is what a JSON
   IPC call can carry, and land as real image files you can open from the
   folder — the point of keeping the journal as files at all. */
#[tauri::command]
fn read_image(path: String) -> Result<Option<String>, String> {
    match std::fs::read(&path) {
        Ok(bytes) => Ok(Some(b64_encode(&bytes))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{path}: {e}")),
    }
}

#[tauri::command]
fn write_image(path: String, data: String) -> Result<(), String> {
    let bytes = b64_decode(&data).ok_or_else(|| format!("{path}: not valid base64"))?;
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    std::fs::write(&path, bytes).map_err(|e| format!("{path}: {e}"))
}

/// Show a folder in the operating system's own file manager. Every platform
/// spells this differently and none of them need a crate for it.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let program = if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(program)
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("{path}: {e}"))
}

/// Removing one file. Already gone counts as done.
#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("{path}: {e}")),
    }
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
fn make_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Renames a folder where it stands. Used once: a journal folder made while
/// the app was still called Ledger becomes "Quire". It never overwrites — if
/// the new name is taken, nothing happens and the old folder is kept.
#[tauri::command]
fn rename_dir(from: String, to: String) -> Result<(), String> {
    let (f, t) = (Path::new(&from), Path::new(&to));
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
    const ALLOWED: [&str; 2] = ["nfs.faireconomy.media", "investinglive.com"];

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

/// The path of an OANDA candles request, checked before anything is sent:
/// one instrument, the candles endpoint, and a plain query string. The host is
/// never taken from the page — it is one of OANDA's two, chosen here.
fn check_oanda_path(path: &str) -> Result<(), String> {
    let rest = path.strip_prefix("/v3/instruments/").ok_or("not a candles request")?;
    let (inst, query) = rest.split_once("/candles?").ok_or("not a candles request")?;
    if inst.is_empty() || inst.len() > 20 || !inst.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_') {
        return Err("that is not an instrument name".into());
    }
    if query.is_empty() || !query.chars().all(|c| c.is_ascii_alphanumeric() || "=&:._-%".contains(c)) {
        return Err("that query has characters it should not".into());
    }
    Ok(())
}

/// Candles from OANDA, with your own key. The key goes in the Authorization
/// header and nowhere else, and only to OANDA's practice or live API.
#[tauri::command]
fn fetch_oanda(path: String, token: String, live: bool) -> Result<String, String> {
    check_oanda_path(&path)?;
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
fn fetch_text(url: String) -> Result<String, String> {
    check_url(&url)?;

    let res = ureq::get(&url)
        .timeout(std::time::Duration::from_secs(20))
        .set("User-Agent", "Laminar")
        .call()
        .map_err(|e| e.to_string())?;

    res.into_string().map_err(|e| e.to_string())
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
            fetch_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running Laminar");
}

/* Base64 written by hand is base64 worth testing. A bug here would not throw;
   it would quietly corrupt every screenshot the desktop app ever saved. */
#[cfg(test)]
mod url_tests {
    use super::check_url;

    #[test]
    fn allows_the_named_hosts_over_https() {
        assert!(check_url("https://nfs.faireconomy.media/ff_calendar_thisweek.json").is_ok());
        assert!(check_url("https://nfs.faireconomy.media/anything?x=1#y").is_ok());
        assert!(check_url("https://investinglive.com/feed/").is_ok());
        assert!(check_url("https://investinglive.com/feed/centralbank/").is_ok());
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
mod rename_tests {
    use super::rename_dir;

    #[test]
    fn renames_a_folder_and_keeps_what_is_inside() {
        let base = std::env::temp_dir().join(format!("quire-rename-{}", std::process::id()));
        let from = base.join("Ledger");
        let to = base.join("Quire");
        std::fs::create_dir_all(from.join("data")).unwrap();
        std::fs::write(from.join("data").join("trades.json"), "{}").unwrap();
        rename_dir(from.to_string_lossy().into(), to.to_string_lossy().into()).unwrap();
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
        assert!(rename_dir(from.to_string_lossy().into(), to.to_string_lossy().into()).is_err());
        assert!(from.exists() && to.exists());
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn refuses_something_that_is_not_a_folder() {
        let p = std::env::temp_dir().join(format!("quire-rename-c-{}", std::process::id()));
        assert!(rename_dir(p.to_string_lossy().into(), p.with_extension("x").to_string_lossy().into()).is_err());
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
    fn refuses_anything_else() {
        assert!(check_oanda_path("/v3/accounts").is_err());
        assert!(check_oanda_path("/v3/instruments/XAU_USD/orderBook?x=1").is_err());
        assert!(check_oanda_path("/v3/instruments/../accounts/candles?x=1").is_err());
        assert!(check_oanda_path("/v3/instruments/XAU_USD/candles?x=1#frag").is_err());
        assert!(check_oanda_path("/v3/instruments/xau_usd/candles?x=1").is_err());
        assert!(check_oanda_path("https://evil.example/v3/instruments/X/candles?x=1").is_err());
    }
}
