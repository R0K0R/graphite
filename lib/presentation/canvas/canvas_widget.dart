import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/geometry/canvas_transform.dart';
import '../../domain/entities/canvas_node.dart';
import '../../domain/entities/folder_region.dart';
import '../editor/embedded_editor_node.dart';
import '../project/project_controller.dart';
import 'canvas_controller.dart';
import 'canvas_painter.dart';

import '../settings/graphite_settings_provider.dart';
import '../theme/graphite_canvas_style.dart';

class CanvasWidget extends ConsumerStatefulWidget {
  const CanvasWidget({super.key});

  @override
  ConsumerState<CanvasWidget> createState() => _CanvasWidgetState();
}

class _CanvasWidgetState extends ConsumerState<CanvasWidget>
    with SingleTickerProviderStateMixin {
  String? _draggingNodeId;
  Offset? _lastDragWorldPosition;
  double _lastScale = 1;

  Map<String, Offset> _presentationNudge = const <String, Offset>{};
  AnimationController? _repelAnim;

  @override
  void dispose() {
    _repelAnim?.dispose();
    super.dispose();
  }

  void _maybePlayRepelBounce({
    required String draggedId,
    required Map<String, Offset> centersBeforeDragEnd,
  }) {
    final bool enable =
        ref.read(graphiteSettingsNotifierProvider).enableRepelBounce;
    if (!enable) {
      return;
    }
    final proj = ref.read(projectControllerProvider).project;
    if (proj == null || !mounted) {
      return;
    }
    final Map<String, Offset> startOffsets = <String, Offset>{};
    for (final n in proj.nodes) {
      final Offset? prev = centersBeforeDragEnd[n.id];
      if (prev == null) {
        continue;
      }
      if (n.id == draggedId) {
        continue;
      }
      final Offset delta = n.visualBounds.center - prev;
      if (delta.distance <= 3) {
        continue;
      }
      startOffsets[n.id] = -delta;
    }
    if (startOffsets.isEmpty) {
      return;
    }

    _repelAnim?.dispose();
    final AnimationController controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 240),
    );
    _repelAnim = controller;
    final Animation<double> curve = CurvedAnimation(
      parent: controller,
      curve: Curves.elasticOut,
    );
    curve.addListener(() {
      if (!mounted) {
        return;
      }
      final double u = curve.value.clamp(0.0, 1.0);
      final double k = (1 - u).clamp(0.0, 1.0);
      setState(() {
        _presentationNudge = <String, Offset>{
          for (final e in startOffsets.entries) e.key: e.value * k,
        };
      });
    });

    curve.addStatusListener((AnimationStatus status) {
      if (status == AnimationStatus.completed && mounted) {
        setState(() {
          _presentationNudge = const <String, Offset>{};
          _repelAnim?.dispose();
          _repelAnim = null;
        });
      }
    });
    controller.forward();
  }

  @override
  Widget build(BuildContext context) {
    final canvasState = ref.watch(canvasControllerProvider);
    final projectState = ref.watch(projectControllerProvider);
    final project = projectState.project;
    final folderRegions = _folderRegionsVisibleOutsideCollapsedParents(
      project?.folderRegions ?? const <FolderRegion>[],
    );
    final nodes = _nodesVisibleOutsideCollapsedFolders(
      project?.nodes ?? const <CanvasNode>[],
      project?.folderRegions ?? const <FolderRegion>[],
    );
    final controller = ref.read(canvasControllerProvider.notifier);
    final projectController = ref.read(projectControllerProvider.notifier);

    return Listener(
      onPointerSignal: (event) {
        if (event is PointerScrollEvent) {
          GestureBinding.instance.pointerSignalResolver.register(event, (
            event,
          ) {
            final scrollEvent = event as PointerScrollEvent;
            final scaleDelta = scrollEvent.scrollDelta.dy > 0 ? 0.9 : 1.1;
            controller.zoom(
              scaleDelta: scaleDelta,
              focalPoint: scrollEvent.localPosition,
            );
          });
        }
      },
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onScaleStart: (details) {
          _lastScale = 1;
          final worldPosition = CanvasTransform.screenToWorld(
            canvasState.transform,
            details.localFocalPoint,
          );
          _draggingNodeId = controller.hitTestNode(nodes, worldPosition);
          _lastDragWorldPosition = worldPosition;
          controller.selectNode(_draggingNodeId);
          if (_draggingNodeId != null) {
            projectController.beginNodeDrag(_draggingNodeId!);
          }
        },
        onScaleUpdate: (details) {
          final isZooming = details.scale != 1;

          if (isZooming) {
            final scaleDelta = details.scale / _lastScale;
            _lastScale = details.scale;
            controller.zoom(
              scaleDelta: scaleDelta,
              focalPoint: details.localFocalPoint,
            );
            return;
          }

          if (_draggingNodeId != null && _lastDragWorldPosition != null) {
            final latestState = ref.read(canvasControllerProvider);
            final worldPosition = CanvasTransform.screenToWorld(
              latestState.transform,
              details.localFocalPoint,
            );
            projectController.dragNode(
              nodeId: _draggingNodeId!,
              delta: worldPosition - _lastDragWorldPosition!,
            );
            _lastDragWorldPosition = worldPosition;
          } else {
            controller.pan(details.focalPointDelta);
          }
        },
        onScaleEnd: (_) {
          final String? dragId = _draggingNodeId;
          Map<String, Offset>? centersBefore;
          if (dragId != null) {
            final pj =
                ref.read(projectControllerProvider).project;
            if (pj != null &&
                ref
                    .read(graphiteSettingsNotifierProvider)
                    .enableRepelBounce) {
              centersBefore = <String, Offset>{
                for (final n in pj.nodes)
                  n.id: n.visualBounds.center,
              };
            }
            projectController.endNodeDrag(dragId);
            if (centersBefore != null && mounted) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                _maybePlayRepelBounce(
                  draggedId: dragId,
                  centersBeforeDragEnd: centersBefore!,
                );
              });
            }
          }
          _draggingNodeId = null;
          _lastDragWorldPosition = null;
          _lastScale = 1;
        },
        child: LayoutBuilder(
          builder: (context, constraints) {
            final ThemeData theme = Theme.of(context);
            final GraphiteCanvasStyle canvasStyle =
                theme.extension<GraphiteCanvasStyle>() ??
                (theme.brightness == Brightness.dark
                    ? GraphiteCanvasStyle.dark
                    : GraphiteCanvasStyle.light);
            final bool isDark = theme.brightness == Brightness.dark;
            final viewport =
                Offset.zero & Size(constraints.maxWidth, constraints.maxHeight);
            final viewportWorldRect = CanvasTransform.screenRectToWorld(
              canvasState.transform,
              viewport,
            ).inflate(320);
            final visibleNodes = CanvasPainter.visibleNodes(
              nodes: nodes,
              viewportWorldRect: viewportWorldRect,
            );

            return Stack(
              children: <Widget>[
                CustomPaint(
                  painter: CanvasPainter(
                    nodes: nodes,
                    edges: project?.edges ?? const [],
                    folderRegions: folderRegions,
                    transform: canvasState.transform,
                    selectedNodeId: canvasState.selectedNodeId,
                    canvasBackground: theme.colorScheme.surface,
                    canvasStyle: canvasStyle,
                    isDark: isDark,
                    presentationNudge: _presentationNudge,
                  ),
                  child: const SizedBox.expand(),
                ),
                Transform(
                  transform: canvasState.transform,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: <Widget>[
                      for (final node in visibleNodes)
                        _PositionedEditorNode(
                          node: node,
                          isSelected: node.id == canvasState.selectedNodeId,
                          presentationNudge:
                              _presentationNudge[node.id] ?? Offset.zero,
                        ),
                      for (final folder in folderRegions)
                        if (folder.visibleBounds.overlaps(viewportWorldRect))
                          _PositionedFolderControls(folder: folder),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  List<FolderRegion> _folderRegionsVisibleOutsideCollapsedParents(
    List<FolderRegion> folders,
  ) {
    final collapsedFolders = folders
        .where((folder) => folder.isCollapsed)
        .toList(growable: false);
    if (collapsedFolders.isEmpty) {
      return folders;
    }
    return folders
        .where((folder) {
          return !collapsedFolders.any(
            (collapsed) =>
                collapsed.relativePath != folder.relativePath &&
                collapsed.containsRelativePath(folder.relativePath),
          );
        })
        .toList(growable: false);
  }

  List<CanvasNode> _nodesVisibleOutsideCollapsedFolders(
    List<CanvasNode> nodes,
    List<FolderRegion> folders,
  ) {
    final collapsedFolders = folders
        .where((folder) => folder.isCollapsed)
        .toList(growable: false);
    if (collapsedFolders.isEmpty) {
      return nodes;
    }
    return nodes
        .where((node) {
          final relativePath =
              node.metadata['relativePath'] as String? ?? node.id;
          return !collapsedFolders.any(
            (folder) => folder.containsRelativePath(relativePath),
          );
        })
        .toList(growable: false);
  }
}

class _PositionedEditorNode extends ConsumerWidget {
  const _PositionedEditorNode({
    required this.node,
    required this.isSelected,
    required this.presentationNudge,
  });

  final CanvasNode node;
  final bool isSelected;
  final Offset presentationNudge;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (node.isCollapsed) {
      final bounds = node.visualBounds;
      return Positioned(
        left: bounds.left + presentationNudge.dx,
        top: bounds.top + presentationNudge.dy,
        width: bounds.width,
        height: bounds.height,
        child: _CollapsedFileNode(
          node: node,
          isSelected: isSelected,
          onExpand: () {
            ref
                .read(projectControllerProvider.notifier)
                .toggleNodeCollapsed(node.id);
          },
        ),
      );
    }

    return Positioned(
      left: node.position.dx + presentationNudge.dx,
      top: node.position.dy + presentationNudge.dy,
      width: node.size.width,
      height: node.size.height,
      child: Listener(
        onPointerSignal: (event) {
          if (event is PointerScrollEvent) {
            // Stop scroll event from bubbling up to CanvasWidget zoom logic
            // This allows the inner TextField to scroll without zooming the canvas
            GestureBinding.instance.pointerSignalResolver.register(
              event,
              (event) {},
            );
          }
        },
        child: EmbeddedEditorNode(
          key: ValueKey<String>(node.id),
          node: node,
          isSelected: isSelected,
          onToggleCollapsed: () {
            ref
                .read(projectControllerProvider.notifier)
                .toggleNodeCollapsed(node.id);
          },
        ),
      ),
    );
  }
}

class _CollapsedFileNode extends StatelessWidget {
  const _CollapsedFileNode({
    required this.node,
    required this.isSelected,
    required this.onExpand,
  });

  final CanvasNode node;
  final bool isSelected;
  final VoidCallback onExpand;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final Radius cap = Radius.circular(CanvasNode.collapsedSize.height / 2);

    return Material(
      color: colorScheme.surface,
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(cap)),
      child: InkWell(
        borderRadius: BorderRadius.all(cap),
        onDoubleTap: onExpand,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.all(cap),
            border: Border.all(
              color: isSelected ? colorScheme.primary : const Color(0xff94a3b8),
              width: isSelected ? 3 : 1.5,
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: <Widget>[
              const Icon(Icons.description_outlined, size: 16),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  node.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Expand file',
                iconSize: 16,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints.tightFor(
                  width: 28,
                  height: 28,
                ),
                icon: const Icon(Icons.unfold_more),
                onPressed: onExpand,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PositionedFolderControls extends ConsumerWidget {
  const _PositionedFolderControls({required this.folder});

  final FolderRegion folder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bounds = folder.visibleBounds;

    return Positioned(
      left: folder.isCollapsed ? bounds.right - 38 : bounds.right - 56,
      top: folder.isCollapsed ? bounds.top - 4 : bounds.top + 14,
      width: 36,
      height: 36,
      child: TweenAnimationBuilder<double>(
        key: ValueKey<String>(
          '${folder.relativePath}_${folder.isCollapsed}',
        ),
        duration: const Duration(milliseconds: 320),
        curve: Curves.elasticOut,
        tween: Tween<double>(begin: 0.93, end: 1),
        builder: (_, double scale, Widget? child) {
          return Transform.scale(
            alignment: Alignment.center,
            scale: scale,
            child: child,
          );
        },
        child: Listener(
          onPointerSignal: (event) {
            if (event is PointerScrollEvent) {
              GestureBinding.instance.pointerSignalResolver.register(
                event,
                (event) {},
              );
            }
          },
          child: Material(
            color: Theme.of(context).colorScheme.surface,
            elevation: 3,
            shape: const CircleBorder(),
            child: IconButton(
              tooltip: folder.isCollapsed ? 'Expand folder' : 'Fold folder',
              iconSize: 18,
              padding: EdgeInsets.zero,
              icon: Icon(
                folder.isCollapsed ? Icons.unfold_more : Icons.unfold_less,
              ),
              onPressed: () {
                ref
                    .read(projectControllerProvider.notifier)
                    .toggleFolderCollapsed(folder.relativePath);
              },
            ),
          ),
        ),
      ),
    );
  }
}
