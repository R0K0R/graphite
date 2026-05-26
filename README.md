# Graphite — node canvas (Electron)

A collaborative, node-based canvas for working with code and files. Each node can be a file editor, script runner, image viewer, markdown doc, or a region grouping other nodes. Extracted from [Chaperonin](https://github.com/sihooleebd/chaperonin).

## Setup

```bash
make install
```

## Run (desktop)

```bash
make electron
```

Builds the Vite bundle, then opens the canvas in an Electron window.

On NixOS, use the nix-provided Electron binary (the npm `electron` package is a generic Linux build):

```bash
nix-shell -p nodejs_22 electron --run "make electron"
```

## Dev (hot reload)

```bash
make dev
```

Runs the Vite dev server and Electron concurrently with hot reload.

## Multi-user sync

Canvas state is a Yjs CRDT — all node moves, edits, and layout changes replicate in real time across instances.

```bash
make ws-server   # start local WebSocket relay on ws://localhost:1234
make electron-a  # open a second instance (user-data: /tmp/graphite-a)
make electron-b  # open a third instance (user-data: /tmp/graphite-b)
```

Both instances open the same folder to share a room. The room code is stored in `<root>/.graphite/room` and persists across reopens so layout is never lost.

For cross-machine collaboration, start the built-in signaling server from the **Sync** panel (Server tab) and share your LAN IP with collaborators. Note: this works on a private network without port-forwarding; for public internet access you need to forward the signaling port.

## VCS (canvas-aware git)

Graphite layers a canvas version system on top of git. Each commit stores a Yjs snapshot alongside the regular git commit so canvas layout is versioned with the code.

- **Commit** — saves current node positions and links as a git commit with an attached canvas snapshot
- **Diff** — compare any two commits visually: added/removed/moved nodes are highlighted with ghost overlays
- **Branch** — switch branches with an animated transition; the canvas restores to the layout committed on that branch
- **Merge** — click "↓ merge" on any branch in the branch bar to merge it into the current branch. Conflicting node positions appear as interactive ghost overlays — click "Accept theirs" or "Keep ours" per conflict, then "Finalize merge" to create the merge commit. Falls back to a 2-way additive view when the common ancestor was not committed through Graphite

## AI agent

An agentic AI assistant that can read and edit files on the canvas via a draft→diff→accept flow — proposed edits are shown as a unified diff inline on the node and never touch the Yjs document until you accept.

Configure your provider and API key in the agent settings (✦ button or via the AgentPanel). Supported providers:

| Provider | Notes |
|----------|-------|
| Anthropic | Requires `anthropicApiKey` in `.graphite/config.json` |
| OpenAI | Requires `openaiApiKey`; also works with any OpenAI-compatible endpoint |
| Google Gemini | Requires `geminiApiKey` |
| Ollama | No API key needed; points to `http://localhost:11434` by default, configurable for remote Ollama servers |

The agent can read files, propose edits, create and delete canvas nodes, and run shell commands. File edits are CRDT-safe: the agent writes to a shadow buffer, you see a unified diff on the affected node, and the edit lands in the shared document only when you accept.

## File blame

Hover over any line in a code node to see who last modified that line, the commit summary, and how long ago — sourced from `git blame` on the real git history. Works for any file tracked by git, including commits made before Graphite.

## LSP support

Language servers are started automatically when a file is opened. Supported languages: Python (`basedpyright` or `pyright`), TypeScript/JavaScript (`typescript-language-server`), Rust (`rust-analyzer`), Go (`gopls`).

## Canvas intelligence

### Dependency edges
When file nodes are open, dashed edges appear between files that import each other — detected instantly via static regex, refined by LSP `textDocument/documentLink`. Edge thickness and color encode coupling strength: thin gray = loose, thick orange = tightly coupled. The number shown on each edge is how many times exported symbols from the dependency appear in the importing file. A small legend appears bottom-left whenever dep edges are visible.

### Symbol cards
Open file nodes show a strip of chips below the header — one per top-level function, class, or interface detected by the language server (max 10). Click a chip to jump the Monaco editor to that symbol. Press ↗ to "pin" the symbol as a free-floating card on the canvas, useful for keeping an API surface visible while editing an implementation file. Pinned cards are real Yjs nodes — they persist across reloads and sync to peers.

### Peer cursor window
When a collaborator is editing a file that yours imports (or vice versa), a small floating read-only Monaco panel appears showing their current cursor position in real time. Drag the panel to reposition; × to dismiss until they switch files.

### LSP watchdog
During real-time collaborative editing, simultaneous keystrokes can temporarily break syntax. The watchdog detects LSP errors, calls the configured LLM to silently repair the content for the language server only (your editor still shows the real CRDT state), and restores normal completions within ~2 s. Toggle and model override are in Preferences (gear icon).
