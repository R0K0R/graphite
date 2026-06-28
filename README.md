# Graphite

A collaborative, node-based canvas IDE for working with codebases. Open a folder and your files appear as an interactive graph — editable in place, synchronized in real time across collaborators, and version-controlled with canvas-aware git. Extracted from [Chaperonin](https://github.com/sihooleebd/chaperonin).

---

## Table of contents

- [Setup](#setup)
- [Running](#running)
- [Canvas basics](#canvas-basics)
- [Node types](#node-types)
- [Real-time collaboration](#real-time-collaboration)
- [Version control](#version-control)
- [AI agent](#ai-agent)
- [Language server integration](#language-server-integration)
- [Dependency graph](#dependency-graph)
- [Symbol cards](#symbol-cards)
- [LSP watchdog](#lsp-watchdog)
- [Layout profiles](#layout-profiles)
- [Preferences](#preferences)
- [Architecture](#architecture)

---

## Setup

```bash
make install      # npm install
```

## Running

```bash
make dev          # hot-reload: Vite dev server + Electron concurrently
make electron     # production build, then open Electron window
make build        # Vite build only (outputs to dist/)
```

**NixOS:** the npm `electron` package is a generic Linux build and may fail. Use the system binary instead:

```bash
nix-shell -p nodejs_22 electron --run "make electron"
```

---

## Canvas basics

Click **open** in the titlebar to pick a workspace folder. Graphite scans the directory tree (max depth 4, ignoring `node_modules`, `dist`, `.git`, binaries, etc.) and lays out all files and folders as nodes on the canvas using an annular bin-pack algorithm. Regions (folders) are colored differently from their siblings and parent — colors are stable and derived from the path hash.

**Navigation**

| Action | Result |
|---|---|
| Scroll / pinch | Zoom |
| Space + drag | Pan |
| Hover a node | Magnify it and spread its siblings outward after `hoverDelay` ms |
| `Alt+F` on hovered node | Expand to fill the viewport at `focusZoom`%; press again to shrink back |
| `Alt+F` on hovered region | Center the viewport on that region |
| Click sidebar item | Fly the canvas to that node |
| `Escape` | Exit editor focus / edit mode |

**Adding nodes manually**

- **file** — prompts for a filename, creates it on disk, adds a node
- **region** — prompts for a directory name, creates it on disk, adds a region node
- **reorganize** — re-runs auto-layout from the current file tree

**Regions**

- Click the region label to collapse/expand (children are hidden entirely, not just visually scaled).
- Select a region and click **link** to associate it with a folder on disk.
- `Ctrl+drag` a file node to detach it from its current region and drop it into another. If both regions have a linked `dirPath`, the file is moved on disk automatically.

---

## Node types

### File node

Displays the content of a file. The node variant is determined by file extension:

| Extension | Renderer |
|---|---|
| `.js` `.jsx` `.ts` `.tsx` `.py` `.rs` `.go` `.css` `.html` … | Monaco code editor |
| `.md` `.mdx` | Markdown preview (toggle to raw editor) |
| `.png` `.jpg` `.gif` `.svg` `.webp` `.avif` … | Image viewer |
| `.pdf` | Embedded PDF viewer |

The left border of every code node is color-coded by language (blue for TypeScript, yellow for JavaScript, orange for Rust, etc.).

**`Alt+F`** expands any file node to fill the full canvas viewport, suppressing all canvas pan/zoom shortcuts so the Monaco editor gets them. Press `Alt+F` again (or `Escape`) to shrink back to the original size.

### Region node

A named, collapsible container that groups child nodes. When selected, shows a **link** button to associate it with a directory, enabling file-move-on-drop and `.graphite.json` metadata writes.

### Script node (`chaperonin`)

An embedded Monaco Python editor node inherited from the Chaperonin project. Not wired to an on-disk file; content is stored entirely in Yjs.

### Symbol card

A free-floating canvas node pinned from a file node's symbol strip. Shows the symbol kind (class, function, method, etc.), name, type detail, and source file. Persists in Yjs and syncs to peers. See [Symbol cards](#symbol-cards).

### Diff ghost

Semi-transparent overlay injected automatically during [diff mode](#diff-mode) to show where a node was before it was moved or removed.

### Merge ghost

Interactive overlay injected during [merge mode](#merge-mode) to show conflicting or newly-added nodes from the other branch.

---

## Real-time collaboration

Canvas state — node positions, sizes, content, region membership — is stored in a [Yjs](https://yjs.dev) CRDT document. Every change is conflict-free and replicated to all connected peers.

### Transports

**WebRTC (P2P)** — default. Peers connect directly; the signaling server only introduces them and never sees canvas data.

**WebSocket relay** — persistent server-based sync. Start a relay locally:

```bash
make ws-server   # starts y-websocket on ws://localhost:1234
```

Switch to it from the **Sync → Server** tab in the session panel.

### Multi-instance testing

```bash
make electron-a  # second instance (user-data: /tmp/graphite-a)
make electron-b  # third instance  (user-data: /tmp/graphite-b)
```

Open the same folder in each instance to share the same Yjs room.

### Session panel

Click **sync** in the titlebar to open the session panel:

- **Join a room** — enter a room code from a collaborator to join their canvas.
- **Active room** — copy your room code to share.
- **Identity** — set your display name; your color is assigned randomly.
- **Transport** — switch between P2P/WebRTC and the built-in signaling server. Start/stop the signaling server from here; it shows your LAN IP addresses so collaborators can connect.
- **Custom signaling URL** — saved to `.graphite/config.json` and used on next room init.

The signaling server is reachable on your **local network** only. For internet access, forward the signaling port (default `4444`) on your router.

### Peer presence

- **Titlebar peer dots** — stacked avatar chips for each connected peer. Click a chip to snap your viewport to that peer's currently focused node.
- **Peer dots in node headers** — colored dots show which peers are viewing a given node.
- **Remote cursors in Monaco** — y-monaco renders each peer's cursor and selection as a colored caret with a hover-visible name label.
- **Peer cursor window** — when a collaborator is editing a file that is in your import dependency graph (or vice versa), a floating, draggable, read-only Monaco pane appears showing their current file and cursor line. Dismiss with ×.

---

## Version control

Graphite layers canvas versioning on top of git. Each commit attaches a binary Yjs snapshot so canvas layout is versioned alongside the code.

Snapshots are stored in `.graphite/snapshots/<commit-hash>.bin` and committed as regular files. Blame metadata is stored in `.graphite/blame.json`. Neither is meant to be human-edited.

### Branch bar

Visible whenever a git repo is detected. Shows the current branch name, a dirty indicator when there are uncommitted canvas changes, and dots for the last 5 commits (hover for commit info).

### Commit

Click **commit…**, enter a message, and press **↑ commit**. This:
1. Captures the current Yjs state as a binary blob.
2. Creates a git commit with that snapshot attached.
3. Updates `.graphite/blame.json` with per-node authorship.

### Branch switch

Open the branch dropdown and click any branch name. Graphite:
1. Stashes any uncommitted working-tree changes.
2. Runs `git checkout`.
3. Switches the Yjs room to the branch-specific room code.
4. Seeds the new room from the committed snapshot, or rebuilds the canvas from the file tree if no snapshot exists.
5. Plays a 3D perspective lift/reveal animation during the transition.

External `git checkout` commands (run in a terminal) are detected via a `.git/HEAD` file watcher and trigger the same room switch automatically.

### Diff mode

Click **diff ▾** and pick a commit. The canvas enters diff mode:

- **Added** nodes — green glow border.
- **Modified** nodes — amber border.
- **Moved** nodes — amber border + dashed arrow from the ghost at the old position.
- **Removed** nodes — dashed red ghost overlay at the old position.
- **Unchanged** nodes — dimmed by the opacity slider.

Click a **modified** node to open a unified text diff of that file's content between the commit and now.

Exit diff mode with **exit diff** in the diff panel (top-right).

### Merge

Click **↓ merge** next to any branch in the dropdown. Graphite:
1. Runs `git merge --no-commit --no-ff` to get file-level conflicts.
2. Performs a 3-way diff of canvas snapshots (base ancestor / ours / theirs).
3. Shows **conflict ghost nodes** (purple) for nodes modified on both branches.
4. Shows **their-added ghost nodes** (teal) for nodes the other branch created.

For each conflict/addition, choose:
- **↓ theirs** — accept their node position/data.
- **keep ours** / **dismiss** — keep the current state.

Click **Finalize merge** to commit. Click **Abort** to run `git merge --abort`.

Falls back to 2-way mode (additive view without a base) when the common ancestor was not committed through Graphite.

### Blame

Each node header shows a small colored dot. Hover it to see the last author, commit hash (short), commit message, and how long ago it was committed — sourced from `.graphite/blame.json`.

Hover any **line** inside a code editor to see line-level `git blame` data (author, commit hash, summary, age) in a Monaco hover widget. This uses the real git history and works for any file tracked by git, including commits made before Graphite.

### Undo / redo

An in-memory ring buffer (50 states) of Yjs snapshots supports undo/redo for the current session.

---

## AI agent

Click **✦ agent** in the titlebar, or press **✦** on any file node header to scope the agent to that file.

### Providers

Configure provider and API key in the agent's **settings** pane. Settings are saved to `.graphite/config.json` and never committed to git.

| Provider | Config key | Notes |
|---|---|---|
| Anthropic | `anthropicApiKey` | Default model: `claude-sonnet-4-6` |
| OpenAI | `openaiApiKey`, `openaiBaseUrl` | Compatible with any OpenAI-format endpoint |
| Google Gemini | `geminiApiKey` | |
| Ollama | `ollamaBaseUrl` | Default: `http://localhost:11434`; model list fetched live |

### Tools available to the agent

| Tool | Description |
|---|---|
| `read_file` | Read any file from disk |
| `edit_file` | Propose an exact-string replacement in a file |
| `create_node` | Create a file, script, or region node on the canvas |
| `delete_node` | Remove a node from the canvas |
| `run_command` | Run a shell command in the project directory (30 s timeout, 4000 char output cap) |

### Draft → diff → accept flow

`edit_file` results are **never written directly**. Instead:
1. The proposed edit is stored as a draft in a shadow buffer.
2. A unified diff preview appears on the affected file node's header ("AI draft" badge + accept/reject buttons).
3. The same draft card appears in the agent panel thread.
4. Clicking **accept** applies the edit via `diff-match-patch` directly into the Yjs document — it replicates to all peers instantly.
5. Clicking **reject** discards the draft.

### Streaming & tool cards

Agent responses stream token-by-token. Each tool call appears as a collapsible card showing the input and result. The **stop** button aborts the agent mid-stream.

---

## Language server integration

Language servers are started automatically when a file is opened, using the first available binary found in `PATH`.

| Language | Server |
|---|---|
| Python | `basedpyright-langserver` or `pyright-langserver` |
| TypeScript / JavaScript | `typescript-language-server` |
| Rust | `rust-analyzer` |
| Go | `gopls` |

Features provided:
- **Completions** — triggered on `.` `:` `"` `'` `/` `@` `<`
- **Hover docs** — LSP hover rendered as Markdown in the Monaco hover widget
- **Inline diagnostics** — errors and warnings underlined directly in the editor, sourced from `publishDiagnostics`

---

## Dependency graph

When file nodes are open, Graphite draws dashed edges between files that import each other.

**Detection** is two-stage:
1. **Static** — regex parses ES module `import` statements (JS/TS) and `from . import` (Python) immediately.
2. **LSP-refined** — `textDocument/documentLink` results replace static deps asynchronously once the language server responds.

**Edge heat map** encodes coupling strength by reference count — the number of times exported symbols from the dependency appear in the importing file:

| Color | Strength |
|---|---|
| Gray | Low (≤ 5 refs) |
| Amber | Medium (6–10 refs) |
| Orange | High (> 10 refs) |

Edge width also scales with reference count. The count is shown as a label on each edge. A legend appears in the bottom-left corner whenever edges are visible.

---

## Symbol cards

File nodes show a strip of chips below the header — one per top-level symbol detected by the language server (classes, functions, methods, interfaces, constants, etc.; max 10 per file).

- **Click a chip** — jumps the Monaco editor to that symbol's line.
- **Press ↗ on a chip** — pins the symbol as a free-floating `symbol-card` node on the canvas, positioned just to the right of the file node.

Symbol cards are real Yjs nodes: they persist across reloads and sync to peers. They display the symbol kind label, name, type detail, and source filename.

---

## LSP watchdog

During collaborative editing, simultaneous keystrokes from multiple peers can create transient syntax errors (an intermediate invalid state). The watchdog handles this automatically:

1. When LSP reports errors, the watchdog debounces for 1 second.
2. It calls the configured LLM with the broken code and asks for a syntax-only fix.
3. The repaired code is sent to the language server as a **shadow document** — Monaco's visible editor is unchanged, so your peers' cursors are not disrupted.
4. Normal completions and hover docs resume immediately.
5. After 30 seconds of no edits, or when errors clear, the shadow is removed.

Status badges appear in the node header:
- `◌` — repairing (animated)
- `◈` — shadowed (language server using repaired version)

Toggle the watchdog and set a model override in **Preferences → LSP watchdog**.

---

## Layout profiles

Named snapshots of all node positions and sizes, independent of Yjs state.

Click **layouts** in the titlebar:
- Type a name and press **save** (or Enter) to snapshot the current layout.
- Click a saved name to restore it.
- Click **×** to delete.

Profiles are stored in `.graphite/layouts/<name>.json` and are workspace-local (not synced via Yjs, not committed to git).

---

## Preferences

Open **prefs** in the titlebar. All settings are stored in `localStorage`.

| Setting | Description | Default |
|---|---|---|
| Color theme | `dark`, `light`, `gruvbox`, `tokyo-night` | `dark` |
| Region fill opacity | Background fill of region nodes (0–50%) | 5% |
| Hover scale | Magnification factor when hovering a node (100–160%) | 120% |
| Dim scale | Opacity of non-hovered siblings (40–100%) | 80% |
| Hover delay | Time before magnification activates (0–800 ms) | 200 ms |
| Focus zoom (`Alt+F`) | Viewport zoom when expanding a node (50–150%) | 100% |
| LSP watchdog | Enable/disable AI syntax repair; optional model override | on |

---

## Architecture

```
graphite/
├── main.cjs          # Electron main process — IPC, file I/O, git, LSP servers, agent runner
├── preload.cjs       # contextBridge → window.electronAPI
├── src/
│   ├── App.jsx
│   ├── FlowCanvas.jsx        # Root component — all canvas state, IPC listeners, key handlers
│   ├── ThemeContext.js       # PrefsContext + usePrefs()
│   ├── agent/
│   │   ├── agentBridge.js    # Singleton draft store + event bus
│   │   ├── applyDraft.js     # diff-match-patch draft → Yjs apply
│   │   └── useAgent.js       # React hook wrapping the agent event stream
│   ├── components/
│   │   ├── nodes/
│   │   │   ├── Node.jsx          # Base wrapper (invisible handles, peer dots, blame dot)
│   │   │   ├── FileNode.jsx      # Dispatcher by extension
│   │   │   ├── CodeNode.jsx      # Monaco + LSP + CRDT binding + watchdog
│   │   │   ├── ImageNode.jsx
│   │   │   ├── PdfNode.jsx
│   │   │   ├── MarkdownNode.jsx
│   │   │   ├── RegionNode.jsx
│   │   │   ├── ScriptNode.jsx    # chaperonin Python editor
│   │   │   ├── SymbolCard.jsx
│   │   │   ├── DiffGhostNode.jsx
│   │   │   └── MergeGhostNode.jsx
│   │   ├── AgentPanel.jsx
│   │   ├── BranchBar.jsx
│   │   ├── DiffPanel.jsx
│   │   ├── MergePanel.jsx
│   │   ├── PeerCursorWindow.jsx
│   │   ├── PrefsPopup.jsx
│   │   ├── SessionPanel.jsx
│   │   ├── Sidebar.jsx
│   │   ├── StatusBar.jsx
│   │   └── UnifiedDiff.jsx
│   ├── crdt/
│   │   ├── doc.js            # Yjs singleton — IndexedDB + WebRTC providers, awareness
│   │   ├── useYNodes.js      # ReactFlow node state backed by Y.Map
│   │   ├── usePeers.js       # Awareness → peer list
│   │   └── monacoBinding.js  # y-monaco binding + per-peer CSS cursor styles
│   ├── hooks/
│   │   └── usePrefsState.js  # localStorage-backed preferences
│   ├── lsp/
│   │   ├── LspClient.js      # Singleton JSON-RPC client over Electron IPC
│   │   ├── monacoProviders.js# Completion, hover, diagnostic, blame hover providers
│   │   ├── depGraph.js       # Dep map + ref counts + static parser + listeners
│   │   └── watchdog.js       # Error-detect → LLM repair → shadow doc loop
│   ├── styles/
│   │   └── canvas.css        # All styles — tokens, layout grid, nodes, panels, animations
│   ├── utils/
│   │   ├── treeLayout.js     # Two-phase file-tree → node layout
│   │   ├── layout.js         # Annular bin-pack algorithm
│   │   ├── colors.js         # Per-theme palettes + deterministic color assignment
│   │   ├── canvasConstants.js
│   │   ├── nodeFactories.js  # mkFileNode, mkRegion, mkScriptNode, mkSymbolCard
│   │   ├── regionBounds.js   # Compute region bounding boxes from child positions
│   │   ├── viewport.js       # centerViewport helper + useLiveRef
│   │   └── wordlist.js       # Room code generation
│   └── vcs/
│       ├── branchStore.js    # Branch → roomCode mapping + vcs.json I/O
│       ├── computeNodeDiff.js# Node-level diff (added/removed/moved/modified)
│       ├── mergeUtils.js     # 3-way canvas merge algorithm
│       ├── blameCache.js     # Per-URI line-level blame cache for hover provider
│       ├── useUndoBuffer.js  # In-memory ring-buffer undo/redo (50 states)
│       └── useVcs.js         # VCS React hook — branches, commits, diffs, merges
└── lib/
    └── agent/providers/
        ├── anthropic.js      # Claude streaming tool-use loop
        ├── openai.js
        ├── gemini.js
        └── ollama.js
```

### Process boundary

All native operations (file I/O, git, LSP process management, agent execution) live in `main.cjs` and are exposed to the renderer exclusively through `window.electronAPI` (defined in `preload.cjs`). The renderer never has direct access to Node.js APIs.

### CRDT state

Node positions, sizes, and metadata live in a `Y.Map` keyed by node ID. Text content for each file lives in a `Y.Text` keyed by `file:<absolutePath>`. Both are in the same `Y.Doc`, persisted to IndexedDB under the workspace room code, and replicated to peers via WebRTC.

Callbacks and transient UI fields (event handlers, peer colors, diff state) are stripped from Yjs writes by `stripCallbacks()` in `useYNodes.js` so they never reach the wire.

### VCS snapshot format

Each graphite commit:
1. Writes the Yjs state update (`Y.encodeStateAsUpdate`) as a binary file at `.graphite/snapshots/<git-hash>.bin`.
2. Commits it to git alongside the source files.
3. Updates `.graphite/blame.json` with per-node authorship.
4. Updates `.graphite/vcs.json` with `{ branches: { <name>: { roomCode, snapshotHash } } }`.

On branch checkout, the snapshot for the target branch is read and applied to a fresh `Y.Doc` before the room is initialized, so the canvas appears in the committed state immediately.
