import 'dart:convert';
import 'dart:io';

import '../../core/files/project_path.dart';
import '../../core/files/text_file_detector.dart';
import '../../core/errors/app_exception.dart';
import '../../domain/entities/project_file.dart';
import '../models/graphite_metadata_model.dart';

class LocalProjectDatasource {
  const LocalProjectDatasource();

  Future<List<ProjectFile>> scanTextFiles(String rootPath) async {
    final root = Directory(ProjectPath.normalizeRoot(rootPath));
    if (!root.existsSync()) {
      throw AppException('Project root does not exist: ${root.path}');
    }

    final files = <ProjectFile>[];
    await _scanDirectory(root: root, directory: root, files: files);

    files.sort((a, b) => a.relativePath.compareTo(b.relativePath));
    return files;
  }

  Future<GraphiteMetadataModel> readMetadata(String rootPath) async {
    final metadataFile = File(ProjectPath.metadataPath(rootPath));
    if (!metadataFile.existsSync()) {
      return GraphiteMetadataModel.empty();
    }
    final source = await metadataFile.readAsString();
    return GraphiteMetadataModel.fromJsonString(source);
  }

  Future<void> writeMetadata(
    String rootPath,
    GraphiteMetadataModel metadata,
  ) async {
    final metadataFile = File(ProjectPath.metadataPath(rootPath));
    await metadataFile.writeAsString(metadata.toPrettyJson());
  }

  Future<void> createFile({
    required String rootPath,
    required String relativePath,
    required String initialContent,
  }) async {
    final file = File(ProjectPath.join(rootPath, relativePath));
    if (file.existsSync()) {
      throw AppException('File already exists: $relativePath');
    }
    await file.parent.create(recursive: true);
    await file.writeAsString(initialContent);
  }

  Future<String> readTextFile(String rootPath, String relativePath) async {
    final file = File(ProjectPath.join(rootPath, relativePath));
    return file.readAsString(encoding: utf8);
  }

  Future<void> writeTextFile({
    required String rootPath,
    required String relativePath,
    required String content,
  }) async {
    final file = File(ProjectPath.join(rootPath, relativePath));
    await file.writeAsString(content, encoding: utf8);
  }

  Future<void> _scanDirectory({
    required Directory root,
    required Directory directory,
    required List<ProjectFile> files,
  }) async {
    await for (final entity in directory.list(followLinks: false)) {
      if (entity is Directory) {
        if (!TextFileDetector.shouldSkipDirectory(entity.path)) {
          await _scanDirectory(root: root, directory: entity, files: files);
        }
        continue;
      }
      if (entity is! File ||
          !TextFileDetector.isSupportedTextFile(entity.path)) {
        continue;
      }
      final stat = await entity.stat();
      files.add(
        ProjectFile(
          relativePath: ProjectPath.relativeFromRoot(root.path, entity.path),
          modifiedAt: stat.modified,
          sizeBytes: stat.size,
        ),
      );
    }
  }
}
