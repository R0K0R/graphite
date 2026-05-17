import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/geometry/canvas_transform.dart';
import '../../domain/entities/graphite_project.dart';
import '../canvas/canvas_controller.dart';
import '../canvas/canvas_widget.dart';
import '../project/project_controller.dart';
import '../settings/graphite_settings_provider.dart';
import '../settings/graphite_settings.dart';
import '../settings/settings_sheet.dart';
import '../theme/graphite_canvas_style.dart';

class GraphiteApp extends ConsumerWidget {
  const GraphiteApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final GraphiteSettings settings = ref.watch(graphiteSettingsNotifierProvider);

    final ThemeData lightBase = ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff2563eb)),
      useMaterial3: true,
      brightness: Brightness.light,
    );

    final ThemeData darkBase = ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xff60a5fa),
        brightness: Brightness.dark,
      ),
      useMaterial3: true,
      brightness: Brightness.dark,
    );

    return MaterialApp(
      title: 'Graphite',
      debugShowCheckedModeBanner: false,
      themeMode: settings.themeMode,
      theme: lightBase.copyWith(
        extensions: const <ThemeExtension<dynamic>>[
          GraphiteCanvasStyle.light,
        ],
      ),
      darkTheme: darkBase.copyWith(
        extensions: const <ThemeExtension<dynamic>>[
          GraphiteCanvasStyle.dark,
        ],
      ),
      home: const GraphiteHomePage(),
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
  bool _isSidebarOpen = false;

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
      backgroundColor: Theme.of(context).colorScheme.surface,
      body: Stack(
        children: <Widget>[
          const CanvasWidget(),
          _CanvasHud(rootController: _rootController),
          _FileTreeSidebar(
            isOpen: _isSidebarOpen,
            onToggle: () => setState(() => _isSidebarOpen = !_isSidebarOpen),
          ),
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

    final ColorScheme cs = Theme.of(context).colorScheme;

    return Positioned(
      left: 24,
      top: 24,
      child: SizedBox(
        width: 420,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: cs.surface,
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
                Row(
                  children: <Widget>[
                    const Expanded(
                      child: Text(
                        'Graphite',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Settings',
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(Icons.settings_outlined),
                      onPressed: () => showGraphiteSettingsSheet(context),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                const Text('Drag nodes, pan the canvas, scroll to zoom.'),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Expanded(
                      child: TextField(
                        controller: rootController,
                        decoration: const InputDecoration(
                          labelText: 'Project root',
                          isDense: true,
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      onPressed: () async {
                        final String? picked =
                            await FilePicker.platform.getDirectoryPath();
                        if (picked != null) {
                          rootController.text = picked;
                        }
                      },
                      child: const Text('Browse'),
                    ),
                  ],
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
                    style: TextStyle(color: Theme.of(context).colorScheme.secondary),
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
    final proj = ref.read(projectControllerProvider).project;
    final List<String> known = proj == null
        ? const <String>[]
        : proj.files.map((f) => f.relativePath).toList(growable: false);
    final pathController = TextEditingController(text: 'lib/new_file.dart');
    final relativePath = await showDialog<String>(
      context: context,
      builder: (dialogCtx) {
        return AlertDialog(
          title: const Text('Create file node'),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                TextField(
                  controller: pathController,
                  autofocus: true,
                  decoration: const InputDecoration(
                    labelText: 'Relative file path',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (known.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 12),
                  Text(
                    'Existing paths (tap)',
                    style: Theme.of(dialogCtx).textTheme.labelMedium,
                  ),
                  const SizedBox(height: 6),
                  SizedBox(
                    height: 180,
                    child: Scrollbar(
                      child: ListView.builder(
                        itemCount: known.length.clamp(0, 60),
                        itemBuilder: (_, int index) {
                          final String row = known[index];
                          return ListTile(
                            dense: true,
                            title: Text(
                              row,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            onTap: () => pathController.text = row,
                          );
                        },
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogCtx).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(dialogCtx).pop(pathController.text),
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

class _FileTreeSidebar extends ConsumerStatefulWidget {
  const _FileTreeSidebar({required this.isOpen, required this.onToggle});

  final bool isOpen;
  final VoidCallback onToggle;

  @override
  ConsumerState<_FileTreeSidebar> createState() => _FileTreeSidebarState();
}

class _FileTreeSidebarState extends ConsumerState<_FileTreeSidebar> {
  final Set<String> _manuallyToggledFolders = {};

  @override
  Widget build(BuildContext context) {
    final projectState = ref.watch(projectControllerProvider);
    final canvasState = ref.watch(canvasControllerProvider);
    final project = projectState.project;
    if (project == null) return const SizedBox.shrink();

    // Determine active path based on selection AND visibility
    final activePathSet = <String>{};

    // 1. Selection
    final selectedNodeId = canvasState.selectedNodeId;
    if (selectedNodeId != null) {
      _addPathWithAncestors(activePathSet, selectedNodeId);
    }

    // 2. Visibility
    final viewportSize = MediaQuery.of(context).size;
    final viewportWorldRect = CanvasTransform.screenRectToWorld(
      canvasState.transform,
      Offset.zero & viewportSize,
    );

    for (final node in project.nodes) {
      if (node.visualBounds.overlaps(viewportWorldRect)) {
        _addPathWithAncestors(activePathSet, node.id);
      }
    }

    for (final folder in project.folderRegions) {
      if (folder.visualBounds.overlaps(viewportWorldRect)) {
        _addPathWithAncestors(activePathSet, folder.relativePath);
      }
    }

    return AnimatedPositioned(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
      left: widget.isOpen ? 24 : -250,
      top: 260, // Positioned below the HUD
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 280,
            height: 400,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x1f000000),
                  blurRadius: 16,
                  offset: Offset(0, 8),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Listener(
              onPointerSignal: (event) {
                if (event is PointerScrollEvent) {
                  GestureBinding.instance.pointerSignalResolver.register(
                    event,
                    (event) {},
                  );
                }
              },
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: _FileTreeList(
                  project: project,
                  activePathSet: activePathSet,
                  manuallyToggledFolders: _manuallyToggledFolders,
                  onToggleFolder: (path) {
                    setState(() {
                      if (_manuallyToggledFolders.contains(path)) {
                        _manuallyToggledFolders.remove(path);
                      } else {
                        _manuallyToggledFolders.add(path);
                      }
                    });
                  },
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          _SidebarToggleButton(isOpen: widget.isOpen, onTap: widget.onToggle),
        ],
      ),
    );
  }

  void _addPathWithAncestors(Set<String> set, String path) {
    set.add(path);
    final parts = path.split('/');
    for (int i = 1; i < parts.length; i++) {
      set.add(parts.sublist(0, i).join('/'));
    }
  }
}

class _SidebarToggleButton extends StatelessWidget {
  const _SidebarToggleButton({required this.isOpen, required this.onTap});

  final bool isOpen;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 4,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(
            isOpen ? Icons.chevron_left : Icons.chevron_right,
            color: const Color(0xff2563eb),
          ),
        ),
      ),
    );
  }
}

class _FileTreeList extends ConsumerWidget {
  const _FileTreeList({
    required this.project,
    required this.activePathSet,
    required this.manuallyToggledFolders,
    required this.onToggleFolder,
  });

  final GraphiteProject project;
  final Set<String> activePathSet;
  final Set<String> manuallyToggledFolders;
  final ValueChanged<String> onToggleFolder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewportSize = MediaQuery.of(context).size;

    // A folder is expanded ONLY if it's manually toggled.
    // By default all are closed. Manual toggle -> expand.
    // Active path (selection/visibility) highlights are purely visual now.
    final expandedFolders = Set<String>.from(manuallyToggledFolders);

    final items = _buildFilteredTreeItems(expandedFolders);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        for (final item in items)
          _FileTreeItem(
            label: item.label,
            isFolder: item.isFolder,
            depth: item.depth,
            isExpanded: expandedFolders.contains(item.path),
            isActive: activePathSet.contains(item.path),
            onTap: () {
              ref
                  .read(canvasControllerProvider.notifier)
                  .lookAt(item.worldRect, viewportSize);
            },
            onToggle: item.isFolder ? () => onToggleFolder(item.path) : null,
          ),
      ],
    );
  }

  List<_TreeEntry> _buildFilteredTreeItems(Set<String> expandedFolders) {
    final entries = <_TreeEntry>[];
    final folderMap = {
      for (final f in project.folderRegions) f.relativePath: f,
    };
    final fileMap = {
      for (final n in project.nodes)
        if (n.metadata['relativePath'] is String)
          n.metadata['relativePath']! as String: n,
    };

    final allPaths = <String>{...folderMap.keys, ...fileMap.keys}.toList()
      ..sort();

    for (final path in allPaths) {
      final parts = path.split('/');
      final depth = parts.length - 1;
      final isFolder = folderMap.containsKey(path);

      // Filtering logic:
      // Always show root items (depth == 0)
      // Show sub-items only if ALL ancestor folders are expanded
      bool shouldShow = depth == 0;
      if (!shouldShow) {
        bool allAncestorsExpanded = true;
        for (int i = 1; i < parts.length; i++) {
          final ancestorPath = parts.sublist(0, i).join('/');
          if (!expandedFolders.contains(ancestorPath)) {
            allAncestorsExpanded = false;
            break;
          }
        }
        if (allAncestorsExpanded) {
          shouldShow = true;
        }
      }

      if (shouldShow) {
        entries.add(
          _TreeEntry(
            path: path,
            label: parts.last,
            isFolder: isFolder,
            depth: depth,
            worldRect: isFolder
                ? folderMap[path]!.visualBounds
                : fileMap[path]!.visualBounds,
          ),
        );
      }
    }

    return entries;
  }
}

class _TreeEntry {
  _TreeEntry({
    required this.path,
    required this.label,
    required this.isFolder,
    required this.depth,
    required this.worldRect,
  });

  final String path;
  final String label;
  final bool isFolder;
  final int depth;
  final Rect worldRect;
}

class _FileTreeItem extends StatefulWidget {
  const _FileTreeItem({
    required this.label,
    required this.isFolder,
    required this.depth,
    required this.isExpanded,
    required this.isActive,
    required this.onTap,
    this.onToggle,
  });

  final String label;
  final bool isFolder;
  final int depth;
  final bool isExpanded;
  final bool isActive;
  final VoidCallback onTap;
  final VoidCallback? onToggle;

  @override
  State<_FileTreeItem> createState() => _FileTreeItemState();
}

class _FileTreeItemState extends State<_FileTreeItem> {
  bool _isChevronHovered = false;
  bool _isNameHovered = false;

  @override
  Widget build(BuildContext context) {
    final activeColor = const Color(0xff1e3a8a); // Navy
    final defaultColor = const Color(0xff64748b);
    final labelColor = widget.isActive ? activeColor : const Color(0xff475569);

    return Padding(
      padding: EdgeInsets.only(left: widget.depth * 12.0, bottom: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          MouseRegion(
            onEnter: (_) => setState(() => _isNameHovered = true),
            onExit: (_) => setState(() => _isNameHovered = false),
            cursor: SystemMouseCursors.click,
            child: GestureDetector(
              onTap: widget.onTap,
              behavior: HitTestBehavior.opaque,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    child: Center(
                      child: Text(
                        widget.isFolder ? '-' : '·',
                        style: TextStyle(
                          fontSize: widget.isFolder ? 18 : 24,
                          fontWeight: FontWeight.bold,
                          color: widget.isActive ? activeColor : defaultColor,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    widget.label,
                    style: TextStyle(
                      fontSize: 12,
                      color: labelColor,
                      fontWeight: widget.isActive
                          ? FontWeight.w700
                          : FontWeight.w500,
                      decoration: _isNameHovered
                          ? TextDecoration.underline
                          : null,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (widget.isFolder) ...[
            const SizedBox(width: 4),
            MouseRegion(
              onEnter: (_) => setState(() => _isChevronHovered = true),
              onExit: (_) => setState(() => _isChevronHovered = false),
              cursor: SystemMouseCursors.click,
              child: GestureDetector(
                onTap: widget.onToggle,
                child: Opacity(
                  opacity: _isChevronHovered ? 1.0 : 0.3,
                  child: Icon(
                    widget.isExpanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    size: 16,
                    color: widget.isActive ? activeColor : defaultColor,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
