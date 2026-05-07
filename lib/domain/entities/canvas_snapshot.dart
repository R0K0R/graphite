import 'canvas_node.dart';
import 'edge.dart';

/// CRDT-ready canvas schema proposal:
///
/// - Document root: map keyed by workspace id.
/// - `nodes`: CRDT map keyed by node id.
/// - Node position: last-writer-wins register for `{x, y}` with actor timestamp.
/// - Node text/content: CRDT text sequence to preserve concurrent edits.
/// - Node metadata: CRDT map for plugin-defined properties.
/// - `edges`: CRDT map keyed by edge id with source/target registers.
/// - `snapshots`: append-only log of materialized graph states for VCS history.
///
/// Runtime CRDT engines such as Loro or Yjs should adapt to this shape at the
/// repository boundary while the domain layer keeps immutable value objects.
class CanvasSnapshot {
  const CanvasSnapshot({
    required this.id,
    required this.createdAt,
    required this.nodes,
    required this.edges,
  });

  final String id;
  final DateTime createdAt;
  final List<CanvasNode> nodes;
  final List<Edge> edges;

  Map<String, CanvasNode> get nodesById {
    return <String, CanvasNode>{for (final node in nodes) node.id: node};
  }

  Map<String, Edge> get edgesById {
    return <String, Edge>{for (final edge in edges) edge.id: edge};
  }
}

class NodeMovement {
  const NodeMovement({
    required this.nodeId,
    required this.before,
    required this.after,
  });

  final String nodeId;
  final CanvasNode before;
  final CanvasNode after;
}

class NodeResize {
  const NodeResize({
    required this.nodeId,
    required this.before,
    required this.after,
  });

  final String nodeId;
  final CanvasNode before;
  final CanvasNode after;
}

class NodeContentChange {
  const NodeContentChange({
    required this.nodeId,
    required this.before,
    required this.after,
  });

  final String nodeId;
  final CanvasNode before;
  final CanvasNode after;
}

class SpatialDiff {
  const SpatialDiff({
    this.addedNodes = const <CanvasNode>[],
    this.removedNodes = const <CanvasNode>[],
    this.movedNodes = const <NodeMovement>[],
    this.resizedNodes = const <NodeResize>[],
    this.changedNodes = const <NodeContentChange>[],
    this.addedEdges = const <Edge>[],
    this.removedEdges = const <Edge>[],
    this.changedEdges = const <Edge>[],
  });

  final List<CanvasNode> addedNodes;
  final List<CanvasNode> removedNodes;
  final List<NodeMovement> movedNodes;
  final List<NodeResize> resizedNodes;
  final List<NodeContentChange> changedNodes;
  final List<Edge> addedEdges;
  final List<Edge> removedEdges;
  final List<Edge> changedEdges;

  bool get isEmpty {
    return addedNodes.isEmpty &&
        removedNodes.isEmpty &&
        movedNodes.isEmpty &&
        resizedNodes.isEmpty &&
        changedNodes.isEmpty &&
        addedEdges.isEmpty &&
        removedEdges.isEmpty &&
        changedEdges.isEmpty;
  }
}
