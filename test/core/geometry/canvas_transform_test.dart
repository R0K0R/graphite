import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:graphite/core/geometry/canvas_transform.dart';

void main() {
  test('converts between screen and world coordinates', () {
    final transform = CanvasTransform.identity()
      ..translateByDouble(100, 50, 0, 1)
      ..scaleByDouble(2, 2, 1, 1);

    final worldPoint = CanvasTransform.screenToWorld(
      transform,
      const Offset(140, 90),
    );
    final screenPoint = CanvasTransform.worldToScreen(transform, worldPoint);

    expect(worldPoint, const Offset(20, 20));
    expect(screenPoint.dx, closeTo(140, 0.001));
    expect(screenPoint.dy, closeTo(90, 0.001));
  });

  test('converts viewport rect to world rect', () {
    final transform = CanvasTransform.identity()..scaleByDouble(2, 2, 1, 1);

    final worldRect = CanvasTransform.screenRectToWorld(
      transform,
      const Rect.fromLTWH(0, 0, 400, 200),
    );

    expect(worldRect, const Rect.fromLTWH(0, 0, 200, 100));
  });
}
