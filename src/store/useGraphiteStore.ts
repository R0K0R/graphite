import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type {
  Camera,
  CanvasNode,
  FsEntry,
  GraphiteMetadata,
  ProjectSnapshot,
} from "../types";

function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  };
}

export function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

function mergeFsIntoMetadata(
  metadata: GraphiteMetadata,
  entries: FsEntry[],
): GraphiteMetadata {
  const existing = new Set(metadata.nodes.map((n) => n.path));
  const newNodes = [...metadata.nodes];
  let i = 0;

  for (const e of entries) {
    if (existing.has(e.path)) continue;
    existing.add(e.path);
    const id = crypto.randomUUID();
    const row = Math.floor(i / 8);
    const col = i % 8;
    newNodes.push({
      id,
      kind: e.kind,
      path: e.path,
      x: col * 240 + 48,
      y: row * 160 + 48,
      width: e.kind === "folder" ? 260 : 340,
      height: e.kind === "folder" ? 110 : 200,
      collapsed: false,
      expanded: false,
    });
    i += 1;
  }

  return { ...metadata, nodes: newNodes };
}

export interface GraphiteState {
  root: string | null;
  metadata: GraphiteMetadata;
  entries: FsEntry[];
  camera: Camera;
  status: string;
  setCamera: (camera: Camera) => void;
  setStatus: (s: string) => void;
  loadSnapshot: (snap: ProjectSnapshot) => void;
  reset: () => void;
  patchNode: (id: string, patch: Partial<CanvasNode>) => void;
  mergeFsEntries: (entries: FsEntry[]) => void;
  persistMetadataDebounced: () => void;
}

const persistMeta = debounce(() => {
  const meta = useGraphiteStore.getState().metadata;
  invoke("save_project_metadata", { metadata: meta }).catch((e) =>
    console.error("save_project_metadata", e),
  );
}, 450);

export const useGraphiteStore = create<GraphiteState>((set, get) => ({
  root: null,
  metadata: { version: 1, nodes: [] },
  entries: [],
  camera: { x: 40, y: 40, scale: 1 },
  status: "Open a folder to begin.",

  setCamera: (camera) => set({ camera }),

  setStatus: (status) => set({ status }),

  loadSnapshot: (snap) =>
    set({
      root: snap.root,
      metadata: snap.metadata,
      status: `Opened ${snap.root}`,
    }),

  reset: () =>
    set({
      root: null,
      metadata: { version: 1, nodes: [] },
      entries: [],
      camera: { x: 40, y: 40, scale: 1 },
      status: "Closed project.",
    }),

  patchNode: (id, patch) => {
    const meta = get().metadata;
    const nodes = meta.nodes.map((n) =>
      n.id === id ? { ...n, ...patch } : n,
    );
    set({ metadata: { ...meta, nodes } });
    persistMeta();
  },

  mergeFsEntries: (entries) => {
    const meta = mergeFsIntoMetadata(get().metadata, entries);
    set({ entries, metadata: meta });
    persistMeta();
  },

  persistMetadataDebounced: () => persistMeta(),
}));
