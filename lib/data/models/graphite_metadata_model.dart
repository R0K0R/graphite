import 'dart:convert';
import 'dart:ui';

import '../../domain/entities/edge.dart';
import '../../domain/entities/folder_region.dart';

class GraphiteMetadataModel {
  const GraphiteMetadataModel({
    required this.schemaVersion,
    required this.nodes,
    required this.folders,
    required this.edges,
  });

  factory GraphiteMetadataModel.empty() {
    return const GraphiteMetadataModel(
      schemaVersion: 1,
      nodes: <String, NodeLayoutModel>{},
      folders: <String, FolderRegionLayoutModel>{},
      edges: <Edge>[],
    );
  }

  factory GraphiteMetadataModel.fromJson(Map<String, Object?> json) {
    return GraphiteMetadataModel(
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 1,
      nodes: _readLayouts(json['nodes']),
      folders: _readFolders(json['folders']),
      edges: _readEdges(json['edges']),
    );
  }

  factory GraphiteMetadataModel.fromJsonString(String source) {
    final decoded = jsonDecode(source);
    if (decoded is! Map<String, Object?>) {
      return GraphiteMetadataModel.empty();
    }
    return GraphiteMetadataModel.fromJson(decoded);
  }

  final int schemaVersion;
  final Map<String, NodeLayoutModel> nodes;
  final Map<String, FolderRegionLayoutModel> folders;
  final List<Edge> edges;

  String toPrettyJson() {
    const encoder = JsonEncoder.withIndent('  ');
    return '${encoder.convert(toJson())}\n';
  }

  Map<String, Object?> toJson() {
    return <String, Object?>{
      'schemaVersion': schemaVersion,
      'nodes': <String, Object?>{
        for (final entry in nodes.entries) entry.key: entry.value.toJson(),
      },
      'folders': <String, Object?>{
        for (final entry in folders.entries) entry.key: entry.value.toJson(),
      },
      'edges': edges
          .map(
            (edge) => <String, Object?>{
              'id': edge.id,
              'sourcePath': edge.sourceNodeId,
              'targetPath': edge.targetNodeId,
              'label': edge.label,
              'directed': edge.directed,
            },
          )
          .toList(),
    };
  }

  static Map<String, NodeLayoutModel> _readLayouts(Object? value) {
    if (value is! Map) {
      return const <String, NodeLayoutModel>{};
    }
    return <String, NodeLayoutModel>{
      for (final entry in value.entries)
        if (entry.key is String && entry.value is Map)
          entry.key as String: NodeLayoutModel.fromJson(
            (entry.value as Map).cast<String, Object?>(),
          ),
    };
  }

  static Map<String, FolderRegionLayoutModel> _readFolders(Object? value) {
    if (value is! Map) {
      return const <String, FolderRegionLayoutModel>{};
    }
    return <String, FolderRegionLayoutModel>{
      for (final entry in value.entries)
        if (entry.key is String && entry.value is Map)
          entry.key as String: FolderRegionLayoutModel.fromJson(
            (entry.value as Map).cast<String, Object?>(),
          ),
    };
  }

  static List<Edge> _readEdges(Object? value) {
    if (value is! List) {
      return const <Edge>[];
    }
    return value
        .whereType<Map>()
        .map((edge) {
          final json = edge.cast<String, Object?>();
          final source = json['sourcePath'] ?? json['sourceNodeId'];
          final target = json['targetPath'] ?? json['targetNodeId'];
          if (source is! String || target is! String) {
            return null;
          }
          return Edge(
            id: (json['id'] as String?) ?? '$source->$target',
            sourceNodeId: source,
            targetNodeId: target,
            label: (json['label'] as String?) ?? '',
            directed: (json['directed'] as bool?) ?? true,
          );
        })
        .whereType<Edge>()
        .toList(growable: false);
  }
}

class NodeLayoutModel {
  const NodeLayoutModel({
    required this.position,
    required this.size,
    this.isCollapsed = false,
  });

  factory NodeLayoutModel.fromJson(Map<String, Object?> json) {
    return NodeLayoutModel(
      position: Offset(_number(json['x'], 0), _number(json['y'], 0)),
      size: Size(_number(json['width'], 520), _number(json['height'], 360)),
      isCollapsed: (json['collapsed'] as bool?) ?? false,
    );
  }

  final Offset position;
  final Size size;
  final bool isCollapsed;

  Map<String, Object?> toJson() {
    return <String, Object?>{
      'x': position.dx,
      'y': position.dy,
      'width': size.width,
      'height': size.height,
      'collapsed': isCollapsed,
    };
  }
}

class FolderRegionLayoutModel {
  const FolderRegionLayoutModel({
    required this.bounds,
    required this.color,
    this.isCollapsed = true,
  });

  factory FolderRegionLayoutModel.fromJson(Map<String, Object?> json) {
    return FolderRegionLayoutModel(
      bounds: Rect.fromLTWH(
        _number(json['x'], 0),
        _number(json['y'], 0),
        _number(json['width'], 1200),
        _number(json['height'], 800),
      ),
      color: _parseColor((json['color'] as String?) ?? '#DBEAFE'),
      isCollapsed: (json['collapsed'] as bool?) ?? true,
    );
  }

  factory FolderRegionLayoutModel.fromRegion(FolderRegion region) {
    return FolderRegionLayoutModel(
      bounds: region.bounds,
      color: region.color,
      isCollapsed: region.isCollapsed,
    );
  }

  final Rect bounds;
  final Color color;
  final bool isCollapsed;

  Map<String, Object?> toJson() {
    return <String, Object?>{
      'x': bounds.left,
      'y': bounds.top,
      'width': bounds.width,
      'height': bounds.height,
      'color': _formatColor(color),
      'collapsed': isCollapsed,
    };
  }
}

double _number(Object? value, double fallback) {
  if (value is num) {
    return value.toDouble();
  }
  if (value is String) {
    return double.tryParse(value) ?? fallback;
  }
  return fallback;
}

Color _parseColor(String value) {
  final hex = value.replaceFirst('#', '');
  final rgb = int.tryParse(hex, radix: 16) ?? 0xdbeafe;
  return Color(0xff000000 | rgb);
}

String _formatColor(Color color) {
  final rgb = color.toARGB32() & 0x00ffffff;
  return '#${rgb.toRadixString(16).padLeft(6, '0').toUpperCase()}';
}
