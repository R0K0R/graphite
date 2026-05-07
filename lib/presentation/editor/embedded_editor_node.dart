import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/canvas_node.dart';
import '../project/project_controller.dart';
import 'code_language.dart';

class EmbeddedEditorNode extends ConsumerStatefulWidget {
  const EmbeddedEditorNode({
    required this.node,
    required this.isSelected,
    super.key,
  });

  final CanvasNode node;
  final bool isSelected;

  @override
  ConsumerState<EmbeddedEditorNode> createState() => _EmbeddedEditorNodeState();
}

class _EmbeddedEditorNodeState extends ConsumerState<EmbeddedEditorNode> {
  final _textController = TextEditingController();
  Timer? _saveTimer;
  bool _isLoading = true;
  String? _error;

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
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
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
    return TextField(
      controller: _textController,
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

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final content = await ref
          .read(projectControllerProvider.notifier)
          .readFile(_relativePath);
      if (!mounted) {
        return;
      }
      _textController.text = content;
      setState(() => _isLoading = false);
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
  const _EditorHeader({required this.path, required this.language});

  final String path;
  final String language;

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
        ],
      ),
    );
  }
}
