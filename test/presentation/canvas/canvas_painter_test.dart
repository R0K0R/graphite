import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:graphite/domain/entities/canvas_node.dart';
import 'package:graphite/presentation/canvas/canvas_painter.dart';

void main() {
  test('visibleNodes culls nodes outside viewport', () {
    const visible = CanvasNode(
      id: 'visible',
      title: 'Visible',
      position: Offset(10, 10),
      size: Size(100, 80),
    );
    const hidden = CanvasNode(
      id: 'hidden',
      title: 'Hidden',
      position: Offset(1000, 1000),
      size: Size(100, 80),
    );

    final result = CanvasPainter.visibleNodes(
      nodes: const <CanvasNode>[visible, hidden],
      viewportWorldRect: const Rect.fromLTWH(0, 0, 400, 400),
    );

    expect(result, const <CanvasNode>[visible]);
  });
}
