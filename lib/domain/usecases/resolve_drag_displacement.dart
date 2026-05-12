import 'dart:math' as math;
import 'dart:ui';

import '../entities/canvas_node.dart';

class DragDisplacementResolver {
  const DragDisplacementResolver._();

  static const comfortRadius = 80.0;
  static const maxKnockback = 260.0;
  static const settleGap = 24.0;

  static List<CanvasNode> resolveTransient({
    required List<CanvasNode> baselineNodes,
    required String activeNodeId,
    required Offset activeDelta,
  }) {
    final activeBaseline = _nodeById(baselineNodes, activeNodeId);
    if (activeBaseline == null) {
      return baselineNodes;
    }

    final activeNode = activeBaseline.translated(activeDelta);
    final dragDistance = activeDelta.distance;
    final dragDirection = dragDistance == 0
        ? Offset.zero
        : Offset(activeDelta.dx / dragDistance, activeDelta.dy / dragDistance);

    return <CanvasNode>[
      for (final node in baselineNodes)
        if (node.id == activeNodeId)
          activeNode
        else
          node.translated(
            _transientOffsetFor(
              bystander: node,
              activeBaseline: activeBaseline,
              activeNode: activeNode,
              dragDirection: dragDirection,
              dragDistance: dragDistance,
            ),
          ),
    ];
  }

  static List<CanvasNode> settleFinal({
    required List<CanvasNode> baselineNodes,
    required String activeNodeId,
    required Offset activeDelta,
  }) {
    final activeBaseline = _nodeById(baselineNodes, activeNodeId);
    if (activeBaseline == null) {
      return baselineNodes;
    }

    final activeNode = activeBaseline.translated(activeDelta);
    return <CanvasNode>[
      for (final node in baselineNodes)
        if (node.id == activeNodeId)
          activeNode
        else
          node.translated(
            _settleOffsetFor(bystander: node, activeNode: activeNode),
          ),
    ];
  }

  static Offset _transientOffsetFor({
    required CanvasNode bystander,
    required CanvasNode activeBaseline,
    required CanvasNode activeNode,
    required Offset dragDirection,
    required double dragDistance,
  }) {
    if (dragDistance == 0) {
      return Offset.zero;
    }

    final baselineToBystander =
        bystander.visualBounds.center - activeBaseline.visualBounds.center;
    final bystanderProgress = _dot(baselineToBystander, dragDirection);
    final bystanderRadius = _radiusFor(bystander.visualBounds);
    if (dragDistance > bystanderProgress + bystanderRadius) {
      return Offset.zero;
    }

    final activeCenter = activeNode.visualBounds.center;
    final bystanderCenter = bystander.visualBounds.center;
    final away = bystanderCenter - activeCenter;
    final distance = away.distance;
    final activeRadius = _radiusFor(activeNode.visualBounds);
    final targetDistance = activeRadius + bystanderRadius + comfortRadius;
    if (distance >= targetDistance &&
        !activeNode.visualBounds
            .inflate(comfortRadius)
            .overlaps(bystander.visualBounds)) {
      return Offset.zero;
    }

    final direction = distance == 0
        ? Offset(-dragDirection.dy, dragDirection.dx)
        : Offset(away.dx / distance, away.dy / distance);
    final strength = (targetDistance - distance).clamp(0.0, maxKnockback);
    return direction * strength;
  }

  static Offset _settleOffsetFor({
    required CanvasNode bystander,
    required CanvasNode activeNode,
  }) {
    if (!activeNode.visualBounds
        .inflate(settleGap)
        .overlaps(bystander.visualBounds)) {
      return Offset.zero;
    }

    final activeCenter = activeNode.visualBounds.center;
    final bystanderCenter = bystander.visualBounds.center;
    final away = bystanderCenter - activeCenter;
    final distance = away.distance;
    final direction = distance == 0
        ? const Offset(1, 0)
        : Offset(away.dx / distance, away.dy / distance);
    final targetDistance =
        _radiusFor(activeNode.visualBounds) +
        _radiusFor(bystander.visualBounds) +
        settleGap;
    final strength = math.max(0.0, targetDistance - distance);
    return direction * strength;
  }

  static double _radiusFor(Rect rect) {
    return math.sqrt(rect.width * rect.width + rect.height * rect.height) / 2;
  }

  static double _dot(Offset a, Offset b) {
    return a.dx * b.dx + a.dy * b.dy;
  }

  static CanvasNode? _nodeById(List<CanvasNode> nodes, String id) {
    for (final node in nodes) {
      if (node.id == id) {
        return node;
      }
    }
    return null;
  }
}
