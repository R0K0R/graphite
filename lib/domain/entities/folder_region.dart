import 'dart:ui';

class FolderRegion {
  const FolderRegion({
    required this.relativePath,
    required this.bounds,
    required this.color,
    this.isCollapsed = true,
  });

  static const collapsedHeight = 72.0;

  final String relativePath;
  final Rect bounds;
  final Color color;
  final bool isCollapsed;

  Rect get visibleBounds {
    if (!isCollapsed) {
      return bounds;
    }
    final height = bounds.height < collapsedHeight
        ? bounds.height
        : collapsedHeight;
    return Rect.fromLTWH(bounds.left, bounds.top, bounds.width, height);
  }

  bool containsRelativePath(String path) {
    return path == relativePath || path.startsWith('$relativePath/');
  }

  FolderRegion copyWith({Rect? bounds, Color? color, bool? isCollapsed}) {
    return FolderRegion(
      relativePath: relativePath,
      bounds: bounds ?? this.bounds,
      color: color ?? this.color,
      isCollapsed: isCollapsed ?? this.isCollapsed,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is FolderRegion &&
        other.relativePath == relativePath &&
        other.bounds == bounds &&
        other.color == color &&
        other.isCollapsed == isCollapsed;
  }

  @override
  int get hashCode {
    return Object.hash(relativePath, bounds, color, isCollapsed);
  }
}
