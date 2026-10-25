//! External editors: which ones are installed, and opening a path in one.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize)]
pub struct Editor {
    /// What `open_in_editor` takes: the app name on macOS, the command elsewhere.
    pub id: String,
    pub name: String,
}

/// (display name, macOS app name, command on PATH)
const EDITORS: &[(&str, &str, &str)] = &[
    ("Visual Studio Code", "Visual Studio Code", "code"),
    ("Cursor", "Cursor", "cursor"),
    ("Windsurf", "Windsurf", "windsurf"),
    ("Zed", "Zed", "zed"),
    ("Sublime Text", "Sublime Text", "subl"),
    ("Nova", "Nova", "nova"),
    ("BBEdit", "BBEdit", "bbedit"),
    ("WebStorm", "WebStorm", "webstorm"),
    ("IntelliJ IDEA", "IntelliJ IDEA", "idea"),
    ("Xcode", "Xcode", "xed"),
];

fn on_path(cmd: &str) -> bool {
    crate::search_path()
        .split(':')
        .any(|dir| Path::new(dir).join(cmd).is_file())
}

/// The editors from the list that are installed here.
pub fn installed() -> Vec<Editor> {
    let home = std::env::var("HOME").unwrap_or_default();
    EDITORS
        .iter()
        .filter_map(|&(name, app, cmd)| {
            if cfg!(target_os = "macos") {
                let bundle = format!("{app}.app");
                let found = Path::new("/Applications").join(&bundle).exists()
                    || Path::new(&home).join("Applications").join(&bundle).exists();
                found.then(|| Editor {
                    id: app.into(),
                    name: name.into(),
                })
            } else {
                on_path(cmd).then(|| Editor {
                    id: cmd.into(),
                    name: name.into(),
                })
            }
        })
        .collect()
}

#[tauri::command]
pub async fn editors() -> Vec<Editor> {
    tauri::async_runtime::spawn_blocking(installed)
        .await
        .unwrap_or_default()
}

/// Opens a file or folder in `editor` (an id from `editors`), or with the
/// system's default app when it is empty.
#[tauri::command]
pub fn open_in_editor(editor: String, path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err(format!("{path} does not exist"));
    }
    let mut cmd = if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        if !editor.is_empty() {
            c.args(["-a", &editor]);
        }
        c.arg(&path);
        c
    } else if editor.is_empty() {
        return crate::open_with(&[&path]);
    } else if EDITORS.iter().any(|&(_, _, c)| c == editor) {
        let mut c = Command::new(&editor);
        c.arg(&path).env("PATH", crate::search_path());
        c
    } else {
        return Err(format!("unknown editor {editor}"));
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn lists_without_duplicates() {
        let all = super::installed();
        let mut ids: Vec<_> = all.iter().map(|e| e.id.clone()).collect();
        ids.dedup();
        assert_eq!(ids.len(), all.len());
    }
}
