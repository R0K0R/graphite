import 'dart:math' as math;
import 'dart:ui';

/// Axis-aligned bounding box separation for layout projection.

/// Minimum translation along x or y to resolve overlap between [a] and [b]
/// after inflating both by [minSeparationGap] / 2 (enforces [minSeparationGap]
/// edge clearance when iterated). MTV direction points from [a] toward [b].
///
/// Returns null when inflated rectangles do not overlap.
Offset? minimumTranslationAlongAxis(Rect a, Rect b, double minSeparationGap) {
  if (minSeparationGap <= 0) {
    throw ArgumentError.value(
      minSeparationGap,
      'minSeparationGap',
      'must be > 0',
    );
  }
  final double halfGap = minSeparationGap / 2;
  final Rect ai = a.inflate(halfGap);
  final Rect bi = b.inflate(halfGap);

  final double overlapX =
      math.min(ai.right, bi.right) - math.max(ai.left, bi.left);
  final double overlapY =
      math.min(ai.bottom, bi.bottom) - math.max(ai.top, bi.top);

  if (overlapX <= 0 || overlapY <= 0) {
    return null;
  }

  final double cxA = ai.center.dx;
  final double cxB = bi.center.dx;
  final double sx = cxB >= cxA ? 1.0 : -1.0;

  final double cyA = ai.center.dy;
  final double cyB = bi.center.dy;
  final double sy = cyB >= cyA ? 1.0 : -1.0;

  if (overlapX < overlapY) {
    return Offset(sx * overlapX, 0);
  }
  return Offset(0, sy * overlapY);
}

/// Maximum half-diagonal among [rects] (0 if empty).
double maxDiagonalOfRects(Iterable<Rect> rects) {
  double m = 0;
  for (final r in rects) {
    final double d = math.sqrt(r.width * r.width + r.height * r.height);
    if (d > m) {
      m = d;
    }
  }
  return m;
}
