import 'package:flutter/widgets.dart';

class CanvasTransform {
  const CanvasTransform._();

  static Matrix4 identity() => Matrix4.identity();

  static Offset screenToWorld(Matrix4 transform, Offset screenPoint) {
    final inverse = Matrix4.inverted(transform);
    final world = MatrixUtils.transformPoint(inverse, screenPoint);
    return world;
  }

  static Offset worldToScreen(Matrix4 transform, Offset worldPoint) {
    return MatrixUtils.transformPoint(transform, worldPoint);
  }

  static Rect screenRectToWorld(Matrix4 transform, Rect screenRect) {
    final topLeft = screenToWorld(transform, screenRect.topLeft);
    final topRight = screenToWorld(transform, screenRect.topRight);
    final bottomLeft = screenToWorld(transform, screenRect.bottomLeft);
    final bottomRight = screenToWorld(transform, screenRect.bottomRight);

    final left = <double>[
      topLeft.dx,
      topRight.dx,
      bottomLeft.dx,
      bottomRight.dx,
    ].reduce((a, b) => a < b ? a : b);
    final top = <double>[
      topLeft.dy,
      topRight.dy,
      bottomLeft.dy,
      bottomRight.dy,
    ].reduce((a, b) => a < b ? a : b);
    final right = <double>[
      topLeft.dx,
      topRight.dx,
      bottomLeft.dx,
      bottomRight.dx,
    ].reduce((a, b) => a > b ? a : b);
    final bottom = <double>[
      topLeft.dy,
      topRight.dy,
      bottomLeft.dy,
      bottomRight.dy,
    ].reduce((a, b) => a > b ? a : b);

    return Rect.fromLTRB(left, top, right, bottom);
  }

  static Matrix4 translated(Matrix4 transform, Offset screenDelta) {
    return transform.clone()
      ..translateByDouble(screenDelta.dx, screenDelta.dy, 0, 1);
  }

  static Matrix4 scaledAroundScreenPoint({
    required Matrix4 transform,
    required double scaleDelta,
    required Offset focalPoint,
    double minScale = 0.2,
    double maxScale = 4,
  }) {
    final currentScale = transform.getMaxScaleOnAxis();
    final clampedDelta =
        (currentScale * scaleDelta).clamp(minScale, maxScale) / currentScale;

    return transform.clone()
      ..translateByDouble(focalPoint.dx, focalPoint.dy, 0, 1)
      ..scaleByDouble(clampedDelta, clampedDelta, 1, 1)
      ..translateByDouble(-focalPoint.dx, -focalPoint.dy, 0, 1);
  }
}
