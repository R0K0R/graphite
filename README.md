# Graphite

Graphite is a 2D spatial IDE built with Flutter. The project root is the
infinite canvas: every supported text/code file becomes a floating editor node,
and folders are drawn as colored, bordered canvas regions.

## Current MVP

- Open a local project root from the HUD.
- Pan and zoom the infinite canvas.
- Edit supported text/code files inside floating nodes.
- Drag file nodes to arrange project structure spatially.
- Fold folder regions to hide their child file nodes.
- Create a new file node, which also creates the real file on disk.
- Sync the project to discover files created outside Graphite.
- Persist node layout, folder regions, and canvas links in `.graphite.json`.

File contents stay in the actual files. `.graphite.json` only stores spatial
metadata.

## Metadata

Graphite writes one metadata file under the opened project root:

```json
{
  "schemaVersion": 1,
  "nodes": {
    "lib/main.dart": {
      "x": 120,
      "y": 80,
      "width": 520,
      "height": 360
    }
  },
  "folders": {
    "lib": {
      "x": 80,
      "y": 40,
      "width": 1400,
      "height": 900,
      "color": "#DBEAFE",
      "collapsed": true
    }
  },
  "edges": []
}
```

## Architecture

- `lib/core/files`: path safety and text-file detection.
- `lib/domain/entities`: canvas, project, file, folder, and diff entities.
- `lib/domain/repositories`: repository contracts.
- `lib/domain/usecases`: project-level actions.
- `lib/data/datasources`: local filesystem access.
- `lib/data/models`: JSON metadata models.
- `lib/data/repositories`: filesystem-backed project repository.
- `lib/lsp`: loopback Monaco static host, WebSocket LSP relay, YAML registry.
- `lib/presentation/project`: Riverpod project state and sync controller.
- `lib/presentation/canvas`: pan/zoom, culling, regions, edges, and node layout.
- `lib/presentation/editor`: embedded text/code editor widgets.

## Development

```sh
flutter pub get
flutter analyze
flutter test
flutter run -d linux
```

### Monaco + LSP (bundled WebView editor)

On **Android, iOS, and macOS**, code tiles load a **Vite-bundled Monaco** app
from `assets/monaco_lsp/`. A loopback `HttpServer` serves those assets and
exposes WebSocket routes `ws://127.0.0.1:<port>/lsp/<serverId>` that relay
JSON-RPC to language servers over stdio (`Content-Length` framing).

1. Build the browser bundle (Node.js required; on NixOS you can use
   `nix-shell -p nodejs_22`):

   ```sh
   cd tooling/monaco_lsp
   npm ci
   npm run build
   ```

   This writes into `assets/monaco_lsp/` (declared in `pubspec.yaml`).

2. **Dart** and **TypeScript/JavaScript** defaults expect binaries on `PATH`:

   - `dart language-server` (ship with the Flutter/Dart SDK)
   - `typescript-language-server --stdio` (Node; install globally or via your
     package manager)

3. Optional overrides: create **`.graphite/lsp.yaml`** under the opened project
   root. Keys under `servers:` merge with built-in `dart` and `typescript`
   entries; each server lists `executable`, `args`, optional `languages`,
   `environment`, and `initialization_options`.

4. **Linux desktop**: `webview_flutter` has no Monaco implementation here; the
   **plain multiline `TextField`** fallback still applies (see
   `lib/presentation/editor/monaco_webview_supported_io.dart`).

5. **Troubleshooting**: if the WebView shows a host error, confirm the npm build
   ran, `assets/monaco_lsp/index.html` exists, language servers launch from the
   project root, and on Android that cleartext to localhost is allowed (see
   `android/app/src/main/res/xml/network_security_config.xml`).

## Deferred Scope

Graphite intentionally starts with basic code editor support in some
environments. Image/binary file nodes, CRDT collaboration, custom VCS behavior,
stylus handwriting recognition, and the plugin SDK are planned as later layers
after the local filesystem-backed IDE loop is stable.
