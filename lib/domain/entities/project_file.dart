import 'package:path/path.dart' as p;

class ProjectFile {
  const ProjectFile({
    required this.relativePath,
    required this.modifiedAt,
    required this.sizeBytes,
  });

  final String relativePath;
  final DateTime modifiedAt;
  final int sizeBytes;

  String get displayName => p.posix.basename(relativePath);

  String get extension {
    final ext = p.posix.extension(relativePath);
    return ext.startsWith('.') ? ext.substring(1) : ext;
  }
}
