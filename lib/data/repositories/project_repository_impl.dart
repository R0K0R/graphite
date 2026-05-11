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
import '../../domain/usecases/organize_project_layout.dart';
import '../datasources/local_project_datasource.dart';
import '../models/graphite_metadata_model.dart';

class ProjectRepositoryImpl implements ProjectRepository {
  ProjectRepositoryImpl({
    LocalProjectDatasource? datasource,
    OrganizeProjectLayout? layoutOrganizer,
  })  : _datasource = datasource ?? const LocalProjectDatasource(),
        _layoutOrganizer = layoutOrganizer ?? OrganizeProjectLayout();

  final LocalProjectDatasource _datasource;
  final OrganizeProjectLayout _layoutOrganizer;

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
    final layoutInput = LayoutInput(
      files: files,
      metadataNodes: metadata.nodes,
      metadataFolders: metadata.folders,
    );

    final layoutResult = _layoutOrganizer.organizeInitialLayout(layoutInput);

    final recomputedFolders = _layoutOrganizer.recomputeFolderBounds(
      files: files,
      nodes: layoutResult.nodes,
      previousFolders: layoutResult.folders,
    );

    final nodeIds = layoutResult.nodes.map((node) => node.id).toSet();
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
      nodes: layoutResult.nodes,
      folderRegions: recomputedFolders,
      edges: edges,
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
