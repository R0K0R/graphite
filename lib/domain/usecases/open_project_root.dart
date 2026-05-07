import '../entities/graphite_project.dart';
import '../repositories/project_repository.dart';

class OpenProjectRoot {
  const OpenProjectRoot(this._repository);

  final ProjectRepository _repository;

  Future<GraphiteProject> call(String rootPath) {
    return _repository.openProject(rootPath);
  }
}
