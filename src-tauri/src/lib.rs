mod lsp_host;
mod path_util;
mod project;

use project::{FsEntry, GraphiteMetadata, OpenProject};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::Mutex,
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

pub struct ManagedState {
    pub project: Mutex<Option<OpenProject>>,
    pub lsp: lsp_host::LspHostState,
}

impl Default for ManagedState {
    fn default() -> Self {
        Self {
            project: Mutex::new(None),
            lsp: lsp_host::LspHostState::new(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub root: String,
    pub metadata: GraphiteMetadata,
}

#[tauri::command]
fn pick_project_folder(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Open Graphite project")
        .blocking_pick_folder();

    match picked {
        None => Ok(None),
        Some(fp) => {
            let path = fp
                .into_path()
                .map_err(|e| format!("resolve dialog path: {e}"))?;
            Ok(Some(path.display().to_string()))
        }
    }
}

#[tauri::command]
fn open_project(state: State<'_, ManagedState>, path: String) -> Result<(), String> {
    let root = PathBuf::from(path.trim());
    if !root.is_dir() {
        return Err("project path must be an existing directory".into());
    }

    let canon = std::fs::canonicalize(&root).map_err(|e| format!("canonicalize: {e}"))?;
    let proj = OpenProject::load_or_default(canon)?;

    state.lsp.set_project_root(Some(proj.root.clone()));

    let mut guard = state.project.lock().map_err(|_| "state poisoned".to_string())?;
    *guard = Some(proj);

    Ok(())
}

#[tauri::command]
fn close_project(state: State<'_, ManagedState>) -> Result<(), String> {
    state.lsp.set_project_root(None);
    let mut guard = state.project.lock().map_err(|_| "state poisoned".to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
fn project_snapshot(state: State<'_, ManagedState>) -> Result<Option<ProjectSnapshot>, String> {
    let guard = state.project.lock().map_err(|_| "state poisoned".to_string())?;
    Ok(guard.as_ref().map(|p| ProjectSnapshot {
        root: p.root.display().to_string(),
        metadata: p.metadata.clone(),
    }))
}

#[tauri::command]
fn sync_fs_entries(state: State<'_, ManagedState>) -> Result<Vec<FsEntry>, String> {
    let guard = state.project.lock().map_err(|_| "state poisoned".to_string())?;
    let proj = guard.as_ref().ok_or("no project open".to_string())?;
    proj.sync_tree()
}

#[tauri::command]
fn read_project_file(state: State<'_, ManagedState>, path: String) -> Result<String, String> {
    let guard = state.project.lock().map_err(|_| "state poisoned".to_string())?;
    let proj = guard.as_ref().ok_or("no project open".to_string())?;
    proj.read_file(&path)
}

#[tauri::command]
fn write_project_file(
    state: State<'_, ManagedState>,
    path: String,
    contents: String,
) -> Result<(), String> {
    let guard = state.project.lock().map_err(|_| "state poisoned".to_string())?;
    let proj = guard.as_ref().ok_or("no project open".to_string())?;
    proj.write_file(&path, &contents)
}

#[tauri::command]
fn create_project_file(state: State<'_, ManagedState>, path: String) -> Result<(), String> {
    let guard = state.project.lock().map_err(|_| "state poisoned".to_string())?;
    let proj = guard.as_ref().ok_or("no project open".to_string())?;
    proj.create_file(&path)
}

#[tauri::command]
fn save_project_metadata(
    state: State<'_, ManagedState>,
    metadata: GraphiteMetadata,
) -> Result<(), String> {
    let mut guard = state.project.lock().map_err(|_| "state poisoned".to_string())?;
    let proj = guard.as_mut().ok_or("no project open".to_string())?;
    proj.save_metadata(metadata)
}

#[tauri::command]
fn lsp_listen_base_url(state: State<'_, ManagedState>) -> Result<Option<String>, String> {
    Ok(state.lsp.listen_base_url())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let managed = ManagedState::default();
    managed.lsp.ensure_started();

    tauri::Builder::default()
        .manage(managed)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pick_project_folder,
            open_project,
            close_project,
            project_snapshot,
            sync_fs_entries,
            read_project_file,
            write_project_file,
            create_project_file,
            save_project_metadata,
            lsp_listen_base_url,
        ])
        .setup(|_| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
