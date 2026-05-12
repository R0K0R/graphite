import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/geometry/canvas_transform.dart';
import '../../domain/entities/canvas_node.dart';
import '../../domain/entities/edge.dart';
import '../../domain/entities/folder_region.dart';

class CanvasPainter extends CustomPainter {
  const CanvasPainter({
    required this.nodes,
    required this.edges,
    this.folderRegions = const <FolderRegion>[],
    required this.transform,
    this.selectedNodeId,
  });

  final List<CanvasNode> nodes;
  final List<Edge> edges;
  final List<FolderRegion> folderRegions;
  final Matrix4 transform;
  final String? selectedNodeId;

  static List<CanvasNode> visibleNodes({
    required List<CanvasNode> nodes,
    required Rect viewportWorldRect,
  }) {
    return nodes
        .where((node) => node.visualBounds.overlaps(viewportWorldRect))
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
    _drawFolderRegions(canvas, viewportWorldRect);
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

  void _drawFolderRegions(Canvas canvas, Rect viewportWorldRect) {
    for (final region in folderRegions) {
      final bounds = region.visibleBounds;
      if (!bounds.overlaps(viewportWorldRect)) {
        continue;
      }
      final paint = Paint()
        ..color = region.color.withValues(alpha: 0.35)
        ..style = PaintingStyle.fill;
      final border = Paint()
        ..color = region.color.withValues(alpha: 0.9)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3;
      if (region.isCollapsed) {
        canvas.drawShadow(Path()..addOval(bounds), Colors.black, 5, true);
        canvas.drawOval(bounds, paint);
        canvas.drawOval(bounds, border);
      } else {
        final roundedRect = RRect.fromRectAndRadius(
          bounds,
          const Radius.circular(28),
        );
        canvas.drawRRect(roundedRect, paint);
        canvas.drawRRect(roundedRect, border);
      }

      final labelPainter =
          TextPainter(
            text: TextSpan(
              text: region.isCollapsed
                  ? _basename(region.relativePath)
                  : region.relativePath,
              style: const TextStyle(
                color: Color(0xff334155),
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
            textDirection: TextDirection.ltr,
            maxLines: region.isCollapsed ? 1 : null,
            ellipsis: region.isCollapsed ? '...' : null,
          )..layout(
            maxWidth: region.isCollapsed
                ? bounds.width - 16
                : bounds.width - 96,
          );
      final labelOffset = region.isCollapsed
          ? Offset(
              bounds.left + (bounds.width - labelPainter.width) / 2,
              bounds.top + (bounds.height - labelPainter.height) / 2,
            )
          : bounds.topLeft + const Offset(24, 18);
      labelPainter.paint(canvas, labelOffset);
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
    final rect = node.visualBounds;
    if (node.isCollapsed) {
      _drawCollapsedNode(canvas, node, rect, isSelected: isSelected);
      return;
    }
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

  void _drawCollapsedNode(
    Canvas canvas,
    CanvasNode node,
    Rect rect, {
    required bool isSelected,
  }) {
    final roundedRect = RRect.fromRectAndRadius(
      rect,
      const Radius.circular(28),
    );
    final fillPaint = Paint()
      ..color = isSelected ? const Color(0xffdbeafe) : const Color(0xffffffff);
    final strokePaint = Paint()
      ..color = isSelected ? const Color(0xff2563eb) : const Color(0xff94a3b8)
      ..style = PaintingStyle.stroke
      ..strokeWidth = isSelected ? 3 : 1.5;

    canvas.drawShadow(Path()..addRRect(roundedRect), Colors.black, 4, true);
    canvas.drawRRect(roundedRect, fillPaint);
    canvas.drawRRect(roundedRect, strokePaint);

    final titlePainter = TextPainter(
      text: TextSpan(
        text: node.title,
        style: const TextStyle(
          color: Color(0xff0f172a),
          fontSize: 13,
          fontWeight: FontWeight.w800,
        ),
      ),
      maxLines: 1,
      ellipsis: '...',
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: rect.width - 28);
    titlePainter.paint(
      canvas,
      Offset(
        rect.left + (rect.width - titlePainter.width) / 2,
        rect.top + (rect.height - titlePainter.height) / 2,
      ),
    );
  }

  String _basename(String path) {
    final parts = path.split('/');
    return parts.isEmpty ? path : parts.last;
  }

  @override
  bool shouldRepaint(covariant CanvasPainter oldDelegate) {
    return oldDelegate.nodes != nodes ||
        oldDelegate.edges != edges ||
        oldDelegate.folderRegions != folderRegions ||
        oldDelegate.transform != transform ||
        oldDelegate.selectedNodeId != selectedNodeId;
  }
}
