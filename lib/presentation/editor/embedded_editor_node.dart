import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:webview_flutter/webview_flutter.dart';

import '../../debug/debug_session_log.dart';
import '../../domain/entities/canvas_node.dart';
import '../../lsp/graphite_lsp_runtime.dart';
import '../../lsp/graphite_lsp_host_provider.dart';
import '../../lsp/lsp_config.dart';
import '../project/project_controller.dart';
import 'code_language.dart';
import 'monaco_webview_supported.dart';


class EmbeddedEditorNode extends ConsumerStatefulWidget {
  const EmbeddedEditorNode({
    required this.node,
    required this.isSelected,
    required this.onToggleCollapsed,
    super.key,
  });

  final CanvasNode node;
  final bool isSelected;
  final VoidCallback onToggleCollapsed;

  @override
  ConsumerState<EmbeddedEditorNode> createState() => _EmbeddedEditorNodeState();
}

class _EmbeddedEditorNodeState extends ConsumerState<EmbeddedEditorNode> {
  /// Used when `webview_flutter` has no platform plugin (Linux, Windows, web).
  final TextEditingController _plainTextController = TextEditingController();

  Timer? _saveTimer;
  bool _isLoading = true;
  String? _error;
  WebViewController? _webController;

  String get _relativePath {
    return widget.node.metadata['relativePath'] as String? ?? widget.node.id;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant EmbeddedEditorNode oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.node.id != widget.node.id) {
      _load();
    }
  }

  @override
  void dispose() {
    _saveTimer?.cancel();
    _plainTextController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<GraphiteLspRuntime?>>(
      graphiteLspHostProvider,
      (
        AsyncValue<GraphiteLspRuntime?>? previous,
        AsyncValue<GraphiteLspRuntime?> next,
      ) {
        if (!mounted || !isMonacoWebViewSupported) {
          return;
        }
        void reschedule() {
          Future<void>.microtask(() async {
            if (mounted) {
              await _load();
            }
          });
        }
        next.maybeWhen(
          data: (_) => reschedule(),
          error: (_, _) => reschedule(),
          orElse: () {},
        );
      },
    );
    final ThemeData theme = Theme.of(context);
    return Material(
      color: Colors.transparent,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: widget.isSelected
                ? theme.colorScheme.primary
                : const Color(0xffcbd5e1),
            width: widget.isSelected ? 3 : 1.5,
          ),
          boxShadow: const <BoxShadow>[
            BoxShadow(
              color: Color(0x1f000000),
              blurRadius: 18,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              _EditorHeader(
                path: _relativePath,
                language: CodeLanguage.fromPath(_relativePath),
                onToggleCollapsed: widget.onToggleCollapsed,
              ),
              Expanded(child: _buildEditor()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEditor() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Text(_error!, style: const TextStyle(color: Colors.red)),
      );
    }
    if (!isMonacoWebViewSupported) {
      return TextField(
        controller: _plainTextController,
        expands: true,
        maxLines: null,
        minLines: null,
        keyboardType: TextInputType.multiline,
        textAlignVertical: TextAlignVertical.top,
        style: const TextStyle(
          fontFamily: 'monospace',
          fontSize: 13,
          height: 1.35,
        ),
        decoration: const InputDecoration(
          border: InputBorder.none,
          contentPadding: EdgeInsets.all(14),
        ),
        onChanged: _queueSave,
      );
    }

    final controller = _webController;
    if (controller == null) {
      return const Center(child: Text('Editor unavailable'));
    }
    return WebViewWidget(controller: controller);
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _error = null;
      _webController = null;
    });
    try {
      final content = await ref
          .read(projectControllerProvider.notifier)
          .readFile(_relativePath);
      if (!mounted) {
        return;
      }

      // #region agent log
      debugSessionLog(
        'H0_PLATFORM',
        'embedded_editor_node.dart:_load',
        'after_read_file',
        <String, Object?>{
          'monacoWebViewSupported': isMonacoWebViewSupported,
          'defaultTargetPlatform': defaultTargetPlatform.name,
          'relativePath': _relativePath,
        },
      );
      // #endregion

      if (!isMonacoWebViewSupported) {
        _plainTextController.text = content;
        setState(() => _isLoading = false);
        return;
      }

      final languageId = CodeLanguage.monacoLanguageId(_relativePath);
      final project = ref.read(projectControllerProvider).project;
      if (project == null) {
        throw StateError('No open project.');
      }

      final GraphiteLspRuntime? graphiteRuntime =
          await ref.read(graphiteLspHostProvider.future);

      final GraphiteLspRuntime graphite = graphiteRuntime ??
          (throw Exception(
                'Embedded Monaco host unavailable. Confirm the Monaco bundle is '
                    'included (run npm ci && npm run build in tooling/monaco_lsp) '
                    'and that localhost serving started.',
              ));

      final String workspaceFs = p.canonicalize(project.rootPath);
      final String documentFs =
          p.canonicalize(p.join(project.rootPath, _relativePath));
      final LspLaunchSpec? spec =
          graphite.registry.lookupLanguage(languageId);

      final Map<String, Object?> payload = <String, Object?>{
        'workspaceFs': workspaceFs,
        'documentFs': documentFs,
        'languageId': languageId,
        'text': content,
      };

      final bool plain = languageId.toLowerCase() == 'plaintext';
      if (!plain && spec != null) {
        payload['enableLsp'] = true;
        payload['serverId'] = spec.id;
        if (spec.initializationOptions != null) {
          payload['initializationOptions'] = spec.initializationOptions;
        }
      } else {
        payload['enableLsp'] = false;
      }

      final Uri pageUri = graphite.editorPageUri;
      final String bootJson = jsonEncode(payload);
      final String bootB64 = base64Encode(utf8.encode(bootJson));
      final String bootB64Literal = jsonEncode(bootB64);

      // #region agent log
      debugSessionLog(
        'H4_FLUTTER',
        'embedded_editor_node.dart:_load',
        'monaco_web_load_start',
        <String, Object?>{
          'pageUri': pageUri.toString(),
          'relativePath': _relativePath,
          'bootB64Chars': bootB64.length,
          'kIsWeb': kIsWeb,
        },
      );
      // #endregion

      final WebViewController controller = WebViewController();
      await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      await controller.setBackgroundColor(Colors.white);
      await controller.addJavaScriptChannel(
        'FlutterBridge',
        onMessageReceived: (JavaScriptMessage message) {
          _queueSave(message.message);
        },
      );

      await controller.setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (String url) async {
            if (!mounted) {
              return;
            }
            // #region agent log
            debugSessionLog(
              'H4_FLUTTER',
              'embedded_editor_node.dart:onPageFinished',
              'page_finished',
              <String, Object?>{'url': url},
            );
            // #endregion
            try {
              await controller.runJavaScript(
                'try {\n'
                '  window.__GRAPHITE_BOOT_B64 = $bootB64Literal;\n'
                '} catch (e) {\n'
                '  console.error("[graphite] boot inject failed", e);\n'
                '}\n',
              );
              // #region agent log
              debugSessionLog(
                'H4_FLUTTER',
                'embedded_editor_node.dart:onPageFinished',
                'inject_js_ok',
                <String, Object?>{},
              );
              // #endregion
            } catch (error, trace) {
              // #region agent log
              debugSessionLog(
                'H4_FLUTTER',
                'embedded_editor_node.dart:onPageFinished',
                'inject_js_failed',
                <String, Object?>{
                  'error': '$error',
                },
              );
              // #endregion
              debugPrint('[graphite] inject boot failed $error\n$trace');
            }
          },
        ),
      );

      await controller.loadRequest(pageUri);

      setState(() {
        _webController = controller;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _isLoading = false;
        _error = error.toString();
      });
    }
  }

  void _queueSave(String content) {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 600), () {
      ref
          .read(projectControllerProvider.notifier)
          .writeFile(_relativePath, content);
    });
  }
}

class _EditorHeader extends StatelessWidget {
  const _EditorHeader({
    required this.path,
    required this.language,
    required this.onToggleCollapsed,
  });

  final String path;
  final String language;
  final VoidCallback onToggleCollapsed;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 46,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      color: const Color(0xfff8fafc),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(
              path,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            language,
            style: const TextStyle(color: Color(0xff64748b), fontSize: 12),
          ),
          const SizedBox(width: 8),
          IconButton(
            tooltip: 'Collapse file',
            iconSize: 18,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints.tightFor(width: 32, height: 32),
            icon: const Icon(Icons.unfold_less),
            onPressed: onToggleCollapsed,
          ),
        ],
      ),
    );
  }
}
