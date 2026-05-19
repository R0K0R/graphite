//! Loopback HTTP server with `/lsp/:language` WebSocket relay to language servers over stdio.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::Deserialize;
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tracing::{error, info};

const DEFAULT_REGISTRY_YAML: &str = r#"
languages:
  typescript:
    command: typescript-language-server
    args:
      - "--stdio"
  javascript:
    command: typescript-language-server
    args:
      - "--stdio"
  rust:
    command: rust-analyzer
    args: []
"#;

#[derive(Debug, Clone, Deserialize)]
struct RegistryFile {
    languages: HashMap<String, LanguageSpec>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct LanguageSpec {
    command: String,
    #[serde(default)]
    args: Vec<String>,
}

#[derive(Clone)]
pub struct LspHostState {
    inner: Arc<LspHostInner>,
}

pub(crate) struct LspHostInner {
    bind_addr: Mutex<Option<String>>,
    pub(crate) project_root: Mutex<Option<PathBuf>>,
    started: AtomicBool,
}

impl LspHostState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(LspHostInner {
                bind_addr: Mutex::new(None),
                project_root: Mutex::new(None),
                started: AtomicBool::new(false),
            }),
        }
    }

    pub fn listen_base_url(&self) -> Option<String> {
        self.inner.bind_addr.lock().ok()?.clone()
    }

    pub fn set_project_root(&self, root: Option<PathBuf>) {
        if let Ok(mut g) = self.inner.project_root.lock() {
            *g = root;
        }
    }

    pub(crate) fn merged_registry(project_root: Option<&std::path::Path>) -> HashMap<String, LanguageSpec> {
        let mut map = parse_registry_yaml(DEFAULT_REGISTRY_YAML).languages;

        if let Some(root) = project_root {
            let path = PathBuf::from(root).join(".graphite/lsp.yaml");
            if path.exists() {
                if let Ok(raw) = fs::read_to_string(&path) {
                    if let Ok(extra) = serde_yaml::from_str::<RegistryFile>(&raw) {
                        map.extend(extra.languages);
                    }
                }
            }
        }

        map
    }

    /// Starts Axum exactly once (loopback).
    pub fn ensure_started(&self) {
        if self
            .inner
            .started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        let inner = Arc::clone(&self.inner);

        tauri::async_runtime::spawn(async move {
            let listener = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
                Ok(l) => l,
                Err(e) => {
                    error!("lsp bind failed: {e}");
                    return;
                }
            };

            let addr = match listener.local_addr() {
                Ok(a) => a,
                Err(e) => {
                    error!("local_addr failed: {e}");
                    return;
                }
            };

            let url = format!("http://127.0.0.1:{}/", addr.port());
            info!("LSP relay listening on {url}");

            if let Ok(mut g) = inner.bind_addr.lock() {
                *g = Some(url.clone());
            }

            let state = RelayAppState { inner: Arc::clone(&inner) };

            let app = Router::new()
                .route("/health", get(|| async { "ok" }))
                .route("/lsp/:language", get(ws_upgrade))
                .with_state(state);

            if let Err(e) = axum::serve(listener, app.into_make_service()).await {
                error!("axum serve ended: {e}");
            }
        });
    }
}

#[derive(Clone)]
struct RelayAppState {
    inner: Arc<LspHostInner>,
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    Path(language): Path<String>,
    State(state): State<RelayAppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, language, state))
}

async fn handle_socket(mut socket: WebSocket, language: String, state: RelayAppState) {
    let project_root = state
        .inner
        .project_root
        .lock()
        .ok()
        .and_then(|g| g.clone());

    let registry = LspHostState::merged_registry(project_root.as_deref());

    let spec = match registry.get(&language) {
        Some(s) => s.clone(),
        None => {
            error!("unknown language server key: {language}");
            let _ = socket.close().await;
            return;
        }
    };

    let mut child = match tokio::process::Command::new(&spec.command)
        .args(&spec.args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            error!("spawn `{}`: {e}", spec.command);
            let _ = socket.close().await;
            return;
        }
    };

    let mut stdin = match child.stdin.take() {
        Some(s) => s,
        None => {
            error!("no stdin");
            return;
        }
    };

    let mut stdout = match child.stdout.take() {
        Some(s) => s,
        None => {
            error!("no stdout");
            return;
        }
    };

    let (mut ws_sink, mut ws_stream) = socket.split();

    let stdout_task = tokio::spawn(async move {
        let mut buf: Vec<u8> = Vec::with_capacity(8192);
        loop {
            match read_lsp_frame(&mut stdout, &mut buf).await {
                Ok(Some(body)) => {
                    let text = match String::from_utf8(body) {
                        Ok(t) => t,
                        Err(_) => continue,
                    };
                    if ws_sink.send(Message::text(text)).await.is_err() {
                        break;
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    error!("read_lsp_frame: {e}");
                    break;
                }
            }
        }
    });

    while let Some(msg) = ws_stream.next().await {
        match msg {
            Ok(Message::Text(t)) => {
                if write_lsp_frame(&mut stdin, t.as_bytes()).await.is_err() {
                    break;
                }
            }
            Ok(Message::Binary(b)) => {
                if write_lsp_frame(&mut stdin, &b).await.is_err() {
                    break;
                }
            }
            Ok(Message::Ping(_) | Message::Pong(_) | Message::Close(_)) => {}
            Err(e) => {
                error!("ws read: {e}");
                break;
            }
        }
    }

    drop(stdin);
    let _ = child.kill().await;
    stdout_task.abort();
}

async fn write_lsp_frame<W: AsyncWriteExt + Unpin>(
    writer: &mut W,
    body: &[u8],
) -> Result<(), std::io::Error> {
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    writer.write_all(header.as_bytes()).await?;
    writer.write_all(body).await?;
    writer.flush().await?;
    Ok(())
}

async fn read_lsp_frame<R: AsyncReadExt + Unpin>(
    reader: &mut R,
    buf: &mut Vec<u8>,
) -> Result<Option<Vec<u8>>, std::io::Error> {
    loop {
        if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            let header_bytes = buf[..pos].to_vec();
            let headers_str = String::from_utf8_lossy(&header_bytes);
            buf.drain(..pos + 4);

            let mut content_length: Option<usize> = None;
            for line in headers_str.lines() {
                let lower = line.to_ascii_lowercase();
                if let Some(rest) = lower.strip_prefix("content-length:") {
                    content_length = rest.trim().parse().ok();
                }
            }

            let Some(len) = content_length else {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "missing Content-Length header",
                ));
            };

            while buf.len() < len {
                let mut chunk = [0u8; 8192];
                let n = reader.read(&mut chunk).await?;
                if n == 0 {
                    return Ok(None);
                }
                buf.extend_from_slice(&chunk[..n]);
            }

            let body: Vec<u8> = buf.drain(..len).collect();
            return Ok(Some(body));
        }

        let mut chunk = [0u8; 8192];
        let n = reader.read(&mut chunk).await?;
        if n == 0 {
            return Ok(None);
        }
        buf.extend_from_slice(&chunk[..n]);
    }
}

fn parse_registry_yaml(raw: &str) -> RegistryFile {
    serde_yaml::from_str(raw).unwrap_or_else(|_| RegistryFile {
        languages: HashMap::new(),
    })
}
