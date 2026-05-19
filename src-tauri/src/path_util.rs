//! Relative path normalization and sandbox checks against an opened project root.

use std::{
    fs,
    path::{Component, Path, PathBuf},
};

pub fn normalize_rel(rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim().trim_start_matches(['/', '\\']);
    if rel.is_empty() {
        return Err("path must not be empty".into());
    }
    let mut out = PathBuf::new();
    for comp in Path::new(rel).components() {
        match comp {
            Component::Normal(os) => out.push(os),
            Component::CurDir => {}
            Component::ParentDir => return Err("path must not contain '..'".into()),
            Component::RootDir | Component::Prefix(_) => {
                return Err("absolute paths are not allowed".into());
            }
        }
    }
    if out.as_os_str().is_empty() {
        return Err("invalid path".into());
    }
    Ok(out)
}

/// Resolve `rel` under `root`. Works when the target path does not exist yet by canonicalizing parents.
pub fn resolve_under_root(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let norm = normalize_rel(rel)?;
    let joined = root.join(norm);

    let root_canon = fs::canonicalize(root).map_err(|e| format!("canonicalize root: {e}"))?;

    match fs::canonicalize(&joined) {
        Ok(canonical) => {
            if !canonical.starts_with(&root_canon) {
                return Err("path escapes project root".into());
            }
            Ok(canonical)
        }
        Err(_) => {
            let parent = joined.parent().ok_or("invalid joined path")?;
            let file_name = joined.file_name().ok_or("invalid file name")?;
            let parent_canon = fs::canonicalize(parent)
                .map_err(|_| format!("parent path must exist: {}", parent.display()))?;
            if !parent_canon.starts_with(&root_canon) {
                return Err("path escapes project root".into());
            }
            Ok(parent_canon.join(file_name))
        }
    }
}
