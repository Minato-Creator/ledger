// Prevents a console window appearing behind the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/* ============================================================
   Ledger — the native shell.

   Four file commands and two path commands, and that is the whole backend.
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_text,
            make_dir,
            path_exists,
            path_sep,
            config_dir,
            default_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ledger");
}

fn main() {
    run();
}
