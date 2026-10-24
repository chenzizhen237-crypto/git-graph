//! The native side of Git Graph: run `git` and the GitHub CLI `gh`, watch a
//! repository for changes, and hand paths to the OS. Everything else lives in
//! the web view.

use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize)]
pub struct GitOutput {
    stdout: String,
    stderr: String,
    code: i32,
}

/// Apps started from Finder get a bare PATH; add the usual install places so
/// Homebrew's git, `gh`, credential helpers and hooks are found.
fn search_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let local = format!("{home}/.local/bin");
    let extra = ["/opt/homebrew/bin", "/usr/local/bin", local.as_str(), "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
    let current = std::env::var("PATH").unwrap_or_default();
    let mut parts: Vec<&str> = current.split(':').filter(|p| !p.is_empty()).collect();
    for p in extra {
        if !parts.contains(&p) {
            parts.push(p);
        }
    }
    parts.join(":")
}

fn find_binary(name: &str) -> PathBuf {
    for dir in search_path().split(':') {
        let candidate = Path::new(dir).join(name);
        if candidate.is_file() {
            return candidate;
        }
    }
    PathBuf::from(name)
}

fn git_binary() -> &'static PathBuf {
    static GIT: OnceLock<PathBuf> = OnceLock::new();
    GIT.get_or_init(|| find_binary("git"))
}

fn gh_binary() -> &'static PathBuf {
    static GH: OnceLock<PathBuf> = OnceLock::new();
    GH.get_or_init(|| find_binary("gh"))
}

/// Spawns a tool with the app's environment, feeds `stdin`, collects output.
fn run_tool(mut cmd: Command, name: &str, stdin: Option<&str>) -> Result<GitOutput, String> {
    cmd.env("PATH", search_path())
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("LANG", "en_US.UTF-8")
        .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("could not start {name}: {e}"))?;
    if let Some(input) = stdin {
        use std::io::Write;
        if let Some(mut pipe) = child.stdin.take() {
            pipe.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
        }
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(GitOutput {
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        code: out.status.code().unwrap_or(-1),
    })
}

fn run_git(repo: &str, args: &[String], stdin: Option<&str>) -> Result<GitOutput, String> {
    let mut cmd = Command::new(git_binary());
    cmd.arg("-C")
        .arg(repo)
        .args(["-c", "color.ui=false", "-c", "core.quotepath=false"])
        .args(args)
        .env("GIT_OPTIONAL_LOCKS", "0");
    run_tool(cmd, "git", stdin)
}

/// Runs the GitHub CLI in `repo`, never prompting. Only gh is ever spawned.
#[tauri::command]
async fn gh(repo: String, args: Vec<String>, stdin: Option<String>) -> Result<GitOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(gh_binary());
        cmd.current_dir(&repo)
            .args(&args)
            .env("GH_PROMPT_DISABLED", "1")
            .env("GH_NO_UPDATE_NOTIFIER", "1")
            .env("NO_COLOR", "1");
        run_tool(cmd, "gh", stdin.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Opens a web page (a pull request, a check run) in the default browser.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("only https links open".into());
    }
    open_with(&[&url])
}

/// Runs `git -C <repo> <args…>`. Only git is ever spawned.
#[tauri::command]
async fn git(repo: String, args: Vec<String>, stdin: Option<String>) -> Result<GitOutput, String> {
    tauri::async_runtime::spawn_blocking(move || run_git(&repo, &args, stdin.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

/// Reads a small state file from the repository's git dir, such as
/// `rebase-merge/msgnum`. `name` is resolved by git, so it cannot escape it.
#[tauri::command]
async fn read_git_file(repo: String, name: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if name.contains("..") {
            return Err("invalid name".into());
        }
        let out = run_git(&repo, &["rev-parse".into(), "--git-path".into(), name], None)?;
        let path = Path::new(&repo).join(out.stdout.trim());
        Ok(std::fs::read_to_string(path).ok())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Default)]
struct WatchState(Mutex<Option<notify::RecommendedWatcher>>);

/// Noise that changes on every git command and says nothing about the repo.
fn is_noise(path: &Path) -> bool {
    let s = path.to_string_lossy();
    s.contains("/.git/objects/")
        || s.ends_with(".lock")
        || s.contains("/node_modules/")
        || s.contains("/target/")
        || s.ends_with("/.git/FETCH_HEAD")
}

/// Watches the work tree and `.git`, and emits `repo-changed` once things settle.
#[tauri::command]
fn watch_repo(app: AppHandle, state: State<WatchState>, repo: String) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<()>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            if ev.paths.iter().any(|p| !is_noise(p)) {
                let _ = tx.send(());
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(Path::new(&repo), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let emit_repo = repo.clone();
    std::thread::spawn(move || {
        // Debounce: wait for a quiet 250ms after the first event, then emit once.
        while rx.recv().is_ok() {
            while rx.recv_timeout(Duration::from_millis(250)).is_ok() {}
            if app.emit("repo-changed", &emit_repo).is_err() {
                break;
            }
        }
    });
    // Replacing the old watcher drops it, which closes its channel and ends its thread.
    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}

fn open_with(args: &[&str]) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(all(unix, not(target_os = "macos")))]
    let program = "xdg-open";
    Command::new(program).args(args).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_terminal(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return open_with(&["-a", "Terminal", &path]);
    #[cfg(not(target_os = "macos"))]
    return open_with(&[&path]);
}

#[tauri::command]
fn reveal(path: String) -> Result<(), String> {
    open_with(&[&path])
}

/// The repository passed on the command line: `git-graph ~/code/project`.
#[tauri::command]
fn initial_repo() -> Option<String> {
    let arg = std::env::args().skip(1).find(|a| !a.starts_with('-'))?;
    std::fs::canonicalize(&arg).ok().map(|p| p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WatchState::default())
        .invoke_handler(tauri::generate_handler![git, gh, open_url, read_git_file, watch_repo, open_terminal, reveal, initial_repo])
        .run(tauri::generate_context!())
        .expect("error while running Git Graph");
}
