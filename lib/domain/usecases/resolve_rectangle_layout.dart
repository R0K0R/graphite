import 'dart:math' as math;
import 'dart:ui';

import '../entities/canvas_node.dart';
import '../entities/folder_region.dart';
import '../geometry/axis_aligned_overlap.dart';
import 'rectangle_layout_config.dart';

class RectangleLayoutSolveResult {
  const RectangleLayoutSolveResult({required this.nodes});

  final List<CanvasNode> nodes;
}

abstract final class ResolveRectangleLayout {
  const ResolveRectangleLayout._();

  static RectangleLayoutSolveResult solveTransient({
    required List<CanvasNode> nodesSeed,
    required String fingerId,
    required Rect fingerRect,
    required List<FolderRegion> obstacleFolders,
    required String fingerRelativePath,
    required RectangleLayoutConfig config,
  }) {
    return _solve(
      nodesSeed: nodesSeed,
      fingerId: fingerId,
      fingerRect: fingerRect,
      obstacleFolders: obstacleFolders,
      fingerRelativePath: fingerRelativePath,
      config: config,
      iterations: config.transientIterations,
    );
  }

  static RectangleLayoutSolveResult solveFinal({
    required List<CanvasNode> nodesSeed,
    required String fingerId,
    required Rect fingerRect,
    required List<FolderRegion> obstacleFolders,
    required String fingerRelativePath,
    required RectangleLayoutConfig config,
  }) {
    return _solve(
      nodesSeed: nodesSeed,
      fingerId: fingerId,
      fingerRect: fingerRect,
      obstacleFolders: obstacleFolders,
      fingerRelativePath: fingerRelativePath,
      config: config,
      iterations: config.finalizeIterations,
    );
  }

  static RectangleLayoutSolveResult _solve({
    required List<CanvasNode> nodesSeed,
    required String fingerId,
    required Rect fingerRect,
    required List<FolderRegion> obstacleFolders,
    required String fingerRelativePath,
    required RectangleLayoutConfig config,
    required int iterations,
  }) {
    final Map<String, CanvasNode> byId = <String, CanvasNode>{
      for (final n in nodesSeed) n.id: n,
    };

    final Map<String, Rect> rectById = <String, Rect>{
      for (final e in byId.entries) e.key: e.value.visualBounds,
    };
    rectById[fingerId] = fingerRect;

    final Map<String, String> relPathById = <String, String>{
      for (final e in byId.entries)
        e.key: (e.value.metadata['relativePath'] as String?) ?? e.value.id,
    };

    final Map<String, Rect> folderRectByKey = <String, Rect>{};
    if (config.treatFoldersAsObstacles) {
      for (final f in obstacleFolders) {
        folderRectByKey[_folderKey(f.relativePath)] =
            f.visualBounds.inflate(config.folderExtraInflate);
      }
    }

    final List<String> nodeIds = rectById.keys.toList(growable: false)..sort();
    final List<String> folderKeys = folderRectByKey.keys.toList(growable: false)
      ..sort();

    double spatialCutoff = double.infinity;
    if (config.spatialCutoffMultiplier.isFinite &&
        config.spatialCutoffMultiplier > 0 &&
        rectById.isNotEmpty) {
      final double md = maxDiagonalOfRects(rectById.values.toList());
      spatialCutoff = md * config.spatialCutoffMultiplier;
    }

    Rect rectOf(String id) {
      if (id == fingerId) {
        return fingerRect;
      }
      return folderRectByKey[id] ?? rectById[id]!;
    }

    bool tooFar(String idA, String idB) {
      if (spatialCutoff.isInfinite) {
        return false;
      }
      final Rect ra = rectOf(idA);
      final Rect rb = rectOf(idB);
      return (ra.center - rb.center).distance > spatialCutoff;
    }

    bool skipPair(String idA, String idB) {
      if (idA == idB) {
        return true;
      }
      final bool aFolder = folderRectByKey.containsKey(idA);
      final bool bFolder = folderRectByKey.containsKey(idB);
      if (aFolder && bFolder) {
        return true;
      }
      if (tooFar(idA, idB)) {
        return true;
      }

      if (aFolder && !bFolder) {
        final String path = _pathFromFolderKey(idA);
        if (_pathUnder(path, relPathById[idB]!)) {
          return true;
        }
        if (idB == fingerId && _pathUnder(path, fingerRelativePath)) {
          return true;
        }
        if (idB == fingerId) {
          return true;
        }
      }
      if (bFolder && !aFolder) {
        final String path = _pathFromFolderKey(idB);
        if (_pathUnder(path, relPathById[idA]!)) {
          return true;
        }
        if (idA == fingerId && _pathUnder(path, fingerRelativePath)) {
          return true;
        }
        if (idA == fingerId) {
          return true;
        }
      }
      return false;
    }

    bool pin(String id) {
      if (id == fingerId) {
        return true;
      }
      return folderRectByKey.containsKey(id);
    }

    for (int pass = 0; pass < math.max(0, iterations); pass++) {
      rectById[fingerId] = fingerRect;

      for (int i = 0; i < nodeIds.length; i++) {
        for (int j = i + 1; j < nodeIds.length; j++) {
          final String a = nodeIds[i];
          final String b = nodeIds[j];
          if (skipPair(a, b)) {
            continue;
          }
          final Rect ra = a == fingerId ? fingerRect : rectById[a]!;
          final Rect rb = b == fingerId ? fingerRect : rectById[b]!;
          final Offset? mtd =
              minimumTranslationAlongAxis(ra, rb, config.minSeparationGap);
          if (mtd == null) {
            continue;
          }
          _applyPairCorrection(
            rectById,
            fingerId,
            fingerRect,
            a,
            b,
            mtd,
            pin(a),
            pin(b),
            config.maxDisplacementPerIteration,
          );
        }
      }

      for (final nid in nodeIds) {
        for (final fk in folderKeys) {
          final String a = nid.compareTo(fk) < 0 ? nid : fk;
          final String b = nid.compareTo(fk) < 0 ? fk : nid;
          if (skipPair(a, b)) {
            continue;
          }
          final Rect ra = nid == fingerId ? fingerRect : rectById[nid]!;
          final Rect rb = folderRectByKey[fk]!;
          final Offset? mtd =
              minimumTranslationAlongAxis(ra, rb, config.minSeparationGap);
          if (mtd == null) {
            continue;
          }
          _applyPairCorrection(
            rectById,
            fingerId,
            fingerRect,
            a,
            b,
            mtd,
            pin(a),
            pin(b),
            config.maxDisplacementPerIteration,
          );
        }
      }

      rectById[fingerId] = fingerRect;
    }

    final List<CanvasNode> out = <CanvasNode>[
      for (final n in nodesSeed)
        n.id == fingerId
            ? _nodeWithVisualRect(n, rectById[fingerId]!)
            : _nodeWithVisualRect(n, rectById[n.id]!),
    ];
    return RectangleLayoutSolveResult(nodes: out);
  }

  static String _folderKey(String relativePath) => '__fld__$relativePath';

  static String _pathFromFolderKey(String key) {
    const p = '__fld__';
    return key.startsWith(p) ? key.substring(p.length) : key;
  }

  static bool _pathUnder(String folderPath, String filePath) {
    if (folderPath.isEmpty) {
      return true;
    }
    return filePath == folderPath || filePath.startsWith('$folderPath/');
  }

  static void _applyPairCorrection(
    Map<String, Rect> rectById,
    String fingerId,
    Rect fingerRect,
    String idA,
    String idB,
    Offset mtd,
    bool pinA,
    bool pinB,
    double maxStep,
  ) {
    if (pinA && pinB) {
      return;
    }
    Offset m = mtd;
    final double d = m.distance;
    if (d > maxStep && d > 0) {
      m = m * (maxStep / d);
    }

    Offset corrA = Offset.zero;
    Offset corrB = Offset.zero;
    if (pinA) {
      corrB = m;
    } else if (pinB) {
      corrA = -m;
    } else {
      corrA = -m / 2;
      corrB = m / 2;
    }

    void shift(String id, Offset c) {
      if (c == Offset.zero) {
        return;
      }
      if (id == fingerId) {
        return;
      }
      final Rect? r = rectById[id];
      if (r != null) {
        rectById[id] = r.shift(c);
      }
    }

    shift(idA, corrA);
    shift(idB, corrB);
    rectById[fingerId] = fingerRect;
  }

  static CanvasNode _nodeWithVisualRect(CanvasNode n, Rect targetVisual) {
    final Rect current = n.visualBounds;
    final Offset delta = targetVisual.center - current.center;
    if (delta == Offset.zero) {
      return n;
    }
    return n.translated(delta);
  }
}
