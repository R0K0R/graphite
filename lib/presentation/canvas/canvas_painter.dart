import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/geometry/canvas_transform.dart';
import '../../domain/entities/canvas_node.dart';
import '../../domain/entities/edge.dart';
import '../../domain/entities/folder_region.dart';
import '../theme/graphite_canvas_style.dart';

/// Stadium (pill) rounding for [bounds] with semicircular short ends.

RRect capsuleFromRect(Rect bounds) {
  final double r = math.min(bounds.width, bounds.height) / 2;
  return RRect.fromRectAndRadius(bounds, Radius.circular(r));
}

class CanvasPainter extends CustomPainter {
  const CanvasPainter({
    required this.nodes,
    required this.edges,
    this.folderRegions = const <FolderRegion>[],
    required this.transform,
    this.selectedNodeId,
    required this.canvasBackground,
    required this.canvasStyle,
    required this.isDark,
    this.presentationNudge = const <String, Offset>{},
  });

  final List<CanvasNode> nodes;
  final List<Edge> edges;
  final List<FolderRegion> folderRegions;
  final Matrix4 transform;
  final String? selectedNodeId;
  final Color canvasBackground;
  final GraphiteCanvasStyle canvasStyle;
  final bool isDark;

  /// Temporary visual offsets keyed by node id (cosmetic bounce).
  final Map<String, Offset> presentationNudge;

  static List<CanvasNode> visibleNodes({
    required List<CanvasNode> nodes,
    required Rect viewportWorldRect,
  }) {
    return nodes
        .where((node) => node.visualBounds.overlaps(viewportWorldRect))
        .toList(growable: false);
  }

  Rect _nodeDrawRect(CanvasNode node) {
    return node.visualBounds.shift(presentationNudge[node.id] ?? Offset.zero);
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
      Paint()..color = canvasBackground,
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
    final Paint paint = Paint()
      ..color = canvasStyle.gridMinor
      ..strokeWidth = 1;
    const gridSize = 80.0;
    final double startX = (viewportWorldRect.left / gridSize).floor() * gridSize;
    final double endX =
        (viewportWorldRect.right / gridSize).ceil() * gridSize;
    final double startY =
        (viewportWorldRect.top / gridSize).floor() * gridSize;
    final double endY =
        (viewportWorldRect.bottom / gridSize).ceil() * gridSize;

    for (var x = startX; x <= endX; x += gridSize) {
      canvas.drawLine(Offset(x, startY), Offset(x, endY), paint);
    }

    for (var y = startY; y <= endY; y += gridSize) {
      canvas.drawLine(Offset(startX, y), Offset(endX, y), paint);
    }

    final Paint major = Paint()
      ..color = canvasStyle.gridMajor
      ..strokeWidth = 2;
    for (var x = startX; x <= endX; x += gridSize * 5) {
      canvas.drawLine(Offset(x, startY), Offset(x, endY), major);
    }
    for (var y = startY; y <= endY; y += gridSize * 5) {
      canvas.drawLine(Offset(startX, y), Offset(endX, y), major);
    }
  }

  void _drawFolderRegions(Canvas canvas, Rect viewportWorldRect) {
    for (final region in folderRegions) {
      final Rect bounds = region.visibleBounds;
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

      final Path capsulePath =
          Path()..addRRect(capsuleFromRect(bounds));

      if (region.isCollapsed) {
        canvas.drawShadow(
          capsulePath,
          canvasStyle.folderShadow.withValues(alpha: 0.5),
          5,
          true,
        );
        canvas.drawPath(capsulePath, paint);
        canvas.drawPath(capsulePath, border);
      } else {
        final RRect rr = RRect.fromRectAndRadius(
          bounds,
          const Radius.circular(28),
        );
        canvas.drawRRect(rr, paint);
        canvas.drawRRect(rr, border);
      }

      final labelPainter = TextPainter(
        text: TextSpan(
          text: region.isCollapsed
              ? _basename(region.relativePath)
              : region.relativePath,
          style: TextStyle(
            color: canvasStyle.folderLabel,
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
      ..color = canvasStyle.edgeColor
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

      final Offset sCenter = source.visualBounds.shift(
              presentationNudge[source.id] ?? Offset.zero,
            ).center;
      final Offset tCenter = target.visualBounds.shift(
              presentationNudge[target.id] ?? Offset.zero,
            ).center;

      final path = Path()
        ..moveTo(sCenter.dx, sCenter.dy)
        ..cubicTo(
          sCenter.dx + 80,
          sCenter.dy,
          tCenter.dx - 80,
          tCenter.dy,
          tCenter.dx,
          tCenter.dy,
        );
      canvas.drawPath(path, paint);

      if (edge.directed) {
        _drawArrowHead(canvas, sCenter, tCenter, paint);
      }

      if (edge.label.isNotEmpty) {
        _drawEdgeLabel(canvas, edge, (sCenter + tCenter) / 2);
      }
    }
  }

  void _drawArrowHead(
    Canvas canvas,
    Offset source,
    Offset target,
    Paint paint,
  ) {
    final double angle =
        math.atan2(target.dy - source.dy, target.dx - source.dx);
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
    final Color fg = canvasStyle.folderLabel;
    final Color bg = canvasBackground.withValues(alpha: isDark ? 0.94 : 0.98);

    final textPainter = TextPainter(
      text: TextSpan(
        text: edge.label,
        style: TextStyle(
          color: fg,
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
      Paint()..color = bg,
    );
    textPainter.paint(canvas, labelRect.topLeft + const Offset(8, 4));
  }

  void _drawNode(Canvas canvas, CanvasNode node, {required bool isSelected}) {
    final Rect rect = _nodeDrawRect(node);
    if (node.isCollapsed) {
      _drawCollapsedNode(canvas, node, rect, isSelected: isSelected);
      return;
    }

    final Color fillSel =
        isDark ? const Color(0xff1e3a5f) : const Color(0xffdbeafe);
    final Color fill =
        isSelected ? fillSel : (isDark ? const Color(0xff1e293b) : Colors.white);
    final Color stroke =
        isSelected ? const Color(0xff2563eb) : (isDark ? const Color(0xff475569) : const Color(0xffcbd5e1));

    final roundedRect =
        RRect.fromRectAndRadius(rect, const Radius.circular(18));
    final fillPaint = Paint()..color = fill;
    final strokePaint = Paint()
      ..color = stroke
      ..style = PaintingStyle.stroke
      ..strokeWidth = isSelected ? 3 : 1.5;

    canvas.drawShadow(Path()..addRRect(roundedRect), Colors.black, 6, true);
    canvas.drawRRect(roundedRect, fillPaint);
    canvas.drawRRect(roundedRect, strokePaint);

    final Color titleFg = isDark ? const Color(0xfff1f5f9) : const Color(0xff0f172a);

    final titlePainter = TextPainter(
      text: TextSpan(
        text: node.title,
        style: TextStyle(
          color: titleFg,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      maxLines: 1,
      ellipsis: '...',
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: rect.width - 32);

    final Color bodyFg =
        isDark ? const Color(0xff94a3b8) : const Color(0xff475569);

    final contentPainter = TextPainter(
      text: TextSpan(
        text: node.content,
        style: TextStyle(
          color: bodyFg,
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
    final RRect capsule = capsuleFromRect(rect);
    final Color fillSel =
        isDark ? const Color(0xff1e3a5f) : const Color(0xffdbeafe);
    final Color fill =
        isSelected ? fillSel : (isDark ? const Color(0xff1e293b) : Colors.white);
    final Color stroke = isSelected
        ? const Color(0xff2563eb)
        : (isDark ? const Color(0xff64748b) : const Color(0xff94a3b8));
    final fillPaint = Paint()..color = fill;
    final strokePaint = Paint()
      ..color = stroke
      ..style = PaintingStyle.stroke
      ..strokeWidth = isSelected ? 3 : 1.5;

    canvas.drawShadow(Path()..addRRect(capsule), Colors.black, 4, true);
    canvas.drawRRect(capsule, fillPaint);
    canvas.drawRRect(capsule, strokePaint);

    final Color titleFg = isDark ? const Color(0xfff1f5f9) : const Color(0xff0f172a);

    final titlePainter = TextPainter(
      text: TextSpan(
        text: node.title,
        style: TextStyle(
          color: titleFg,
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
        oldDelegate.selectedNodeId != selectedNodeId ||
        oldDelegate.canvasBackground != canvasBackground ||
        oldDelegate.canvasStyle != canvasStyle ||
        oldDelegate.isDark != isDark ||
        oldDelegate.presentationNudge != presentationNudge;
  }
}
