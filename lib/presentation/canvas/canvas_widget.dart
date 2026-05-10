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

class CanvasWidget extends ConsumerStatefulWidget {
  const CanvasWidget({super.key});

  @override
  ConsumerState<CanvasWidget> createState() => _CanvasWidgetState();
}

class _CanvasWidgetState extends ConsumerState<CanvasWidget> {
  String? _draggingNodeId;
  Offset? _lastDragWorldPosition;
  double _lastScale = 1;

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
          GestureBinding.instance.pointerSignalResolver.register(event, (event) {
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
            projectController.moveNode(
              nodeId: _draggingNodeId!,
              delta: worldPosition - _lastDragWorldPosition!,
            );
            _lastDragWorldPosition = worldPosition;
          } else {
            controller.pan(details.focalPointDelta);
          }
        },
        onScaleEnd: (_) {
          _draggingNodeId = null;
          _lastDragWorldPosition = null;
          _lastScale = 1;
        },
        child: LayoutBuilder(
          builder: (context, constraints) {
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

class _PositionedEditorNode extends StatelessWidget {
  const _PositionedEditorNode({
    required this.node,
    required this.isSelected,
  });

  final CanvasNode node;
  final bool isSelected;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: node.position.dx,
      top: node.position.dy,
      width: node.size.width,
      height: node.size.height,
      child: Listener(
        onPointerSignal: (event) {
          if (event is PointerScrollEvent) {
            // Stop scroll event from bubbling up to CanvasWidget zoom logic
            // This allows the inner TextField to scroll without zooming the canvas
            GestureBinding.instance.pointerSignalResolver.register(event, (event) {});
          }
        },
        child: EmbeddedEditorNode(
          key: ValueKey<String>(node.id),
          node: node,
          isSelected: isSelected,
        ),
      ),
    );
  }
}

class _PositionedFolderControls extends ConsumerWidget {
  const _PositionedFolderControls({
    required this.folder,
  });

  final FolderRegion folder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bounds = folder.visibleBounds;

    return Positioned(
      left: bounds.right - 56,
      top: bounds.top + 14,
      width: 36,
      height: 36,
      child: Listener(
        onPointerSignal: (event) {
          if (event is PointerScrollEvent) {
            GestureBinding.instance.pointerSignalResolver.register(event, (event) {});
          }
        },
        child: Material(
          color: Colors.white,
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
    );
  }
}
