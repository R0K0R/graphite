import 'package:uuid/uuid.dart';

import '../entities/canvas_node.dart';
import '../entities/canvas_snapshot.dart';
import '../entities/edge.dart';

class CreateCanvasSnapshot {
  CreateCanvasSnapshot({Uuid? uuid}) : _uuid = uuid ?? const Uuid();

  final Uuid _uuid;

  CanvasSnapshot call({
    required List<CanvasNode> nodes,
    required List<Edge> edges,
    DateTime? createdAt,
  }) {
    return CanvasSnapshot(
      id: _uuid.v4(),
      createdAt: createdAt ?? DateTime.now(),
      nodes: List<CanvasNode>.unmodifiable(nodes),
      edges: List<Edge>.unmodifiable(edges),
    );
  }
}
