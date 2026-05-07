import 'canvas_node.dart';
import 'edge.dart';
import 'folder_region.dart';
import 'project_file.dart';

class GraphiteProject {
  GraphiteProject({
    required this.rootPath,
    required List<ProjectFile> files,
    required List<CanvasNode> nodes,
    required List<FolderRegion> folderRegions,
    required List<Edge> edges,
    this.schemaVersion = 1,
  }) : files = List<ProjectFile>.unmodifiable(files),
       nodes = List<CanvasNode>.unmodifiable(nodes),
       folderRegions = List<FolderRegion>.unmodifiable(folderRegions),
       edges = List<Edge>.unmodifiable(edges);

  final String rootPath;
  final int schemaVersion;
  final List<ProjectFile> files;
  final List<CanvasNode> nodes;
  final List<FolderRegion> folderRegions;
  final List<Edge> edges;

  Map<String, CanvasNode> get nodesByPath {
    return <String, CanvasNode>{
      for (final node in nodes)
        if (node.metadata['relativePath'] is String)
          node.metadata['relativePath']! as String: node,
    };
  }

  GraphiteProject copyWith({
    List<ProjectFile>? files,
    List<CanvasNode>? nodes,
    List<FolderRegion>? folderRegions,
    List<Edge>? edges,
  }) {
    return GraphiteProject(
      rootPath: rootPath,
      schemaVersion: schemaVersion,
      files: files ?? this.files,
      nodes: nodes ?? this.nodes,
      folderRegions: folderRegions ?? this.folderRegions,
      edges: edges ?? this.edges,
    );
  }
}
