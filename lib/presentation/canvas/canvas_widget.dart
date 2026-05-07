import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/geometry/canvas_transform.dart';
import 'canvas_controller.dart';
import 'canvas_painter.dart';

class CanvasWidget extends ConsumerStatefulWidget {
  const CanvasWidget({super.key});

  @override
  ConsumerState<CanvasWidget> createState() => _CanvasWidgetState();
}

class _CanvasWidgetState extends ConsumerState<CanvasWidget> {
  String? _draggingNodeId;
  Offset? _lastDragWorldPosition;
  double _lastScale = 1;

  @override
  Widget build(BuildContext context) {
    final canvasState = ref.watch(canvasControllerProvider);
    final controller = ref.read(canvasControllerProvider.notifier);

    return Listener(
      onPointerSignal: (event) {
        if (event is PointerScrollEvent) {
          final scaleDelta = event.scrollDelta.dy > 0 ? 0.9 : 1.1;
          controller.zoom(
            scaleDelta: scaleDelta,
            focalPoint: event.localPosition,
          );
        }
      },
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onScaleStart: (details) {
          _lastScale = 1;
          final worldPosition = CanvasTransform.screenToWorld(
            canvasState.transform,
            details.localFocalPoint,
          );
          _draggingNodeId = controller.hitTestNode(worldPosition);
          _lastDragWorldPosition = worldPosition;
          controller.selectNode(_draggingNodeId);
        },
        onScaleUpdate: (details) {
          final isZooming = details.scale != 1;

          if (isZooming) {
            final scaleDelta = details.scale / _lastScale;
            _lastScale = details.scale;
            controller.zoom(
              scaleDelta: scaleDelta,
              focalPoint: details.localFocalPoint,
            );
            return;
          }

          if (_draggingNodeId != null && _lastDragWorldPosition != null) {
            final latestState = ref.read(canvasControllerProvider);
            final worldPosition = CanvasTransform.screenToWorld(
              latestState.transform,
              details.localFocalPoint,
            );
            controller.dragNode(
              nodeId: _draggingNodeId!,
              worldDelta: worldPosition - _lastDragWorldPosition!,
            );
            _lastDragWorldPosition = worldPosition;
          } else {
            controller.pan(details.focalPointDelta);
          }
        },
        onScaleEnd: (_) {
          _draggingNodeId = null;
          _lastDragWorldPosition = null;
          _lastScale = 1;
        },
        child: CustomPaint(
          painter: CanvasPainter(
            nodes: canvasState.nodes,
            edges: canvasState.edges,
            transform: canvasState.transform,
            selectedNodeId: canvasState.selectedNodeId,
          ),
          child: const SizedBox.expand(),
        ),
      ),
    );
  }
}
