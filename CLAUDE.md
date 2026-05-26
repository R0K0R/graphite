# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
make install      # npm install
make dev          # hot-reload: Vite dev server + Electron (concurrently)
make electron     # production build then open Electron window
make build        # Vite build only (outputs to dist/)
make ws-server    # start y-websocket sync server on ws://localhost:1234
make electron-a   # open a second Electron instance with --user-data-dir=/tmp/graphite-a
make electron-b   # open a third instance (graphite-b) — for testing multi-user CRDT sync
```

On NixOS, the npm `electron` package is a generic Linux build and may fail. Use the system-provided binary instead:

```bash
nix-shell -p nodejs_22 electron --run "make electron"
```

There are no tests or linting scripts configured.

## Architecture

This is a desktop app (Electron + React + ReactFlow) for a node-based canvas where each node can be a file viewer, script editor, image, PDF, markdown doc, or a region grouping other nodes. It is extracted from the [Chaperonin](https://github.com/sihooleebd/chaperonin) project.

**Process boundary:**
- `main.cjs` — Electron main process (CommonJS). Creates the `BrowserWindow`, handles all IPC (file I/O, directory scanning, file watching, LSP server management). In dev mode reads `VITE_DEV_SERVER_URL`; in production loads `dist/index.html`.
- `preload.cjs` — exposes `window.electronAPI` to the renderer via `contextBridge`. This is the only way the renderer can access native APIs.
- `src/` — renderer process (React, ES modules, bundled by Vite).

**Renderer entry:**
- `src/App.jsx` → `src/FlowCanvas.jsx` — `FlowCanvas` is the real root; it owns all state, IPC listeners, and keyboard handlers.

**Node types** (registered in `FlowCanvas` as `NODE_TYPES`):
- `chaperonin` → `src/components/nodes/ScriptNode.jsx` — script editor
- `region` → `src/components/nodes/RegionNode.jsx` — collapsible/resizable group
- `file` → `src/components/nodes/FileNode.jsx` — dispatches to `CodeNode`, `MarkdownNode`, `ImageNode`, `PdfNode` based on file extension

**State & CRDT layer (`src/crdt/`):**
- `doc.js` — singleton Yjs document with IndexedDB persistence and WebSocket sync (`ws://localhost:1234`). Exports `getYNodes()` (a `Y.Map`) and `getYText(filePath)`. Call `initRoom(rootPath)` when a folder is opened; it derives the room code from the path.
- `useYNodes.js` — replaces ReactFlow's `useNodesState`. Reads/writes the `Y.Map` so all node moves and data changes are CRDT-replicated. Callbacks and transient UI fields are stripped before writing to Yjs (`stripCallbacks`).
- `usePeers.js` — subscribes to Yjs awareness; returns the peer list for the title bar cluster.
- `monacoBinding.js` — binds a Monaco editor model to a `Y.Text` entry via `y-monaco`.

**LSP integration (`src/lsp/`):**
- `LspClient.js` — singleton renderer-side client. Routes JSON-RPC to language servers spawned by the main process via `window.electronAPI.lspStart/lspSend/onLspMessage`. Supported languages: python (`basedpyright-langserver` or `pyright-langserver`), typescript/javascript (`typescript-language-server`), rust (`rust-analyzer`), go (`gopls`).
- `monacoProviders.js` — registers Monaco completion and hover providers that delegate to `LspClient`.

**Persistence of layout:**
- Node positions/data live in Yjs (IndexedDB-backed per room code).
- Region-to-directory metadata is written to `.graphite.json` files inside each linked directory, debounced 800 ms after node changes.

**Key FlowCanvas behaviors:**
- `Alt+F` — expands the hovered node to fill the viewport at `focusZoom`%; pressing again shrinks it back. Expand state is local-only (never stored in Yjs).
- Hover magnification — hovering a node (after `hoverDelay` ms) spreads its sibling leaf nodes by `hoverScale` around their centroid.
- `editMode` — set when a Monaco editor is focused; suppresses ReactFlow's delete and pan/zoom keybindings so the editor can use them.
- Collapse — region children are filtered out of `visibleNodes` entirely; `isHiddenByCollapse` walks the `childParentMap` chain.
- Two-phase file-tree layout — phase 1 places nodes with estimated sizes; phase 2 re-runs `buildNodesFromTree` once ReactFlow has measured actual dimensions.

**VCS layer (`src/vcs/`):**
- `useVcs.js` — React hook consumed by `FlowCanvas`. Surfaces `hasGit`, `branches`, `currentBranch`, `isDirty`, `gitLog`, `diffMode`, `canvasAnim`, `blameMap`. Bridges the canvas-state diff against the committed Yjs snapshot stored in each git commit object via IPC calls (`vcs:init`, `vcs:commit`, `vcs:checkout`, `vcs:diff`, `vcs:load-blame`, `vcs:git-log`). Listens for external `git checkout` events from the main process and switches rooms automatically.
- `branchStore.js` — derives deterministic Yjs room codes from `sha1(rootPath + ':' + branchName)` and reads/writes `.graphite/vcs.json` for branch metadata. Room codes are stable so switching branches and back restores the exact IndexedDB database.
- `computeNodeDiff.js` — pure function; compares two node arrays and returns a `Map<id, {type, node, prevPosition?}>` used by `DiffPanel` and `DiffGhostNode`.
- `useUndoBuffer.js` — undo/redo wrapper around the Yjs doc.

**VCS commit storage:** Each commit stores a base64-encoded `Y.encodeStateAsUpdate` blob as a git note (`refs/notes/graphite-snapshot`) on top of a regular git commit. `vcs:checkout` reads this blob, applies it to the newly initialised Yjs room, and seeds the IndexedDB state.

**Diff visualization:** When `diffMode` is set, `FlowCanvas` passes `diffState` into each node's `data` and renders semi-transparent `DiffGhostNode` overlays (via `src/components/nodes/DiffGhostNode.jsx`) at the positions nodes occupied in the base snapshot. `DiffPanel` (top-right ReactFlow panel) shows counts and an opacity slider.

**`canvasAnim` state machine:** `'lift'` → checkout in progress (nodes animate up) → `'reveal'` → room switched (nodes settle) → `null`. Driven by `useVcs` with 180 ms / 330 ms timeouts; `FlowCanvas` applies CSS classes based on this value.

**`.graphite/` directory:** Created at the root of each opened workspace. Contains `vcs.json` (branch → roomCode mapping) and is git-ignored automatically by the VCS init handler.

**Adding a new node type:**
1. Create `src/components/nodes/YourNode.jsx`.
2. Register it in `FlowCanvas`'s `NODE_TYPES` map.
3. Add a factory in `src/utils/nodeFactories.js` and a button in the title bar.
4. Add any fields that must not be persisted to `CALLBACK_KEYS` in `useYNodes.js`.

**Vite config:** `base: './'` is required so Electron can load `dist/index.html` as a local file.
