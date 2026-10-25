//! Finding repositories already on disk: walk a few folders a few levels
//! deep and report every directory that has a `.git` (folder or file).

use std::path::{Path, PathBuf};

/// Folders that never hold a user's own repositories but can be huge.
const SKIP: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "vendor",
    "Pods",
    "DerivedData",
    "Library",
    ".Trash",
    ".cache",
    ".npm",
    ".pnpm-store",
    ".cargo",
    ".rustup",
];

/// `~/Code` → `/Users/me/Code`.
pub fn expand(path: &str) -> PathBuf {
    match path.strip_prefix("~") {
        Some(rest) => PathBuf::from(std::env::var("HOME").unwrap_or_default())
            .join(rest.trim_start_matches('/')),
        None => PathBuf::from(path),
    }
}

fn walk(dir: &Path, depth: u8, out: &mut Vec<String>) {
    if dir.join(".git").exists() {
        out.push(dir.to_string_lossy().into_owned());
        return; // a repository's own folders are not separate repositories
    }
    if depth == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .filter(|p| {
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            !name.starts_with('.') && !SKIP.contains(&name.as_str())
        })
        .collect();
    dirs.sort();
    for d in dirs {
        walk(&d, depth - 1, out);
    }
}

/// Every repository under `roots`, at most `depth` folders down.
#[tauri::command]
pub async fn scan_repos(roots: Vec<String>, depth: u8) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        for root in roots {
            walk(&expand(&root), depth.min(5), &mut out);
        }
        out.sort_by_key(|p| p.to_lowercase());
        out.dedup();
        out
    })
    .await
    .unwrap_or_default()
}

/// The usual places people keep code that exist on this machine and hold at least one repository.
#[tauri::command]
pub async fn suggest_repo_folders() -> Vec<String> {
    const CANDIDATES: &[&str] = &[
        "~/Code",
        "~/code",
        "~/Developer",
        "~/Projects",
        "~/projects",
        "~/src",
        "~/dev",
        "~/repos",
        "~/git",
        "~/GitHub",
        "~/Documents/GitHub",
        "~/Documents/Code",
        "~/Downloads/Code",
        "~/Desktop/Code",
        "~/workspace",
        "~/Workspace",
    ];
    tauri::async_runtime::spawn_blocking(|| {
        CANDIDATES
            .iter()
            .filter(|c| {
                let p = expand(c);
                let mut found = Vec::new();
                p.is_dir() && {
                    walk(&p, 3, &mut found);
                    !found.is_empty()
                }
            })
            .map(|c| c.to_string())
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_repos_and_stops_inside_them() {
        let base = std::env::temp_dir().join(format!("gg-scan-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        for p in [
            "a/.git",
            "a/sub/.git",
            "group/b/.git",
            "node_modules/c/.git",
            ".hidden/d/.git",
            "deep/1/2/3/e/.git",
        ] {
            std::fs::create_dir_all(base.join(p)).unwrap();
        }
        let mut out = Vec::new();
        walk(&base, 3, &mut out);
        let names: Vec<String> = out
            .iter()
            .map(|p| p.trim_start_matches(base.to_str().unwrap()).to_string())
            .collect();
        assert_eq!(names, vec!["/a", "/group/b"]);
        std::fs::remove_dir_all(&base).unwrap();
    }
}
