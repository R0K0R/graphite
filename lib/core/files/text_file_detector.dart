import 'package:path/path.dart' as p;

class TextFileDetector {
  const TextFileDetector._();

  static const ignoredDirectoryNames = <String>{
    '.dart_tool',
    '.cursor',
    '.git',
    '.idea',
    '.vscode',
    'build',
    'node_modules',
    'ephemeral',
  };

  static const ignoredFileNames = <String>{'.graphite.json'};

  static const textExtensions = <String>{
    '.c',
    '.cc',
    '.cpp',
    '.css',
    '.dart',
    '.go',
    '.h',
    '.hpp',
    '.html',
    '.java',
    '.js',
    '.json',
    '.kt',
    '.kts',
    '.md',
    '.py',
    '.rs',
    '.sh',
    '.sql',
    '.swift',
    '.toml',
    '.ts',
    '.tsx',
    '.txt',
    '.xml',
    '.yaml',
    '.yml',
  };

  static bool shouldSkipDirectory(String path) {
    return ignoredDirectoryNames.contains(p.basename(path));
  }

  static bool isSupportedTextFile(String path) {
    final name = p.basename(path);
    if (ignoredFileNames.contains(name)) {
      return false;
    }
    return textExtensions.contains(p.extension(path).toLowerCase());
  }
}
