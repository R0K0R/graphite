import 'dart:async';
import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/datasources/local_project_datasource.dart';
import '../../data/repositories/project_repository_impl.dart';
import '../../domain/entities/canvas_node.dart';
import '../../domain/entities/folder_region.dart';
import '../../domain/entities/graphite_project.dart';
import '../../domain/repositories/project_repository.dart';
import '../../domain/usecases/organize_project_layout.dart';
import '../../domain/usecases/resolve_rectangle_layout.dart';
import '../../domain/usecases/rectangle_layout_config.dart';
import '../settings/graphite_settings_provider.dart';

final projectRepositoryProvider = Provider<ProjectRepository>((ref) {
  return ProjectRepositoryImpl(datasource: const LocalProjectDatasource());
});

final projectControllerProvider =
    NotifierProvider<ProjectController, ProjectState>(ProjectController.new);

class ProjectState {
  const ProjectState({this.project, this.isLoading = false, this.error});

  final GraphiteProject? project;
  final bool isLoading;
  final String? error;

  ProjectState copyWith({
    GraphiteProject? project,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return ProjectState(
      project: project ?? this.project,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : error ?? this.error,
    );
  }
}

class ProjectController extends Notifier<ProjectState> {
  late final ProjectRepository _repository;
  Timer? _syncTimer;
  Timer? _layoutSaveTimer;
  _DragSession? _dragSession;

  @override
  ProjectState build() {
    _repository = ref.read(projectRepositoryProvider);
    ref.onDispose(() {
      _syncTimer?.cancel();
      _layoutSaveTimer?.cancel();
      _dragSession = null;
    });
    return const ProjectState();
  }

  Future<void> openProject(String rootPath) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final project = await _repository.openProject(rootPath);
      state = ProjectState(project: project);
      _startPeriodicSync();
    } catch (error) {
      state = ProjectState(error: error.toString());
    }
  }

  Future<void> syncNow() async {
    final project = state.project;
    if (project == null) {
      return;
    }
    try {
      state = state.copyWith(
        project: await _repository.syncProject(project),
        clearError: true,
      );
    } catch (error) {
      state = state.copyWith(error: error.toString());
    }
  }

  Future<void> createFile({
    required String relativePath,
    required Offset position,
  }) async {
    final project = state.project;
    if (project == null) {
      return;
    }
    try {
      state = state.copyWith(
        project: await _repository.createFile(
          project: project,
          relativePath: relativePath,
          position: position,
        ),
        clearError: true,
      );
    } catch (error) {
      state = state.copyWith(error: error.toString());
    }
  }

  Future<String> readFile(String relativePath) async {
    final project = state.project;
    if (project == null) {
      return '';
    }
    return _repository.readFile(project, relativePath);
  }

  Future<void> writeFile(String relativePath, String content) async {
    final project = state.project;
    if (project == null) {
      return;
    }
    await _repository.writeFile(project, relativePath, content);
  }

  void moveNode({required String nodeId, required Offset delta}) {
    final project = state.project;
    if (project == null) {
      return;
    }
    final nodes = <CanvasNode>[
      for (final node in project.nodes)
        if (node.id == nodeId) node.translated(delta) else node,
    ];
    final folders = _recomputeFolders(project: project, nodes: nodes);
    final updated = project.copyWith(nodes: nodes, folderRegions: folders);
    state = state.copyWith(project: updated, clearError: true);
    _scheduleLayoutSave(updated);
  }

  void beginNodeDrag(String nodeId) {
    final project = state.project;
    if (project == null) {
      return;
    }
    _dragSession = _DragSession(
      nodeId: nodeId,
      baselineNodes: project.nodes,
      baselineFolders: project.folderRegions,
    );
  }

  void dragNode({required String nodeId, required Offset delta}) {
    final project = state.project;
    if (project == null) {
      return;
    }
    final session = _dragSession;
    if (session == null || session.nodeId != nodeId) {
      moveNode(nodeId: nodeId, delta: delta);
      return;
    }

    session.cumulativeDelta += delta;
    final activeDelta = session.cumulativeDelta;
    final CanvasNode? baselineFinger = session.nodeById(nodeId);
    if (baselineFinger == null) {
      return;
    }
    final Rect fingerRect =
        baselineFinger.visualBounds.shift(activeDelta);
    final String fingerPath = (baselineFinger.metadata['relativePath'] as String?) ??
        baselineFinger.id;
    final RectangleLayoutConfig config =
        ref.read(rectangleLayoutConfigProvider);
    final RectangleLayoutSolveResult solved =
        ResolveRectangleLayout.solveTransient(
      nodesSeed: project.nodes,
      fingerId: nodeId,
      fingerRect: fingerRect,
      obstacleFolders: session.baselineFolders,
      fingerRelativePath: fingerPath,
      config: config,
    );
    final folders = _recomputeFolders(project: project, nodes: solved.nodes);
    state = state.copyWith(
      project: project.copyWith(nodes: solved.nodes, folderRegions: folders),
      clearError: true,
    );
  }

  void endNodeDrag(String nodeId) {
    final project = state.project;
    final session = _dragSession;
    if (project == null || session == null || session.nodeId != nodeId) {
      _dragSession = null;
      return;
    }

    final CanvasNode? baselineFinger = session.nodeById(nodeId);
    if (baselineFinger == null) {
      _dragSession = null;
      return;
    }
    final Rect fingerRect =
        baselineFinger.visualBounds.shift(session.cumulativeDelta);
    final String fingerPath =
        (baselineFinger.metadata['relativePath'] as String?) ?? baselineFinger.id;
    final RectangleLayoutConfig config =
        ref.read(rectangleLayoutConfigProvider);
    final RectangleLayoutSolveResult solved = ResolveRectangleLayout.solveFinal(
      nodesSeed: project.nodes,
      fingerId: nodeId,
      fingerRect: fingerRect,
      obstacleFolders: session.baselineFolders,
      fingerRelativePath: fingerPath,
      config: config,
    );
    final folders = _recomputeFolders(project: project, nodes: solved.nodes);
    final updated = project.copyWith(nodes: solved.nodes, folderRegions: folders);
    _dragSession = null;
    state = state.copyWith(project: updated, clearError: true);
    _scheduleLayoutSave(updated);
  }

  void toggleNodeCollapsed(String nodeId) {
    final project = state.project;
    if (project == null) {
      return;
    }
    final nodes = <CanvasNode>[
      for (final node in project.nodes)
        if (node.id == nodeId)
          node.copyWith(isCollapsed: !node.isCollapsed)
        else
          node,
    ];
    final folders = _recomputeFolders(project: project, nodes: nodes);
    final updated = project.copyWith(nodes: nodes, folderRegions: folders);
    state = state.copyWith(project: updated, clearError: true);
    _scheduleLayoutSave(updated);
  }

  void toggleFolderCollapsed(String relativePath) {
    final project = state.project;
    if (project == null) {
      return;
    }
    final folders = <FolderRegion>[
      for (final folder in project.folderRegions)
        if (folder.relativePath == relativePath)
          folder.copyWith(isCollapsed: !folder.isCollapsed)
        else
          folder,
    ];
    final updated = project.copyWith(folderRegions: folders);
    state = state.copyWith(project: updated, clearError: true);
    _scheduleLayoutSave(updated);
  }

  void _startPeriodicSync() {
    _syncTimer?.cancel();
    _syncTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      unawaited(syncNow());
    });
  }

  void _scheduleLayoutSave(GraphiteProject project) {
    _layoutSaveTimer?.cancel();
    _layoutSaveTimer = Timer(const Duration(milliseconds: 500), () {
      unawaited(_repository.saveProjectLayout(project));
    });
  }

  List<FolderRegion> _recomputeFolders({
    required GraphiteProject project,
    required List<CanvasNode> nodes,
  }) {
    return ProjectLayoutOrganizer.recomputeFolderRegions(
      files: project.files,
      nodes: nodes,
      previousFolders: project.folderRegions,
      folderColors: ProjectRepositoryImpl.folderColors,
    );
  }
}

class _DragSession {
  _DragSession({
    required this.nodeId,
    required List<CanvasNode> baselineNodes,
    required List<FolderRegion> baselineFolders,
  }) : baselineNodes = List<CanvasNode>.unmodifiable(baselineNodes),
       baselineFolders = List<FolderRegion>.unmodifiable(baselineFolders);

  final String nodeId;
  final List<CanvasNode> baselineNodes;
  final List<FolderRegion> baselineFolders;
  Offset cumulativeDelta = Offset.zero;

  CanvasNode? nodeById(String id) {
    for (final node in baselineNodes) {
      if (node.id == id) {
        return node;
      }
    }
    return null;
  }
}
