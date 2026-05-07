import 'dart:ui';

import '../entities/graphite_project.dart';

abstract interface class ProjectRepository {
  Future<GraphiteProject> openProject(String rootPath);

  Future<GraphiteProject> syncProject(GraphiteProject project);

  Future<GraphiteProject> createFile({
    required GraphiteProject project,
    required String relativePath,
    required Offset position,
    String initialContent = '',
  });

  Future<String> readFile(GraphiteProject project, String relativePath);

  Future<void> writeFile(
    GraphiteProject project,
    String relativePath,
    String content,
  );

  Future<void> saveProjectLayout(GraphiteProject project);
}
