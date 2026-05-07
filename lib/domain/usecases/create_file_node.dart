import 'dart:ui';

import '../entities/graphite_project.dart';
import '../repositories/project_repository.dart';

class CreateFileNode {
  const CreateFileNode(this._repository);

  final ProjectRepository _repository;

  Future<GraphiteProject> call({
    required GraphiteProject project,
    required String relativePath,
    required Offset position,
    String initialContent = '',
  }) {
    return _repository.createFile(
      project: project,
      relativePath: relativePath,
      position: position,
      initialContent: initialContent,
    );
  }
}
