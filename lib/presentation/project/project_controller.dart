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

final projectRepositoryProvider = Provider<ProjectRepository>((ref) {
  return ProjectRepositoryImpl(datasource: const LocalProjectDatasource());
});

final layoutOrganizerProvider = Provider<OrganizeProjectLayout>((ref) {
  return OrganizeProjectLayout();
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
  late final OrganizeProjectLayout _layoutOrganizer;
  Timer? _syncTimer;
  Timer? _layoutSaveTimer;

  @override
  ProjectState build() {
    _repository = ref.read(projectRepositoryProvider);
    _layoutOrganizer = ref.read(layoutOrganizerProvider);
    ref.onDispose(() {
      _syncTimer?.cancel();
      _layoutSaveTimer?.cancel();
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

    final recomputedFolders = _layoutOrganizer.recomputeFolderBounds(
      files: project.files,
      nodes: nodes,
      previousFolders: project.folderRegions,
    );

    final updated = project.copyWith(
      nodes: nodes,
      folderRegions: recomputedFolders,
    );
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
}
