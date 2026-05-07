class Edge {
  const Edge({
    required this.id,
    required this.sourceNodeId,
    required this.targetNodeId,
    this.label = '',
    this.directed = true,
    this.metadata = const <String, Object?>{},
  });

  final String id;
  final String sourceNodeId;
  final String targetNodeId;
  final String label;
  final bool directed;
  final Map<String, Object?> metadata;

  Edge copyWith({
    String? id,
    String? sourceNodeId,
    String? targetNodeId,
    String? label,
    bool? directed,
    Map<String, Object?>? metadata,
  }) {
    return Edge(
      id: id ?? this.id,
      sourceNodeId: sourceNodeId ?? this.sourceNodeId,
      targetNodeId: targetNodeId ?? this.targetNodeId,
      label: label ?? this.label,
      directed: directed ?? this.directed,
      metadata: metadata ?? this.metadata,
    );
  }

  Map<String, Object?> toJson() {
    return <String, Object?>{
      'id': id,
      'sourceNodeId': sourceNodeId,
      'targetNodeId': targetNodeId,
      'label': label,
      'directed': directed,
      'metadata': metadata,
    };
  }

  factory Edge.fromJson(Map<String, Object?> json) {
    final metadata = json['metadata'];
    return Edge(
      id: json['id'] as String,
      sourceNodeId: json['sourceNodeId'] as String,
      targetNodeId: json['targetNodeId'] as String,
      label: (json['label'] as String?) ?? '',
      directed: (json['directed'] as bool?) ?? true,
      metadata: metadata is Map<String, Object?>
          ? metadata
          : const <String, Object?>{},
    );
  }

  @override
  bool operator ==(Object other) {
    return other is Edge &&
        other.id == id &&
        other.sourceNodeId == sourceNodeId &&
        other.targetNodeId == targetNodeId &&
        other.label == label &&
        other.directed == directed;
  }

  @override
  int get hashCode {
    return Object.hash(id, sourceNodeId, targetNodeId, label, directed);
  }
}
