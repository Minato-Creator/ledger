// Prevents a console window appearing behind the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/* ============================================================
   Ledger — the native shell.

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

/// First run, no questions asked: Documents/Ledger. Somewhere you can find
/// it, back it up, and open the files yourself.
#[tauri::command]
fn default_folder(app: tauri::AppHandle) -> Result<String, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;
    Ok(base.join("Ledger").to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_text,
            read_image,
            write_image,
            delete_path,
            open_path,
            make_dir,
            path_exists,
            path_sep,
            config_dir,
            default_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ledger");
}

/* Base64 written by hand is base64 worth testing. A bug here would not throw;
   it would quietly corrupt every screenshot the desktop app ever saved. */
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
