# Graphite — node canvas (Electron)

Typed module nodes on a ReactFlow 2D canvas, extracted from [Chaperonin](https://github.com/sihooleebd/chaperonin).

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
