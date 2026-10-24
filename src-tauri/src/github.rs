//! GitHub reads over one kept-alive HTTPS client. The token comes from the
//! GitHub CLI (`gh auth token`) or GH_TOKEN / GITHUB_TOKEN and never leaves
//! this process; the web view only sends queries and gets JSON back.

use serde_json::Value;
use std::process::Command;
use std::sync::Mutex;
use tauri::State;

pub struct GitHub {
    client: Mutex<reqwest::Client>,
    token: Mutex<Option<String>>,
}

/// A client for the current proxy settings: none, the system's, or a custom URL.
fn build_client(net: &crate::Network) -> Result<reqwest::Client, String> {
    let mut b = reqwest::Client::builder()
        .user_agent(concat!("git-graph/", env!("CARGO_PKG_VERSION")))
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .connect_timeout(std::time::Duration::from_secs(15));
    match (net.github, net.mode.as_str()) {
        (true, "custom") if !net.url.is_empty() => {
            let proxy = reqwest::Proxy::all(&net.url)
                .map_err(|e| format!("Invalid proxy address: {e}"))?
                .no_proxy(reqwest::NoProxy::from_string(&net.bypass));
            b = b.proxy(proxy);
        }
        (true, "system") => {}
        _ => b = b.no_proxy(),
    }
    b.build().map_err(|e| e.to_string())
}

impl Default for GitHub {
    fn default() -> Self {
        let client = build_client(&crate::Network::default()).expect("http client");
        Self {
            client: Mutex::new(client),
            token: Mutex::new(None),
        }
    }
}

const API: &str = "https://api.github.com";

impl GitHub {
    fn client(&self) -> reqwest::Client {
        self.client.lock().map(|c| c.clone()).unwrap_or_default()
    }

    pub fn apply(&self, net: &crate::Network) -> Result<(), String> {
        *self.client.lock().map_err(|e| e.to_string())? = build_client(net)?;
        Ok(())
    }

    fn token(&self) -> Result<String, String> {
        if let Some(t) = self.token.lock().map_err(|e| e.to_string())?.clone() {
            return Ok(t);
        }
        let t = std::env::var("GH_TOKEN")
            .or_else(|_| std::env::var("GITHUB_TOKEN"))
            .ok()
            .filter(|t| !t.is_empty())
            .map(Ok)
            .unwrap_or_else(|| {
                let mut cmd = Command::new(crate::gh_binary());
                cmd.args(["auth", "token"])
                    .env("PATH", crate::search_path());
                crate::proxy_env(&mut cmd, crate::Tool::Gh);
                let out = cmd
                    .output()
                    .map_err(|e| format!("could not start gh: {e}"))?;
                let t = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if t.is_empty() {
                    Err("Not signed in to GitHub. Run `gh auth login` in a terminal.".to_string())
                } else {
                    Ok(t)
                }
            })?;
        *self.token.lock().map_err(|e| e.to_string())? = Some(t.clone());
        Ok(t)
    }

    /// Sends a request, retrying once with a fresh token if GitHub says 401.
    async fn send(
        &self,
        build: impl Fn(&str) -> reqwest::RequestBuilder,
    ) -> Result<reqwest::Response, String> {
        for attempt in 0..2 {
            let res = build(&self.token()?)
                .send()
                .await
                .map_err(|e| format!("GitHub request failed: {e}"))?;
            if res.status() == reqwest::StatusCode::UNAUTHORIZED && attempt == 0 {
                *self.token.lock().map_err(|e| e.to_string())? = None;
                continue;
            }
            if !res.status().is_success() {
                let status = res.status();
                let body = res.text().await.unwrap_or_default();
                let msg = serde_json::from_str::<Value>(&body)
                    .ok()
                    .and_then(|v| v["message"].as_str().map(str::to_string))
                    .unwrap_or(body);
                return Err(format!("GitHub {status}: {msg}"));
            }
            return Ok(res);
        }
        Err("GitHub rejected the token".into())
    }
}

#[tauri::command]
pub async fn github_graphql(
    gh: State<'_, GitHub>,
    query: String,
    variables: Value,
) -> Result<Value, String> {
    let body = serde_json::json!({ "query": query, "variables": variables });
    let res = gh
        .send(|t| {
            gh.client()
                .post(format!("{API}/graphql"))
                .bearer_auth(t)
                .json(&body)
        })
        .await?;
    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    if let Some(errors) = v["errors"].as_array().filter(|e| !e.is_empty()) {
        let msg: Vec<&str> = errors
            .iter()
            .filter_map(|e| e["message"].as_str())
            .collect();
        return Err(msg.join("; "));
    }
    Ok(v["data"].clone())
}

/// A REST GET under api.github.com, e.g. a pull request as a unified diff.
#[tauri::command]
pub async fn github_rest(
    gh: State<'_, GitHub>,
    path: String,
    accept: Option<String>,
) -> Result<String, String> {
    if !path.starts_with('/') || path.contains("..") {
        return Err("invalid path".into());
    }
    let accept = accept.unwrap_or_else(|| "application/vnd.github+json".into());
    let res = gh
        .send(|t| {
            gh.client()
                .get(format!("{API}{path}"))
                .bearer_auth(t)
                .header("Accept", &accept)
        })
        .await?;
    res.text().await.map_err(|e| e.to_string())
}

/// How long api.github.com takes to answer through the current settings.
#[tauri::command]
pub async fn test_github(gh: State<'_, GitHub>) -> Result<u64, String> {
    let start = std::time::Instant::now();
    let res = gh
        .client()
        .get(format!("{API}/zen"))
        .send()
        .await
        .map_err(|e| format!("Could not reach GitHub: {e}"))?;
    if !res.status().is_success() && res.status() != reqwest::StatusCode::FORBIDDEN {
        return Err(format!("GitHub answered {}", res.status()));
    }
    Ok(start.elapsed().as_millis() as u64)
}
