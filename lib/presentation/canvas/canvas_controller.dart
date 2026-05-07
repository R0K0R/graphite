import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/geometry/canvas_transform.dart';
import '../../domain/entities/canvas_node.dart';
import '../../domain/entities/canvas_snapshot.dart';
import '../../domain/entities/edge.dart';
import '../../domain/entities/flowchart_graph.dart';
import '../../domain/usecases/create_canvas_snapshot.dart';

final canvasControllerProvider =
    NotifierProvider<CanvasController, CanvasState>(CanvasController.new);

class CanvasState {
  CanvasState({
    required List<CanvasNode> nodes,
    required List<Edge> edges,
    required this.transform,
    this.selectedNodeId,
  }) : nodes = List<CanvasNode>.unmodifiable(nodes),
       edges = List<Edge>.unmodifiable(edges);

  final List<CanvasNode> nodes;
  final List<Edge> edges;
  final Matrix4 transform;
  final String? selectedNodeId;

  factory CanvasState.initial() {
    return CanvasState(
      transform: CanvasTransform.identity(),
      nodes: const <CanvasNode>[
        CanvasNode(
          id: 'welcome',
          title: 'Graphite Canvas',
          content: 'Pan, zoom, and drag spatial notes.',
          type: CanvasNodeType.note,
          position: Offset(-160, -80),
          size: Size(260, 140),
        ),
        CanvasNode(
          id: 'code-flow',
          title: 'AI Flowchart',
          content: 'Generate canvas nodes from code snippets.',
          type: CanvasNodeType.flowchart,
          position: Offset(180, 40),
          size: Size(260, 140),
        ),
      ],
      edges: const <Edge>[
        Edge(
          id: 'welcome-code-flow',
          sourceNodeId: 'welcome',
          targetNodeId: 'code-flow',
          label: 'visualize',
        ),
      ],
    );
  }

  CanvasState copyWith({
    List<CanvasNode>? nodes,
    List<Edge>? edges,
    Matrix4? transform,
    String? selectedNodeId,
    bool clearSelection = false,
  }) {
    return CanvasState(
      nodes: nodes ?? this.nodes,
      edges: edges ?? this.edges,
      transform: transform ?? this.transform.clone(),
      selectedNodeId: clearSelection
          ? null
          : selectedNodeId ?? this.selectedNodeId,
    );
  }
}

class CanvasController extends Notifier<CanvasState> {
  final _uuid = const Uuid();
  final _createSnapshot = CreateCanvasSnapshot();

  @override
  CanvasState build() => CanvasState.initial();

  void pan(Offset screenDelta) {
    state = state.copyWith(
      transform: CanvasTransform.translated(state.transform, screenDelta),
    );
  }

  void zoom({required double scaleDelta, required Offset focalPoint}) {
    state = state.copyWith(
      transform: CanvasTransform.scaledAroundScreenPoint(
        transform: state.transform,
        scaleDelta: scaleDelta,
        focalPoint: focalPoint,
      ),
    );
  }

  String? hitTestNode(Offset worldPoint) {
    for (final node in state.nodes.reversed) {
      if (node.containsWorldPoint(worldPoint)) {
        return node.id;
      }
    }
    return null;
  }

  void selectNode(String? nodeId) {
    state = state.copyWith(
      selectedNodeId: nodeId,
      clearSelection: nodeId == null,
    );
  }

  void dragNode({required String nodeId, required Offset worldDelta}) {
    state = state.copyWith(
      nodes: <CanvasNode>[
        for (final node in state.nodes)
          if (node.id == nodeId) node.translated(worldDelta) else node,
      ],
      selectedNodeId: nodeId,
    );
  }

  CanvasNode addNode({
    required String title,
    required Offset position,
    String content = '',
    CanvasNodeType type = CanvasNodeType.note,
    Size size = const Size(220, 120),
  }) {
    final node = CanvasNode(
      id: _uuid.v4(),
      title: title,
      content: content,
      type: type,
      position: position,
      size: size,
    );

    state = state.copyWith(nodes: <CanvasNode>[...state.nodes, node]);
    return node;
  }

  void mergeFlowchart(FlowchartGraph graph) {
    state = state.copyWith(
      nodes: <CanvasNode>[...state.nodes, ...graph.nodes],
      edges: <Edge>[...state.edges, ...graph.edges],
    );
  }

  CanvasSnapshot createSnapshot() {
    return _createSnapshot(nodes: state.nodes, edges: state.edges);
  }
}
