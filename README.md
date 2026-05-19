# Graphite (Tauri)

Spatial filesystem-backed canvas IDE prototype: **React + Vite** UI inside a **Tauri 2** shell, **Rust** commands for safe project I/O + `.graphite.json`, and a loopback **Axum** server exposing **`GET /health`** and **`GET /lsp/:language` → WebSocket → stdio JSON-RPC** relay with optional `.graphite/lsp.yaml` overrides.

## Branch note

Desktop development lives on the orphan branch **`graphite-tauri`** (Flutter history remains on other branches).

## Prerequisites

### Linux (Arch example)

Install WebKitGTK / GTK toolchain deps required by Tauri, for example:

```bash
sudo pacman -S webkit2gtk base-devel curl wget openssl appmenu-gtk-module gtk3 libappindicator-gtk3 librsvg libvips
```

See also [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

### Toolchain

- **Rust** stable (`rustup`)
- **Node.js** + **npm**

### Disk space

Release builds link a large native binary and LLVM temporaries can consume several gigabytes. If linking fails with **“No space left on device”**, free disk space (for example remove old `src-tauri/target/` trees or expand the partition) before running `cargo tauri build`.

## Development

```bash
npm install
npm run tauri dev
```

## Production frontend bundle

```bash
npm run build
```

(`tsc && vite build` — verifies TypeScript + bundles Monaco workers.)

## Desktop packaging

Default bundle targets are **`.deb` packages only** (see `src-tauri/tauri.conf.json`). Example commands:

```bash
# Full release + Debian package (needs several GB free disk during link)
npm run tauri build

# Faster iteration when disk is tight: compile debug binary, skip installers
npm exec tauri build -- --debug --no-bundle
```

The Rust crate alone can be type-checked without packaging:

```bash
cd src-tauri && cargo check
```

## Features (phase 1)

- Folder picker → open canonical project root with path sandboxing under that root.
- `walkdir` sync → merges discovered paths into `.graphite.json` metadata when missing.
- Pan / zoom canvas (middle-mouse drag + wheel), draggable folder/file nodes, folder collapse hides descendant paths.
- Double-click files → Monaco overlay tiles with debounced saves via `write_project_file`.
- Axum listens on **`127.0.0.1:0`**; invoke `lsp_listen_base_url` (from devtools/console via `Toolbar`) prints `http://127.0.0.1:<port>/`. Connect WebSockets at `ws://127.0.0.1:<port>/lsp/<language>` where `<language>` matches bundled defaults (`typescript`, `javascript`, `rust`) or keys from `.graphite/lsp.yaml`.

### Example `.graphite/lsp.yaml`

```yaml
languages:
  python:
    command: pylsp
    args: []
```

Keys merge over built-in defaults.

## Repository layout

- `src/` — React UI (Konva canvas + Monaco overlays + Zustand store)
- `src-tauri/` — Tauri shell, filesystem commands, Axum host

## Legal

Licensed under the MIT License — see [LICENSE](LICENSE).
