//! Project filesystem model and `.graphite.json` metadata.

use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
use walkdir::WalkDir;

use crate::path_util::{normalize_rel, resolve_under_root};

const METADATA_FILE: &str = ".graphite.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasNode {
    pub id: String,
    pub kind: NodeKind,
    /// Relative POSIX-ish path (`foo/bar.rs`).
    pub path: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default)]
    pub expanded: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    File,
    Folder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphiteMetadata {
    pub version: u32,
    pub nodes: Vec<CanvasNode>,
}

impl Default for GraphiteMetadata {
    fn default() -> Self {
        Self {
            version: 1,
            nodes: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub path: String,
    pub kind: NodeKind,
}

pub struct OpenProject {
    pub root: PathBuf,
    pub metadata: GraphiteMetadata,
}

impl OpenProject {
    pub fn metadata_path(&self) -> PathBuf {
        self.root.join(METADATA_FILE)
    }

    pub fn load_or_default(root: PathBuf) -> Result<Self, String> {
        let metadata_path = root.join(METADATA_FILE);
        let metadata = if metadata_path.exists() {
            let raw =
                fs::read_to_string(&metadata_path).map_err(|e| format!("read metadata: {e}"))?;
            serde_json::from_str(&raw).map_err(|e| format!("parse metadata: {e}"))?
        } else {
            GraphiteMetadata::default()
        };
        Ok(Self { root, metadata })
    }

    pub fn save_metadata(&mut self, meta: GraphiteMetadata) -> Result<(), String> {
        self.metadata = meta;
        let raw = serde_json::to_string_pretty(&self.metadata)
            .map_err(|e| format!("serialize metadata: {e}"))?;
        fs::write(self.metadata_path(), raw).map_err(|e| format!("write metadata: {e}"))
    }

    pub fn sync_tree(&self) -> Result<Vec<FsEntry>, String> {
        let root_canon =
            fs::canonicalize(&self.root).map_err(|e| format!("canonicalize root: {e}"))?;

        let mut out = Vec::new();
        let walker = WalkDir::new(&root_canon).follow_links(false).into_iter();

        for entry in walker.filter_entry(|e| !should_skip_dir(e.path())) {
            let entry = entry.map_err(|e| format!("walk: {e}"))?;
            let path = entry.path();
            if path == root_canon {
                continue;
            }

            let rel = path.strip_prefix(&root_canon).map_err(|_| "strip prefix failed")?;
            let rel_str = path_to_posix(rel);

            let kind = if entry.file_type().is_dir() {
                NodeKind::Folder
            } else if entry.file_type().is_file() {
                NodeKind::File
            } else {
                continue;
            };

            out.push(FsEntry {
                path: rel_str,
                kind,
            });
        }

        Ok(out)
    }

    pub fn read_file(&self, rel: &str) -> Result<String, String> {
        let abs = resolve_under_root(&self.root, rel)?;
        fs::read_to_string(&abs).map_err(|e| format!("read file: {e}"))
    }

    pub fn write_file(&self, rel: &str, contents: &str) -> Result<(), String> {
        let abs = resolve_under_root(&self.root, rel)?;
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
        }
        fs::write(&abs, contents).map_err(|e| format!("write file: {e}"))
    }

    pub fn create_file(&self, rel: &str) -> Result<(), String> {
        let _ = normalize_rel(rel)?;
        let abs = resolve_under_root(&self.root, rel)?;
        if abs.exists() {
            return Err("file already exists".into());
        }
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
        }
        fs::write(&abs, "").map_err(|e| format!("create file: {e}"))
    }
}

fn path_to_posix(rel: &Path) -> String {
    rel.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn should_skip_dir(path: &Path) -> bool {
    let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
    let skip_names: HashSet<&str> = [
        ".git",
        "target",
        "node_modules",
        "dist",
        ".dart_tool",
        ".idea",
        ".vscode",
    ]
    .into_iter()
    .collect();

    if skip_names.contains(name) {
        return true;
    }
    name.starts_with('.') && name != ".graphite"
}
