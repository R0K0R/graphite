import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/geometry/canvas_transform.dart';
import '../../domain/entities/canvas_node.dart';
import '../../domain/entities/edge.dart';

class CanvasPainter extends CustomPainter {
  const CanvasPainter({
    required this.nodes,
    required this.edges,
    required this.transform,
    this.selectedNodeId,
  });

  final List<CanvasNode> nodes;
  final List<Edge> edges;
  final Matrix4 transform;
  final String? selectedNodeId;

  static List<CanvasNode> visibleNodes({
    required List<CanvasNode> nodes,
    required Rect viewportWorldRect,
  }) {
    return nodes
        .where((node) => node.bounds.overlaps(viewportWorldRect))
        .toList(growable: false);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final viewportWorldRect = CanvasTransform.screenRectToWorld(
      transform,
      Offset.zero & size,
    ).inflate(320);
    final nodeMap = <String, CanvasNode>{
      for (final node in nodes) node.id: node,
    };
    final culledNodes = visibleNodes(
      nodes: nodes,
      viewportWorldRect: viewportWorldRect,
    );
    final visibleNodeIds = culledNodes.map((node) => node.id).toSet();

    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xfff8fafc),
    );

    canvas.save();
    canvas.transform(transform.storage);
    _drawGrid(canvas, viewportWorldRect);
    _drawEdges(canvas, nodeMap, visibleNodeIds);
    for (final node in culledNodes) {
      _drawNode(canvas, node, isSelected: node.id == selectedNodeId);
    }
    canvas.restore();
  }

  void _drawGrid(Canvas canvas, Rect viewportWorldRect) {
    final paint = Paint()
      ..color = const Color(0xffe2e8f0)
      ..strokeWidth = 1;
    const gridSize = 80.0;
    final startX = (viewportWorldRect.left / gridSize).floor() * gridSize;
    final endX = (viewportWorldRect.right / gridSize).ceil() * gridSize;
    final startY = (viewportWorldRect.top / gridSize).floor() * gridSize;
    final endY = (viewportWorldRect.bottom / gridSize).ceil() * gridSize;

    for (var x = startX; x <= endX; x += gridSize) {
      canvas.drawLine(Offset(x, startY), Offset(x, endY), paint);
    }

    for (var y = startY; y <= endY; y += gridSize) {
      canvas.drawLine(Offset(startX, y), Offset(endX, y), paint);
    }
  }

  void _drawEdges(
    Canvas canvas,
    Map<String, CanvasNode> nodeMap,
    Set<String> visibleNodeIds,
  ) {
    final paint = Paint()
      ..color = const Color(0xff64748b)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    for (final edge in edges) {
      final source = nodeMap[edge.sourceNodeId];
      final target = nodeMap[edge.targetNodeId];
      if (source == null || target == null) {
        continue;
      }
      if (!visibleNodeIds.contains(source.id) &&
          !visibleNodeIds.contains(target.id)) {
        continue;
      }

      final path = Path()
        ..moveTo(source.center.dx, source.center.dy)
        ..cubicTo(
          source.center.dx + 80,
          source.center.dy,
          target.center.dx - 80,
          target.center.dy,
          target.center.dx,
          target.center.dy,
        );
      canvas.drawPath(path, paint);

      if (edge.directed) {
        _drawArrowHead(canvas, source.center, target.center, paint);
      }

      if (edge.label.isNotEmpty) {
        _drawEdgeLabel(canvas, edge, (source.center + target.center) / 2);
      }
    }
  }

  void _drawArrowHead(
    Canvas canvas,
    Offset source,
    Offset target,
    Paint paint,
  ) {
    final angle = math.atan2(target.dy - source.dy, target.dx - source.dx);
    const arrowLength = 12.0;
    const arrowSpread = math.pi / 7;
    final first = target.translate(
      -math.cos(angle - arrowSpread) * arrowLength,
      -math.sin(angle - arrowSpread) * arrowLength,
    );
    final second = target.translate(
      -math.cos(angle + arrowSpread) * arrowLength,
      -math.sin(angle + arrowSpread) * arrowLength,
    );

    canvas.drawLine(target, first, paint);
    canvas.drawLine(target, second, paint);
  }

  void _drawEdgeLabel(Canvas canvas, Edge edge, Offset center) {
    final textPainter = TextPainter(
      text: TextSpan(
        text: edge.label,
        style: const TextStyle(
          color: Color(0xff475569),
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: 140);

    final labelRect = Rect.fromCenter(
      center: center,
      width: textPainter.width + 16,
      height: textPainter.height + 8,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(labelRect, const Radius.circular(10)),
      Paint()..color = const Color(0xfff8fafc),
    );
    textPainter.paint(canvas, labelRect.topLeft + const Offset(8, 4));
  }

  void _drawNode(Canvas canvas, CanvasNode node, {required bool isSelected}) {
    final rect = node.bounds;
    final roundedRect = RRect.fromRectAndRadius(
      rect,
      const Radius.circular(18),
    );
    final fillPaint = Paint()
      ..color = isSelected ? const Color(0xffdbeafe) : const Color(0xffffffff);
    final strokePaint = Paint()
      ..color = isSelected ? const Color(0xff2563eb) : const Color(0xffcbd5e1)
      ..style = PaintingStyle.stroke
      ..strokeWidth = isSelected ? 3 : 1.5;

    canvas.drawShadow(Path()..addRRect(roundedRect), Colors.black, 6, true);
    canvas.drawRRect(roundedRect, fillPaint);
    canvas.drawRRect(roundedRect, strokePaint);

    final titlePainter = TextPainter(
      text: TextSpan(
        text: node.title,
        style: const TextStyle(
          color: Color(0xff0f172a),
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      maxLines: 1,
      ellipsis: '...',
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: rect.width - 32);

    final contentPainter = TextPainter(
      text: TextSpan(
        text: node.content,
        style: const TextStyle(
          color: Color(0xff475569),
          fontSize: 13,
          height: 1.35,
        ),
      ),
      maxLines: 4,
      ellipsis: '...',
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: rect.width - 32);

    titlePainter.paint(canvas, rect.topLeft + const Offset(16, 16));
    contentPainter.paint(canvas, rect.topLeft + const Offset(16, 48));
  }

  @override
  bool shouldRepaint(covariant CanvasPainter oldDelegate) {
    return oldDelegate.nodes != nodes ||
        oldDelegate.edges != edges ||
        oldDelegate.transform != transform ||
        oldDelegate.selectedNodeId != selectedNodeId;
  }
}
