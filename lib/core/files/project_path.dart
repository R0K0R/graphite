import 'dart:io';

import 'package:path/path.dart' as p;

import '../errors/app_exception.dart';

class ProjectPath {
  const ProjectPath._();

  static String normalizeRoot(String rootPath) {
    return p.normalize(p.absolute(rootPath));
  }

  static String metadataPath(String rootPath) {
    return p.join(normalizeRoot(rootPath), '.graphite.json');
  }

  static String join(String rootPath, String relativePath) {
    final normalizedRoot = normalizeRoot(rootPath);
    final normalizedRelative = normalizeRelative(relativePath);
    final resolved = p.normalize(p.join(normalizedRoot, normalizedRelative));
    _ensureInsideRoot(normalizedRoot, resolved);
    return resolved;
  }

  static String relativeFromRoot(String rootPath, String absolutePath) {
    final normalizedRoot = normalizeRoot(rootPath);
    final resolved = p.normalize(p.absolute(absolutePath));
    _ensureInsideRoot(normalizedRoot, resolved);
    return normalizeRelative(p.relative(resolved, from: normalizedRoot));
  }

  static String normalizeRelative(String relativePath) {
    final normalized = p.normalize(relativePath).replaceAll(r'\', '/');
    if (normalized == '.' || normalized.isEmpty) {
      return '';
    }
    if (p.isAbsolute(normalized) ||
        normalized == '..' ||
        normalized.startsWith('../')) {
      throw AppException('Path escapes the project root: $relativePath');
    }
    return normalized;
  }

  static bool isDirectoryInside(String rootPath, FileSystemEntity entity) {
    final normalizedRoot = normalizeRoot(rootPath);
    final resolved = p.normalize(p.absolute(entity.path));
    return resolved == normalizedRoot || p.isWithin(normalizedRoot, resolved);
  }

  static void _ensureInsideRoot(String rootPath, String absolutePath) {
    if (absolutePath != rootPath && !p.isWithin(rootPath, absolutePath)) {
      throw AppException('Path escapes the project root: $absolutePath');
    }
  }
}
