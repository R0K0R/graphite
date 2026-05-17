import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'lsp_config.dart';

@immutable
class GraphiteLspRuntime {
  const GraphiteLspRuntime({
    required this.editorBaseUri,
    required this.registry,
  });

  final Uri editorBaseUri;
  final LspMergedRegistry registry;

  /// `index.html` for the Monaco bundle (no `#fragment`; Flutter injects the boot payload).

  Uri get editorPageUri => editorBaseUri;

  @Deprecated('Huge documents break WebView URI fragments — use editorPageUri + JS injection.')

  Uri navigationUri(Map<String, Object?> bootPayload) {
    return Uri(
      scheme: editorBaseUri.scheme,
      host: editorBaseUri.host,
      port: editorBaseUri.port,
      path: editorBaseUri.path,
      fragment: Uri.encodeComponent(jsonEncode(bootPayload)),
    );
  }
}
