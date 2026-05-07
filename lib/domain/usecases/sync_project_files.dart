import '../entities/graphite_project.dart';
import '../repositories/project_repository.dart';

class SyncProjectFiles {
  const SyncProjectFiles(this._repository);

  final ProjectRepository _repository;

  Future<GraphiteProject> call(GraphiteProject project) {
    return _repository.syncProject(project);
  }
}
