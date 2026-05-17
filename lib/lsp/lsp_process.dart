import 'dart:io';

import 'package:path/path.dart' as p;

import 'lsp_config.dart';

final class UnsafePathError implements Exception {
  UnsafePathError(this.message);
  final String message;

  @override
  String toString() => 'UnsafePathError: $message';
}

/// Starts [spec] inside [projectRoot] with merged environment variables.
Future<Process> startLanguageServer({
  required String projectRoot,
  required LspLaunchSpec spec,
}) async {
  final String root = p.canonicalize(projectRoot);
  final Directory roots = Directory(root);
  if (!await roots.exists()) {
    throw UnsafePathError('Missing project directory: $root');
  }

  final Map<String, String> mergedEnv = Map<String, String>.from(
    Platform.environment,
  )..addAll(spec.environment);

  return Process.start(
    spec.executable,
    spec.args,
    workingDirectory: root,
    environment: mergedEnv,
    runInShell: false,
    mode: ProcessStartMode.normal,
  );
}
