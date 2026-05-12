import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:graphite/domain/entities/canvas_node.dart';
import 'package:graphite/domain/entities/folder_region.dart';

void main() {
  test('collapsed file nodes use compact visual bounds', () {
    const node = CanvasNode(
      id: 'lib/main.dart',
      title: 'main.dart',
      position: Offset(100, 120),
      size: Size(520, 360),
      isCollapsed: true,
    );

    expect(node.bounds, const Rect.fromLTWH(100, 120, 520, 360));
    expect(node.visualBounds.size, CanvasNode.collapsedSize);
    expect(node.visualBounds.center, node.bounds.center);
    expect(node.containsWorldPoint(node.visualBounds.center), isTrue);
  });

  test('collapsed folders use circular visual bounds', () {
    const folder = FolderRegion(
      relativePath: 'lib',
      bounds: Rect.fromLTWH(80, 40, 1400, 900),
      color: Color(0xffdbeafe),
      isCollapsed: true,
    );

    expect(
      folder.visualBounds,
      const Rect.fromLTWH(
        80,
        40,
        FolderRegion.collapsedDiameter,
        FolderRegion.collapsedDiameter,
      ),
    );
  });
}
