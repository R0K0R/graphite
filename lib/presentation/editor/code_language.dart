class CodeLanguage {
  const CodeLanguage._();

  static String fromPath(String path) {
    final extension = path.split('.').last.toLowerCase();
    return switch (extension) {
      'dart' => 'Dart',
      'js' || 'ts' || 'tsx' => 'TypeScript/JavaScript',
      'py' => 'Python',
      'rs' => 'Rust',
      'go' => 'Go',
      'java' || 'kt' || 'kts' => 'JVM',
      'c' || 'cc' || 'cpp' || 'h' || 'hpp' => 'C/C++',
      'json' => 'JSON',
      'md' => 'Markdown',
      'yaml' || 'yml' => 'YAML',
      'html' || 'css' => 'Web',
      _ => 'Text',
    };
  }
}
