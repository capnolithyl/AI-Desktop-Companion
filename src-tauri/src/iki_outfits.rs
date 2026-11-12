//! Owner-initiated native file picker for local Iki outfits.
//! No general filesystem API is exposed to the webview. A selected .iki file
//! is copied into IndexedDB, so changing outfits later never needs disk access.
use serde::Serialize;
use std::path::{Path, PathBuf};

const MAX_IKI_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedIkiOutfit {
    name: String,
    folder: String,
    content: String,
}

fn starting_folder(preferred: Option<String>) -> Option<PathBuf> {
    // The last selected folder wins, but gracefully recover if the directory
    // was moved or the H: drive is temporarily unavailable.
    if let Some(path) = preferred {
        let path = PathBuf::from(path);
        if path.is_dir() { return Some(path); }
    }
    // During development, use the checkout's outfit directory if present.
    if let Ok(cwd) = std::env::current_dir() {
        for root in cwd.ancestors().take(6) {
            let path = root.join("assets/iki/mikan-v02/outfits");
            if path.is_dir() { return Some(path); }
        }
    }
    // Personal Windows setup documented alongside Mikan's original PSD.
    let original_checkout = PathBuf::from(
        r"H:\_FunProjects\AI-Desktop-Companion\AI-Desktop-Companion\assets\iki\mikan-v02\outfits"
    );
    if original_checkout.is_dir() { return Some(original_checkout); }
    None
}

fn selected_file(path: &Path) -> Result<PickedIkiOutfit, String> {
    if !path.extension().is_some_and(|ext| ext.to_string_lossy().eq_ignore_ascii_case("iki")) {
        return Err("Select a .iki character file.".to_string());
    }
    let size = std::fs::metadata(path)
        .map_err(|e| format!("Could not inspect outfit: {e}"))?.len();
    if !(2..=MAX_IKI_BYTES).contains(&size) {
        return Err("Choose an .iki file smaller than 25 MB.".into());
    }
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Could not read selected outfit: {e}"))?;
    let name = path.file_name()
        .ok_or_else(|| "The outfit file has no filename.".to_string())?
        .to_string_lossy().to_string();
    let folder = path.parent().unwrap_or(Path::new(""))
        .to_string_lossy().to_string();
    Ok(PickedIkiOutfit { name, folder, content })
}

#[tauri::command]
pub async fn pick_iki_outfit(folder: Option<String>) -> Result<Option<PickedIkiOutfit>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut picker = rfd::FileDialog::new()
            .set_title("Choose a Mikan outfit (.iki)")
            .add_filter("Iki character rig", &["iki"]);
        if let Some(folder) = starting_folder(folder) {
            picker = picker.set_directory(folder);
        }
        match picker.pick_file() {
            Some(path) => selected_file(&path).map(Some),
            None => Ok(None),
        }
    }).await.map_err(|e| format!("The outfit file picker failed: {e}"))?
}

#[tauri::command]
pub async fn pick_iki_outfit_folder(folder: Option<String>) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut picker = rfd::FileDialog::new().set_title("Choose Mikan's outfits folder");
        if let Some(folder) = starting_folder(folder) {
            picker = picker.set_directory(folder);
        }
        picker.pick_folder().map(|path| path.to_string_lossy().to_string())
    }).await.map_err(|e| format!("The outfit folder picker failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_default_folder_does_not_crash() {
        let _ = starting_folder(Some("Z:/Mikan/this-is-not-a-real-outfits-folder".into()));
    }
    #[test]
    fn ignores_non_iki_files_before_reading_contents() {
        assert!(selected_file(Path::new("not-an-outfit.txt")).is_err());
    }
}
