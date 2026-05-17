/// Tunable knobs for iterative rectangle separation (canvas node repel).
class RectangleLayoutConfig {
  const RectangleLayoutConfig({
    this.minSeparationGap = 24,
    this.transientIterations = 6,
    this.finalizeIterations = 26,
    this.maxDisplacementPerIteration = 200,
    this.spatialCutoffMultiplier = 8,
    this.treatFoldersAsObstacles = true,
    this.folderExtraInflate = 8,
  });

  /// Desired minimum clearance between rectangle edges after solving.
  final double minSeparationGap;

  /// Gauss–Seidel passes applied each drag frame while moving a node.
  final int transientIterations;

  /// Passes applied when the drag gesture ends (higher ⇒ tighter convergence).
  final int finalizeIterations;

  /// Clamp on each pairwise correction magnitude (pixels) for stability.
  final double maxDisplacementPerIteration;

  /// Skip pairwise checks when bbox centre distance exceeds
  /// `multiplier × maxDiagonal` among movable node bounds (cheap culling).
  final double spatialCutoffMultiplier;

  /// When true, collapsed/expanded folder [visibleBounds] act as pinned
  /// obstacles; nodes sliding under folder chrome are rejected outward.
  final bool treatFoldersAsObstacles;

  /// Expand folder obstacle rects by this delta for comfortable padding.
  final double folderExtraInflate;

  RectangleLayoutConfig copyWith({
    double? minSeparationGap,
    int? transientIterations,
    int? finalizeIterations,
    double? maxDisplacementPerIteration,
    double? spatialCutoffMultiplier,
    bool? treatFoldersAsObstacles,
    double? folderExtraInflate,
  }) {
    return RectangleLayoutConfig(
      minSeparationGap: minSeparationGap ?? this.minSeparationGap,
      transientIterations: transientIterations ?? this.transientIterations,
      finalizeIterations: finalizeIterations ?? this.finalizeIterations,
      maxDisplacementPerIteration:
          maxDisplacementPerIteration ?? this.maxDisplacementPerIteration,
      spatialCutoffMultiplier:
          spatialCutoffMultiplier ?? this.spatialCutoffMultiplier,
      treatFoldersAsObstacles:
          treatFoldersAsObstacles ?? this.treatFoldersAsObstacles,
      folderExtraInflate: folderExtraInflate ?? this.folderExtraInflate,
    );
  }

  /// Default preset used across the app (settings may override persisted values).
  static const RectangleLayoutConfig defaults = RectangleLayoutConfig();
}
