import '../entities/canvas_node.dart';
import '../entities/canvas_snapshot.dart';
import '../entities/edge.dart';

class CalculateSpatialDiff {
  const CalculateSpatialDiff();

  SpatialDiff call({
    required CanvasSnapshot before,
    required CanvasSnapshot after,
  }) {
    final beforeNodes = before.nodesById;
    final afterNodes = after.nodesById;
    final beforeEdges = before.edgesById;
    final afterEdges = after.edgesById;

    final addedNodes = <CanvasNode>[];
    final removedNodes = <CanvasNode>[];
    final movedNodes = <NodeMovement>[];
    final resizedNodes = <NodeResize>[];
    final changedNodes = <NodeContentChange>[];
    final addedEdges = <Edge>[];
    final removedEdges = <Edge>[];
    final changedEdges = <Edge>[];

    for (final entry in afterNodes.entries) {
      final oldNode = beforeNodes[entry.key];
      final newNode = entry.value;

      if (oldNode == null) {
        addedNodes.add(newNode);
        continue;
      }

      if (oldNode.position != newNode.position) {
        movedNodes.add(
          NodeMovement(nodeId: entry.key, before: oldNode, after: newNode),
        );
      }

      if (oldNode.size != newNode.size) {
        resizedNodes.add(
          NodeResize(nodeId: entry.key, before: oldNode, after: newNode),
        );
      }

      if (_contentChanged(oldNode, newNode)) {
        changedNodes.add(
          NodeContentChange(nodeId: entry.key, before: oldNode, after: newNode),
        );
      }
    }

    for (final entry in beforeNodes.entries) {
      if (!afterNodes.containsKey(entry.key)) {
        removedNodes.add(entry.value);
      }
    }

    for (final entry in afterEdges.entries) {
      final oldEdge = beforeEdges[entry.key];
      final newEdge = entry.value;

      if (oldEdge == null) {
        addedEdges.add(newEdge);
      } else if (oldEdge != newEdge) {
        changedEdges.add(newEdge);
      }
    }

    for (final entry in beforeEdges.entries) {
      if (!afterEdges.containsKey(entry.key)) {
        removedEdges.add(entry.value);
      }
    }

    return SpatialDiff(
      addedNodes: addedNodes,
      removedNodes: removedNodes,
      movedNodes: movedNodes,
      resizedNodes: resizedNodes,
      changedNodes: changedNodes,
      addedEdges: addedEdges,
      removedEdges: removedEdges,
      changedEdges: changedEdges,
    );
  }

  bool _contentChanged(CanvasNode before, CanvasNode after) {
    return before.title != after.title ||
        before.content != after.content ||
        before.type != after.type;
  }
}
