import 'dart:ui';

enum CanvasNodeType { note, code, flowchart, mindMap, ink }

class CanvasNode {
  const CanvasNode({
    required this.id,
    required this.title,
    required this.position,
    required this.size,
    this.content = '',
    this.type = CanvasNodeType.note,
    this.metadata = const <String, Object?>{},
    this.isCollapsed = false,
  });

  static const collapsedSize = Size(160, 56);

  final String id;
  final String title;
  final String content;
  final CanvasNodeType type;
  final Offset position;
  final Size size;
  final Map<String, Object?> metadata;
  final bool isCollapsed;

  Rect get bounds => position & size;

  Rect get visualBounds {
    if (!isCollapsed) {
      return bounds;
    }
    return Rect.fromCenter(
      center: bounds.center,
      width: collapsedSize.width,
      height: collapsedSize.height,
    );
  }

  Offset get center => visualBounds.center;

  bool containsWorldPoint(Offset worldPoint) {
    return visualBounds.contains(worldPoint);
  }

  CanvasNode translated(Offset delta) {
    return copyWith(position: position + delta);
  }

  CanvasNode copyWith({
    String? id,
    String? title,
    String? content,
    CanvasNodeType? type,
    Offset? position,
    Size? size,
    Map<String, Object?>? metadata,
    bool? isCollapsed,
  }) {
    return CanvasNode(
      id: id ?? this.id,
      title: title ?? this.title,
      content: content ?? this.content,
      type: type ?? this.type,
      position: position ?? this.position,
      size: size ?? this.size,
      metadata: metadata ?? this.metadata,
      isCollapsed: isCollapsed ?? this.isCollapsed,
    );
  }

  Map<String, Object?> toJson() {
    return <String, Object?>{
      'id': id,
      'title': title,
      'content': content,
      'type': type.name,
      'x': position.dx,
      'y': position.dy,
      'width': size.width,
      'height': size.height,
      'collapsed': isCollapsed,
      'metadata': metadata,
    };
  }

  factory CanvasNode.fromJson(Map<String, Object?> json) {
    final metadata = json['metadata'];
    return CanvasNode(
      id: json['id'] as String,
      title: (json['title'] as String?) ?? 'Untitled',
      content: (json['content'] as String?) ?? '',
      type: CanvasNodeType.values.byName(
        (json['type'] as String?) ?? CanvasNodeType.note.name,
      ),
      position: Offset(
        (json['x'] as num).toDouble(),
        (json['y'] as num).toDouble(),
      ),
      size: Size(
        (json['width'] as num).toDouble(),
        (json['height'] as num).toDouble(),
      ),
      isCollapsed: (json['collapsed'] as bool?) ?? false,
      metadata: metadata is Map<String, Object?>
          ? metadata
          : const <String, Object?>{},
    );
  }

  @override
  bool operator ==(Object other) {
    return other is CanvasNode &&
        other.id == id &&
        other.title == title &&
        other.content == content &&
        other.type == type &&
        other.position == position &&
        other.size == size &&
        other.isCollapsed == isCollapsed;
  }

  @override
  int get hashCode {
    return Object.hash(id, title, content, type, position, size, isCollapsed);
  }
}
