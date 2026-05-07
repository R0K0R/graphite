import 'dart:ui';

import 'package:path/path.dart' as p;

import '../../core/files/project_path.dart';
import '../../core/files/text_file_detector.dart';
import '../../core/errors/app_exception.dart';
import '../../domain/entities/canvas_node.dart';
import '../../domain/entities/edge.dart';
import '../../domain/entities/folder_region.dart';
import '../../domain/entities/graphite_project.dart';
import '../../domain/entities/project_file.dart';
import '../../domain/repositories/project_repository.dart';
import '../datasources/local_project_datasource.dart';
import '../models/graphite_metadata_model.dart';

class ProjectRepositoryImpl implements ProjectRepository {
  ProjectRepositoryImpl({LocalProjectDatasource? datasource})
    : _datasource = datasource ?? const LocalProjectDatasource();

  final LocalProjectDatasource _datasource;

  static const _defaultNodeSize = Size(520, 360);
  static const _folderColors = <Color>[
    Color(0xffdbeafe),
    Color(0xffdcfce7),
    Color(0xfffef3c7),
    Color(0xfffce7f3),
    Color(0xffede9fe),
    Color(0xffe0f2fe),
  ];

  @override
  Future<GraphiteProject> openProject(String rootPath) async {
    final normalizedRoot = ProjectPath.normalizeRoot(rootPath);
    final files = await _datasource.scanTextFiles(normalizedRoot);
    final metadata = await _datasource.readMetadata(normalizedRoot);
    final project = _buildProject(
      rootPath: normalizedRoot,
      files: files,
      metadata: metadata,
    );
    await saveProjectLayout(project);
    return project;
  }

  @override
  Future<GraphiteProject> syncProject(GraphiteProject project) async {
    final files = await _datasource.scanTextFiles(project.rootPath);
    final metadata = _metadataFromProject(project);
    final synced = _buildProject(
      rootPath: project.rootPath,
      files: files,
      metadata: metadata,
    );
    await saveProjectLayout(synced);
    return synced;
  }

  @override
  Future<GraphiteProject> createFile({
    required GraphiteProject project,
    required String relativePath,
    required Offset position,
    String initialContent = '',
  }) async {
    final normalizedPath = ProjectPath.normalizeRelative(relativePath);
    if (!TextFileDetector.isSupportedTextFile(normalizedPath)) {
      throw AppException('Unsupported text/code file type: $normalizedPath');
    }
    await _datasource.createFile(
      rootPath: project.rootPath,
      relativePath: normalizedPath,
      initialContent: initialContent,
    );

    final files = await _datasource.scanTextFiles(project.rootPath);
    final metadata = _metadataFromProject(project);
    final existingNode = metadata.nodes[normalizedPath];
    metadata.nodes[normalizedPath] =
        existingNode ??
        NodeLayoutModel(position: position, size: _defaultNodeSize);

    final updated = _buildProject(
      rootPath: project.rootPath,
      files: files,
      metadata: metadata,
    );
    await saveProjectLayout(updated);
    return updated;
  }

  @override
  Future<String> readFile(GraphiteProject project, String relativePath) {
    return _datasource.readTextFile(project.rootPath, relativePath);
  }

  @override
  Future<void> writeFile(
    GraphiteProject project,
    String relativePath,
    String content,
  ) {
    return _datasource.writeTextFile(
      rootPath: project.rootPath,
      relativePath: relativePath,
      content: content,
    );
  }

  @override
  Future<void> saveProjectLayout(GraphiteProject project) {
    return _datasource.writeMetadata(
      project.rootPath,
      _metadataFromProject(project),
    );
  }

  GraphiteProject _buildProject({
    required String rootPath,
    required List<ProjectFile> files,
    required GraphiteMetadataModel metadata,
  }) {
    final nodes = <CanvasNode>[];
    for (var index = 0; index < files.length; index += 1) {
      final file = files[index];
      final layout =
          metadata.nodes[file.relativePath] ?? _defaultNodeLayout(index);
      nodes.add(_nodeForFile(file, layout));
    }

    final folders = _buildFolderRegions(files, metadata);
    final nodeIds = nodes.map((node) => node.id).toSet();
    final edges = metadata.edges
        .where(
          (edge) =>
              nodeIds.contains(edge.sourceNodeId) &&
              nodeIds.contains(edge.targetNodeId),
        )
        .toList(growable: false);

    return GraphiteProject(
      rootPath: rootPath,
      schemaVersion: metadata.schemaVersion,
      files: files,
      nodes: nodes,
      folderRegions: folders,
      edges: edges,
    );
  }

  CanvasNode _nodeForFile(ProjectFile file, NodeLayoutModel layout) {
    return CanvasNode(
      id: file.relativePath,
      title: file.displayName,
      content: file.relativePath,
      type: CanvasNodeType.code,
      position: layout.position,
      size: layout.size,
      metadata: <String, Object?>{
        'kind': 'file',
        'relativePath': file.relativePath,
        'extension': file.extension,
      },
    );
  }

  List<FolderRegion> _buildFolderRegions(
    List<ProjectFile> files,
    GraphiteMetadataModel metadata,
  ) {
    final folderPaths = <String>{};
    for (final file in files) {
      var parent = p.posix.dirname(file.relativePath);
      while (parent != '.') {
        folderPaths.add(parent);
        parent = p.posix.dirname(parent);
      }
    }

    final sorted = folderPaths.toList()..sort();
    return <FolderRegion>[
      for (var index = 0; index < sorted.length; index += 1)
        _folderRegionFor(sorted[index], metadata, index),
    ];
  }

  FolderRegion _folderRegionFor(
    String relativePath,
    GraphiteMetadataModel metadata,
    int index,
  ) {
    final layout = metadata.folders[relativePath];
    if (layout != null) {
      return FolderRegion(
        relativePath: relativePath,
        bounds: layout.bounds,
        color: layout.color,
        isCollapsed: layout.isCollapsed,
      );
    }

    const columns = 3;
    const width = 680.0;
    const height = 420.0;
    const gapX = 96.0;
    const gapY = 96.0;
    final column = index % columns;
    final row = index ~/ columns;
    return FolderRegion(
      relativePath: relativePath,
      bounds: Rect.fromLTWH(
        -160 + column * (width + gapX),
        -160 + row * (height + gapY),
        width,
        height,
      ),
      color: _folderColors[index % _folderColors.length],
    );
  }

  NodeLayoutModel _defaultNodeLayout(int index) {
    const columns = 4;
    final column = index % columns;
    final row = index ~/ columns;
    return NodeLayoutModel(
      position: Offset(column * 620.0, row * 460.0),
      size: _defaultNodeSize,
    );
  }

  GraphiteMetadataModel _metadataFromProject(GraphiteProject project) {
    return GraphiteMetadataModel(
      schemaVersion: project.schemaVersion,
      nodes: <String, NodeLayoutModel>{
        for (final node in project.nodes)
          node.id: NodeLayoutModel(position: node.position, size: node.size),
      },
      folders: <String, FolderRegionLayoutModel>{
        for (final folder in project.folderRegions)
          folder.relativePath: FolderRegionLayoutModel.fromRegion(folder),
      },
      edges: <Edge>[...project.edges],
    );
  }
}
