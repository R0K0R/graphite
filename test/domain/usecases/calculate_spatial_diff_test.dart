import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:graphite/domain/entities/canvas_node.dart';
import 'package:graphite/domain/entities/canvas_snapshot.dart';
import 'package:graphite/domain/entities/edge.dart';
import 'package:graphite/domain/usecases/calculate_spatial_diff.dart';

void main() {
  test('detects node movement, content changes, and edge additions', () {
    final beforeNode = _node(id: 'a', position: Offset.zero, content: 'old');
    final afterNode = beforeNode.copyWith(
      position: const Offset(20, 10),
      content: 'new',
    );

    final before = CanvasSnapshot(
      id: 'before',
      createdAt: DateTime(2026),
      nodes: <CanvasNode>[beforeNode],
      edges: const <Edge>[],
    );
    final after = CanvasSnapshot(
      id: 'after',
      createdAt: DateTime(2026, 1, 2),
      nodes: <CanvasNode>[
        afterNode,
        _node(id: 'b', position: const Offset(1, 1)),
      ],
      edges: const <Edge>[Edge(id: 'ab', sourceNodeId: 'a', targetNodeId: 'b')],
    );

    final diff = const CalculateSpatialDiff()(before: before, after: after);

    expect(diff.movedNodes.single.nodeId, 'a');
    expect(diff.changedNodes.single.nodeId, 'a');
    expect(diff.addedNodes.single.id, 'b');
    expect(diff.addedEdges.single.id, 'ab');
  });
}

CanvasNode _node({
  required String id,
  required Offset position,
  String content = '',
}) {
  return CanvasNode(
    id: id,
    title: id,
    content: content,
    position: position,
    size: const Size(100, 80),
  );
}
