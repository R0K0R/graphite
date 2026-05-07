import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../canvas/canvas_widget.dart';
import '../project/project_controller.dart';

class GraphiteApp extends StatelessWidget {
  const GraphiteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ProviderScope(
      child: MaterialApp(
        title: 'Graphite',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff2563eb)),
          useMaterial3: true,
        ),
        home: const GraphiteHomePage(),
      ),
    );
  }
}

class GraphiteHomePage extends ConsumerStatefulWidget {
  const GraphiteHomePage({super.key});

  @override
  ConsumerState<GraphiteHomePage> createState() => _GraphiteHomePageState();
}

class _GraphiteHomePageState extends ConsumerState<GraphiteHomePage> {
  late final TextEditingController _rootController;

  @override
  void initState() {
    super.initState();
    _rootController = TextEditingController(text: Directory.current.path);
  }

  @override
  void dispose() {
    _rootController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: <Widget>[
          const CanvasWidget(),
          _CanvasHud(rootController: _rootController),
        ],
      ),
    );
  }
}

class _CanvasHud extends ConsumerWidget {
  const _CanvasHud({required this.rootController});

  final TextEditingController rootController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectState = ref.watch(projectControllerProvider);
    final project = projectState.project;
    final controller = ref.read(projectControllerProvider.notifier);

    return Positioned(
      left: 24,
      top: 24,
      child: SizedBox(
        width: 420,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x1f000000),
                blurRadius: 16,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                const Text(
                  'Graphite',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                const Text('Drag nodes, pan the canvas, scroll to zoom.'),
                const SizedBox(height: 12),
                TextField(
                  controller: rootController,
                  decoration: const InputDecoration(
                    labelText: 'Project root',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: <Widget>[
                    FilledButton(
                      onPressed: projectState.isLoading
                          ? null
                          : () => controller.openProject(rootController.text),
                      child: Text(
                        projectState.isLoading ? 'Opening...' : 'Open',
                      ),
                    ),
                    OutlinedButton(
                      onPressed: project == null ? null : controller.syncNow,
                      child: const Text('Sync files'),
                    ),
                    OutlinedButton(
                      onPressed: project == null
                          ? null
                          : () => _showCreateFileDialog(context, ref),
                      child: const Text('New file node'),
                    ),
                  ],
                ),
                if (project != null) ...<Widget>[
                  const SizedBox(height: 10),
                  Text(
                    '${project.files.length} files, '
                    '${project.folderRegions.length} folder regions',
                    style: const TextStyle(color: Color(0xff475569)),
                  ),
                ],
                if (projectState.error != null) ...<Widget>[
                  const SizedBox(height: 10),
                  Text(
                    projectState.error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _showCreateFileDialog(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final pathController = TextEditingController(text: 'lib/new_file.dart');
    final relativePath = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Create file node'),
          content: TextField(
            controller: pathController,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Relative file path',
              border: OutlineInputBorder(),
            ),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(pathController.text),
              child: const Text('Create'),
            ),
          ],
        );
      },
    );
    pathController.dispose();
    if (relativePath == null || relativePath.trim().isEmpty) {
      return;
    }

    final project = ref.read(projectControllerProvider).project;
    final index = project?.nodes.length ?? 0;
    await ref
        .read(projectControllerProvider.notifier)
        .createFile(
          relativePath: relativePath.trim(),
          position: Offset(80 + index * 48.0, 80 + index * 48.0),
        );
  }
}
