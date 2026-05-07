import 'dart:ui';

import 'package:uuid/uuid.dart';

import '../../core/errors/app_exception.dart';
import '../../domain/entities/canvas_node.dart';
import '../../domain/entities/edge.dart';
import '../../domain/entities/flowchart_graph.dart';

class FlowchartGraphModel {
  const FlowchartGraphModel._();

  static FlowchartGraph fromJson(
    Map<String, Object?> json, {
    Uuid uuid = const Uuid(),
  }) {
    final nodesJson = json['nodes'];
    final edgesJson = json['edges'];

    if (nodesJson is! List) {
      throw const AppException('LLM response must include a nodes array.');
    }

    final nodes = nodesJson
        .whereType<Map>()
        .map((node) => _nodeFromJson(node.cast<String, Object?>(), uuid))
        .toList(growable: false);
    final nodeIds = nodes.map((node) => node.id).toSet();

    final edges = edgesJson is List
        ? edgesJson
              .whereType<Map>()
              .map((edge) => _edgeFromJson(edge.cast<String, Object?>(), uuid))
              .where(
                (edge) =>
                    nodeIds.contains(edge.sourceNodeId) &&
                    nodeIds.contains(edge.targetNodeId),
              )
              .toList(growable: false)
        : const <Edge>[];

    return FlowchartGraph(nodes: nodes, edges: edges);
  }

  static CanvasNode _nodeFromJson(Map<String, Object?> json, Uuid uuid) {
    final id = (json['id'] as String?)?.trim();
    final x = _number(json['x'], fallback: 0);
    final y = _number(json['y'], fallback: 0);
    final width = _number(json['width'], fallback: 240);
    final height = _number(json['height'], fallback: 120);

    return CanvasNode(
      id: id == null || id.isEmpty ? uuid.v4() : id,
      title: (json['title'] as String?)?.trim().isNotEmpty == true
          ? (json['title'] as String).trim()
          : 'Generated Step',
      content: (json['content'] as String?) ?? '',
      type: _nodeType(json['type']),
      position: Offset(x, y),
      size: Size(width, height),
      metadata: <String, Object?>{
        'source': 'llm',
        if (json['metadata'] is Map) ...json['metadata'] as Map,
      },
    );
  }

  static Edge _edgeFromJson(Map<String, Object?> json, Uuid uuid) {
    final id = (json['id'] as String?)?.trim();
    final source = json['sourceNodeId'] ?? json['source'] ?? json['from'];
    final target = json['targetNodeId'] ?? json['target'] ?? json['to'];

    if (source is! String || target is! String) {
      throw const AppException(
        'Flowchart edge requires source and target ids.',
      );
    }

    return Edge(
      id: id == null || id.isEmpty ? uuid.v4() : id,
      sourceNodeId: source,
      targetNodeId: target,
      label: (json['label'] as String?) ?? '',
      directed: (json['directed'] as bool?) ?? true,
      metadata: <String, Object?>{
        'source': 'llm',
        if (json['metadata'] is Map) ...json['metadata'] as Map,
      },
    );
  }

  static CanvasNodeType _nodeType(Object? value) {
    if (value is String) {
      for (final type in CanvasNodeType.values) {
        if (type.name == value) {
          return type;
        }
      }
    }
    return CanvasNodeType.flowchart;
  }

  static double _number(Object? value, {required double fallback}) {
    if (value is num) {
      return value.toDouble();
    }
    if (value is String) {
      return double.tryParse(value) ?? fallback;
    }
    return fallback;
  }
}
