import { invoke } from "@tauri-apps/api/core";
import type { FsEntry, ProjectSnapshot } from "../types";
import { useGraphiteStore } from "../store/useGraphiteStore";

export function Toolbar() {
  const status = useGraphiteStore((s) => s.status);
  const root = useGraphiteStore((s) => s.root);
  const loadSnapshot = useGraphiteStore((s) => s.loadSnapshot);
  const reset = useGraphiteStore((s) => s.reset);
  const mergeFsEntries = useGraphiteStore((s) => s.mergeFsEntries);
  const setStatus = useGraphiteStore((s) => s.setStatus);

  async function refreshTree() {
    if (!useGraphiteStore.getState().root) return;
    try {
      const entries = await invoke<FsEntry[]>("sync_fs_entries");
      mergeFsEntries(entries);
      setStatus(`Synced ${entries.length} filesystem entries`);
    } catch (e) {
      console.error(e);
      setStatus(`Sync failed: ${String(e)}`);
    }
  }

  async function openFolder() {
    try {
      const picked = await invoke<string | null>("pick_project_folder");
      if (!picked) return;
      await invoke("open_project", { path: picked });
      const snap = await invoke<ProjectSnapshot | null>("project_snapshot");
      if (!snap) {
        setStatus("Open failed.");
        return;
      }
      loadSnapshot(snap);
      await refreshTree();
    } catch (e) {
      console.error(e);
      setStatus(`Open failed: ${String(e)}`);
    }
  }

  async function closeProject() {
    try {
      await invoke("close_project");
      reset();
    } catch (e) {
      console.error(e);
    }
  }

  async function createFile() {
    if (!root) return;
    const rel = window.prompt("New file path (relative to project)", "notes.txt");
    if (!rel) return;
    try {
      await invoke("create_project_file", { path: rel });
      await refreshTree();
    } catch (e) {
      console.error(e);
      setStatus(`Create failed: ${String(e)}`);
    }
  }

  async function probeLsp() {
    try {
      const url = await invoke<string | null>("lsp_listen_base_url");
      setStatus(url ? `LSP relay at ${url}` : "LSP relay starting…");
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <header className="toolbar">
      <div className="toolbar__brand">Graphite</div>
      <button type="button" onClick={() => void openFolder()}>
        Open folder
      </button>
      <button type="button" onClick={() => void refreshTree()} disabled={!root}>
        Sync FS
      </button>
      <button type="button" onClick={() => void createFile()} disabled={!root}>
        New file
      </button>
      <button type="button" onClick={() => void probeLsp()}>
        LSP endpoint
      </button>
      <button type="button" onClick={() => void closeProject()} disabled={!root}>
        Close
      </button>
      <div className="toolbar__status">{status}</div>
    </header>
  );
}
