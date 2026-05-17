import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';

import 'package:graphite/domain/geometry/axis_aligned_overlap.dart';
import 'package:graphite/domain/usecases/rectangle_layout_config.dart';
import 'package:graphite/domain/usecases/resolve_rectangle_layout.dart';
import 'package:graphite/domain/entities/canvas_node.dart';
import 'package:graphite/domain/entities/folder_region.dart';

void main() {
  test('minimumTranslationAlongAxis returns axis MTV for AABB overlap', () {
    const Rect a = Rect.fromLTWH(0, 0, 40, 40);
    const Rect b = Rect.fromLTWH(30, 0, 40, 40);
    final Offset? mtd = minimumTranslationAlongAxis(a, b, 4);
    expect(mtd, isNotNull);
    expect(mtd!.dy, 0);
    expect(mtd.dx.abs() > 8, isTrue);
  });

  test('solveFinal seeds from current layout without baseline snap-back', () {
    final CanvasNode a = CanvasNode(
      id: 'a',
      title: 'A',
      position: const Offset(0, 0),
      size: const Size(40, 40),
      metadata: const <String, Object?>{'relativePath': 'a.dart'},
    );
    final CanvasNode b = CanvasNode(
      id: 'b',
      title: 'B',
      position: const Offset(50, 0),
      size: const Size(40, 40),
      metadata: const <String, Object?>{'relativePath': 'b.dart'},
    );
    final List<CanvasNode> shifted = <CanvasNode>[
      a,
      b.translated(const Offset(-10, 0)),
    ];
    const Rect fingerRect = Rect.fromLTWH(10, 0, 40, 40);
    final RectangleLayoutSolveResult out = ResolveRectangleLayout.solveFinal(
      nodesSeed: shifted,
      fingerId: 'a',
      fingerRect: fingerRect,
      obstacleFolders: const <FolderRegion>[],
      fingerRelativePath: 'a.dart',
      config: const RectangleLayoutConfig(
        finalizeIterations: 30,
        treatFoldersAsObstacles: false,
      ),
    );
    final Rect ra = out.nodes.firstWhere((n) => n.id == 'a').visualBounds;
    final Rect rb = out.nodes.firstWhere((n) => n.id == 'b').visualBounds;
    expect(ra, fingerRect);
    expect(rb.left >= ra.right + 8 - 0.5, isTrue);
  });
}
