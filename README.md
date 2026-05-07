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

## Deferred Scope

Graphite intentionally starts with basic code editor support. LSP,
autocomplete, diagnostics, Monaco/WebView integration, image/binary file nodes,
CRDT collaboration, custom VCS behavior, stylus handwriting recognition, and the
plugin SDK are planned as later layers after the local filesystem-backed IDE
loop is stable.
