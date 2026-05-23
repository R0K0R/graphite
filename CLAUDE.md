# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
make install      # npm install
make dev          # hot-reload: Vite dev server + Electron (concurrently)
make electron     # production build then open Electron window
make build        # Vite build only (outputs to dist/)
```

On NixOS, the npm `electron` package is a generic Linux build and may fail. Use the system-provided binary instead:

```bash
nix-shell -p nodejs_22 electron --run "make electron"
```

There are no tests or linting scripts configured.

## Architecture

This is a desktop app (Electron + React + ReactFlow) for a node-based canvas where each node represents a typed module (e.g., a script editor). It is extracted from the [Chaperonin](https://github.com/sihooleebd/chaperonin) project.

**Process boundary:**
- `main.cjs` — Electron main process (CommonJS). Creates the `BrowserWindow`. In dev mode, reads `VITE_DEV_SERVER_URL` and loads that URL with DevTools open; in production, loads `dist/index.html`.
- `src/` — renderer process (React, ES modules, bundled by Vite).

**Renderer data flow:**
- `src/data/modules.js` — defines `MODULES` (the catalog of node types) and `CATEGORIES` (color metadata). Adding a new node type means adding an entry here.
- `src/App.jsx` — owns all node state via `useNodesState`. Constructs `nodesWithCallbacks` by injecting `onChangeParam` and `onToggleCollapse` callbacks into node `data` before passing to ReactFlow. Collapse logic works by filtering `visibleNodes` — children of a collapsed region are excluded from the rendered node list entirely.
- `src/components/ChaperonNode.jsx` — renders a module node. If the module has a `Text.Code` param, it embeds a Monaco editor. Param changes call `data.onChangeParam(nodeId, paramId, value)`.
- `src/components/RegionNode.jsx` — resizable/collapsible container node. Clicking the header calls `data.onToggleCollapse(id)`. Resizing uses ReactFlow's `NodeResizer` (only visible when selected and not collapsed).

**Node shape:**
```js
{
  id, type,           // 'chaperonin' | 'region'
  position,
  data: {
    module,           // ref to MODULES entry (chaperonin nodes)
    varName,          // same as id, used as Python variable name
    params,           // { [paramId]: value }
    status,           // 'idle' | ...
    progress,
    onChangeParam,    // injected by App
    onToggleCollapse, // injected by App (region nodes only)
  },
  parentId?,          // set to make a node a child of a region
  extent?,            // 'parent' constrains drag to parent bounds
}
```

**Vite config:** `base: './'` is required so Electron can load `dist/index.html` as a local file.
