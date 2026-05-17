class CodeLanguage {
  const CodeLanguage._();

  /// Monaco editor language id (see monaco.languages).
  static String monacoLanguageId(String path) {
    final extension = path.split('.').last.toLowerCase();
    return switch (extension) {
      'dart' => 'dart',
      'js' => 'javascript',
      'jsx' => 'javascript',
      'mjs' => 'javascript',
      'cjs' => 'javascript',
      'ts' => 'typescript',
      'tsx' => 'typescript',
      'py' => 'python',
      'pyw' => 'python',
      'rs' => 'rust',
      'go' => 'go',
      'java' => 'java',
      'kt' || 'kts' => 'kotlin',
      'c' || 'h' => 'c',
      'cc' || 'cpp' || 'cxx' || 'hpp' || 'hh' => 'cpp',
      'json' => 'json',
      'md' => 'markdown',
      'yaml' || 'yml' => 'yaml',
      'html' || 'htm' => 'html',
      'css' => 'css',
      'scss' => 'scss',
      'less' => 'less',
      'xml' => 'xml',
      'sh' || 'bash' => 'shell',
      'sql' => 'sql',
      _ => 'plaintext',
    };
  }

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
