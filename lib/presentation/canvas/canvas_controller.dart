import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/geometry/canvas_transform.dart';
import '../../domain/entities/canvas_node.dart';

final canvasControllerProvider =
    NotifierProvider<CanvasController, CanvasState>(CanvasController.new);

class CanvasState {
  CanvasState({required this.transform, this.selectedNodeId});

  final Matrix4 transform;
  final String? selectedNodeId;

  factory CanvasState.initial() {
    return CanvasState(transform: CanvasTransform.identity());
  }

  CanvasState copyWith({
    Matrix4? transform,
    String? selectedNodeId,
    bool clearSelection = false,
  }) {
    return CanvasState(
      transform: transform ?? this.transform.clone(),
      selectedNodeId: clearSelection
          ? null
          : selectedNodeId ?? this.selectedNodeId,
    );
  }
}

class CanvasController extends Notifier<CanvasState> {
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

  String? hitTestNode(List<CanvasNode> nodes, Offset worldPoint) {
    for (final node in nodes.reversed) {
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
}
