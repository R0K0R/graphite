import 'dart:math' as math;
import 'dart:ui';

import 'package:path/path.dart' as p;

import '../entities/canvas_node.dart';
import '../entities/folder_region.dart';
import '../entities/project_file.dart';
import '../../data/models/graphite_metadata_model.dart';

class LayoutInput {
  const LayoutInput({
    required this.files,
    required this.metadataNodes,
    required this.metadataFolders,
  });

  final List<ProjectFile> files;
  final Map<String, NodeLayoutModel> metadataNodes;
  final Map<String, FolderRegionLayoutModel> metadataFolders;
}

class LayoutResult {
  const LayoutResult({
    required this.nodes,
    required this.folders,
  });

  final List<CanvasNode> nodes;
  final List<FolderRegion> folders;
}

class _DirEntry {
  _DirEntry({required this.path});

  final String path;
  final List<ProjectFile> directFiles = <ProjectFile>[];
  final Map<String, _DirEntry> childDirs = <String, _DirEntry>{};

  _DirEntry getOrCreateChildDir(String childPath) {
    return childDirs.putIfAbsent(childPath, () => _DirEntry(path: childPath));
  }
}

class _LayoutItem {
  const _LayoutItem({
    required this.key,
    required this.isFolder,
    required this.size,
    required this.placeAt,
  });

  final String key;
  final bool isFolder;
  final Size size;
  final void Function(Offset origin) placeAt;
}

class _Placement {
  const _Placement({
    required this.item,
    required this.origin,
  });

  final _LayoutItem item;
  final Offset origin;
}

class OrganizeProjectLayout {
  OrganizeProjectLayout({
    this.defaultNodeSize = const Size(520, 360),
    this.minFolderSize = const Size(680, 420),
    this.folderPadding = 40.0,
    this.folderHeaderHeight = 88.0,
    this.gapX = 48.0,
    this.gapY = 48.0,
    this.rootTargetRowWidth = 2600.0,
    this.folderTargetRowWidth = 1800.0,
    List<Color>? folderColors,
  }) : folderColors = folderColors ??
            const <Color>[
              Color(0xffdbeafe),
              Color(0xffdcfce7),
              Color(0xfffef3c7),
              Color(0xfffce7f3),
              Color(0xffede9fe),
              Color(0xffe0f2fe),
            ];

  final Size defaultNodeSize;
  final Size minFolderSize;
  final double folderPadding;
  final double folderHeaderHeight;
  final double gapX;
  final double gapY;
  final double rootTargetRowWidth;
  final double folderTargetRowWidth;
  final List<Color> folderColors;

  LayoutResult organizeInitialLayout(LayoutInput input) {
    final tree = _buildTree(input.files);
    final mutableNodes = <String, CanvasNode>{};
    final mutableFolders = <String, FolderRegion>{};

    _layoutDirectory(
      dir: tree,
      origin: Offset.zero,
      isRoot: true,
      input: input,
      nodesOut: mutableNodes,
      foldersOut: mutableFolders,
    );

    final nodes = <CanvasNode>[
      for (final file in input.files)
        if (mutableNodes.containsKey(file.relativePath))
          mutableNodes[file.relativePath]!,
    ];

    final folders = mutableFolders.values.toList()
      ..sort((a, b) => a.relativePath.compareTo(b.relativePath));

    return LayoutResult(nodes: nodes, folders: folders);
  }

  List<FolderRegion> recomputeFolderBounds({
    required List<ProjectFile> files,
    required List<CanvasNode> nodes,
    required List<FolderRegion> previousFolders,
  }) {
    final tree = _buildTree(files);
    final nodeByPath = <String, CanvasNode>{
      for (final node in nodes)
        if (node.metadata['relativePath'] is String)
          node.metadata['relativePath']! as String: node,
    };
    final previousFolderByPath = <String, FolderRegion>{
      for (final folder in previousFolders) folder.relativePath: folder,
    };
    final nextFolders = <String, FolderRegion>{};

    _computeDirBounds(
      dir: tree,
      isRoot: true,
      nodeByPath: nodeByPath,
      previousFolderByPath: previousFolderByPath,
      nextFolders: nextFolders,
    );

    final result = nextFolders.values.toList()
      ..sort((a, b) => a.relativePath.compareTo(b.relativePath));
    return result;
  }

  _DirEntry _buildTree(List<ProjectFile> files) {
    final root = _DirEntry(path: '');
    final sorted = files.toList()
      ..sort((a, b) => a.relativePath.compareTo(b.relativePath));

    for (final file in sorted) {
      final parts = p.posix.split(file.relativePath);
      if (parts.isEmpty) {
        continue;
      }

      final dirParts = parts.sublist(0, parts.length - 1);
      var current = root;
      var currentPath = '';

      for (final part in dirParts) {
        currentPath = currentPath.isEmpty ? part : p.posix.join(currentPath, part);
        current = current.getOrCreateChildDir(currentPath);
      }

      current.directFiles.add(file);
    }

    for (final dir in _allDirs(root)) {
      dir.directFiles.sort((a, b) => a.relativePath.compareTo(b.relativePath));
    }

    return root;
  }

  List<_DirEntry> _allDirs(_DirEntry root) {
    final result = <_DirEntry>[root];
    for (final child in root.childDirs.values) {
      result.addAll(_allDirs(child));
    }
    return result;
  }

  void _layoutDirectory({
    required _DirEntry dir,
    required Offset origin,
    required bool isRoot,
    required LayoutInput input,
    required Map<String, CanvasNode> nodesOut,
    required Map<String, FolderRegion> foldersOut,
  }) {
    final padding = isRoot ? 0.0 : folderPadding;
    final headerHeight = isRoot ? 0.0 : folderHeaderHeight;
    final targetRowWidth = isRoot ? rootTargetRowWidth : folderTargetRowWidth;

    final items = <_LayoutItem>[];

    final sortedChildDirs = dir.childDirs.values.toList()
      ..sort((a, b) => a.path.compareTo(b.path));

    for (final childDir in sortedChildDirs) {
      final childMeasure = _measureDirectory(childDir, input);
      items.add(_LayoutItem(
        key: childDir.path,
        isFolder: true,
        size: childMeasure,
        placeAt: (childOrigin) => _layoutDirectory(
          dir: childDir,
          origin: childOrigin,
          isRoot: false,
          input: input,
          nodesOut: nodesOut,
          foldersOut: foldersOut,
        ),
      ));
    }

    for (final file in dir.directFiles) {
      final layout = input.metadataNodes[file.relativePath];
      final size = layout?.size ?? defaultNodeSize;

      if (layout != null) {
        nodesOut[file.relativePath] = CanvasNode(
          id: file.relativePath,
          title: file.displayName,
          content: file.relativePath,
          type: CanvasNodeType.code,
          position: layout.position,
          size: size,
          metadata: <String, Object?>{
            'kind': 'file',
            'relativePath': file.relativePath,
            'extension': file.extension,
          },
        );
      } else {
        items.add(_LayoutItem(
          key: file.relativePath,
          isFolder: false,
          size: size,
          placeAt: (fileOrigin) {
            nodesOut[file.relativePath] = CanvasNode(
              id: file.relativePath,
              title: file.displayName,
              content: file.relativePath,
              type: CanvasNodeType.code,
              position: fileOrigin,
              size: size,
              metadata: <String, Object?>{
                'kind': 'file',
                'relativePath': file.relativePath,
                'extension': file.extension,
              },
            );
          },
        ));
      }
    }

    items.sort((a, b) => a.key.compareTo(b.key));

    final contentOrigin = origin + Offset(padding, padding + headerHeight);
    final placements = _packRows(
      items: items,
      origin: contentOrigin,
      targetRowWidth: targetRowWidth,
      gapX: gapX,
      gapY: gapY,
    );

    for (final placement in placements) {
      placement.item.placeAt(placement.origin);
    }

    if (isRoot) {
      return;
    }

    final childBounds = <Rect>[];

    for (final placement in placements) {
      childBounds.add(placement.origin & placement.item.size);
    }

    for (final file in dir.directFiles) {
      final node = nodesOut[file.relativePath];
      if (node != null && input.metadataNodes.containsKey(file.relativePath)) {
        childBounds.add(node.bounds);
      }
    }

    final contentBounds = childBounds.isEmpty
        ? Rect.fromLTWH(contentOrigin.dx, contentOrigin.dy, 0, 0)
        : _unionRects(childBounds);

    final folderBounds = Rect.fromLTRB(
      contentBounds.left - padding,
      contentBounds.top - padding - headerHeight,
      contentBounds.right + padding,
      contentBounds.bottom + padding,
    );

    final atLeastMinSize = Rect.fromLTWH(
      folderBounds.left,
      folderBounds.top,
      math.max(folderBounds.width, minFolderSize.width),
      math.max(folderBounds.height, minFolderSize.height),
    );

    final folderMeta = input.metadataFolders[dir.path];
    foldersOut[dir.path] = FolderRegion(
      relativePath: dir.path,
      bounds: atLeastMinSize,
      color: folderMeta?.color ?? _colorForPath(dir.path),
      isCollapsed: folderMeta?.isCollapsed ?? true,
    );
  }

  Size _measureDirectory(_DirEntry dir, LayoutInput input) {
    final padding = folderPadding;
    final headerHeight = folderHeaderHeight;
    final targetRowWidth = folderTargetRowWidth;

    final childSizes = <_MeasuredItem>[];

    final sortedChildDirs = dir.childDirs.values.toList()
      ..sort((a, b) => a.path.compareTo(b.path));

    for (final childDir in sortedChildDirs) {
      final childMeasure = _measureDirectory(childDir, input);
      childSizes.add(_MeasuredItem(key: childDir.path, size: childMeasure));
    }

    for (final file in dir.directFiles) {
      final layout = input.metadataNodes[file.relativePath];
      final size = layout?.size ?? defaultNodeSize;
      childSizes.add(_MeasuredItem(key: file.relativePath, size: size));
    }

    childSizes.sort((a, b) => a.key.compareTo(b.key));

    final packedContentBounds = _measurePackedRows(
      items: childSizes,
      targetRowWidth: targetRowWidth,
      gapX: gapX,
      gapY: gapY,
    );

    return Size(
      math.max(minFolderSize.width, packedContentBounds.width + padding * 2),
      math.max(
        minFolderSize.height,
        packedContentBounds.height + padding * 2 + headerHeight,
      ),
    );
  }

  List<_Placement> _packRows({
    required List<_LayoutItem> items,
    required Offset origin,
    required double targetRowWidth,
    required double gapX,
    required double gapY,
  }) {
    final placements = <_Placement>[];
    var cursor = origin;
    var rowTop = origin.dy;
    var rowHeight = 0.0;

    for (final item in items) {
      final wouldExceedRow = cursor.dx > origin.dx &&
          cursor.dx + item.size.width > origin.dx + targetRowWidth;

      if (wouldExceedRow) {
        cursor = Offset(origin.dx, rowTop + rowHeight + gapY);
        rowTop = cursor.dy;
        rowHeight = 0.0;
      }

      placements.add(_Placement(item: item, origin: cursor));

      cursor = Offset(cursor.dx + item.size.width + gapX, cursor.dy);
      rowHeight = math.max(rowHeight, item.size.height);
    }

    return placements;
  }

  Size _measurePackedRows({
    required List<_MeasuredItem> items,
    required double targetRowWidth,
    required double gapX,
    required double gapY,
  }) {
    if (items.isEmpty) {
      return Size.zero;
    }

    var cursorX = 0.0;
    var rowTop = 0.0;
    var rowHeight = 0.0;
    var maxWidth = 0.0;

    for (final item in items) {
      final wouldExceedRow =
          cursorX > 0 && cursorX + item.size.width > targetRowWidth;

      if (wouldExceedRow) {
        cursorX = 0.0;
        rowTop = rowTop + rowHeight + gapY;
        rowHeight = 0.0;
      }

      final itemRight = cursorX + item.size.width;
      maxWidth = math.max(maxWidth, itemRight);

      cursorX = itemRight + gapX;
      rowHeight = math.max(rowHeight, item.size.height);
    }

    final totalHeight = rowTop + rowHeight;
    return Size(maxWidth, totalHeight);
  }

  Rect _computeDirBounds({
    required _DirEntry dir,
    required bool isRoot,
    required Map<String, CanvasNode> nodeByPath,
    required Map<String, FolderRegion> previousFolderByPath,
    required Map<String, FolderRegion> nextFolders,
  }) {
    final childRects = <Rect>[];

    final sortedChildDirs = dir.childDirs.values.toList()
      ..sort((a, b) => a.path.compareTo(b.path));

    for (final childDir in sortedChildDirs) {
      final childBounds = _computeDirBounds(
        dir: childDir,
        isRoot: false,
        nodeByPath: nodeByPath,
        previousFolderByPath: previousFolderByPath,
        nextFolders: nextFolders,
      );
      childRects.add(childBounds);
    }

    for (final file in dir.directFiles) {
      final node = nodeByPath[file.relativePath];
      if (node != null) {
        childRects.add(node.bounds);
      }
    }

    final contentBounds = childRects.isEmpty
        ? Rect.fromLTWH(0, 0, minFolderSize.width, minFolderSize.height)
        : _unionRects(childRects);

    if (isRoot) {
      return contentBounds;
    }

    final padding = folderPadding;
    final headerHeight = folderHeaderHeight;

    final folderBounds = Rect.fromLTRB(
      contentBounds.left - padding,
      contentBounds.top - padding - headerHeight,
      contentBounds.right + padding,
      contentBounds.bottom + padding,
    );

    final atLeastMinSize = Rect.fromLTWH(
      folderBounds.left,
      folderBounds.top,
      math.max(folderBounds.width, minFolderSize.width),
      math.max(folderBounds.height, minFolderSize.height),
    );

    final previous = previousFolderByPath[dir.path];
    nextFolders[dir.path] = FolderRegion(
      relativePath: dir.path,
      bounds: atLeastMinSize,
      color: previous?.color ?? _colorForPath(dir.path),
      isCollapsed: previous?.isCollapsed ?? true,
    );

    return atLeastMinSize;
  }

  Rect _unionRects(List<Rect> rects) {
    if (rects.isEmpty) {
      return Rect.zero;
    }
    var result = rects.first;
    for (var i = 1; i < rects.length; i++) {
      result = result.expandToInclude(rects[i]);
    }
    return result;
  }

  Color _colorForPath(String path) {
    final hash = path.hashCode.abs();
    return folderColors[hash % folderColors.length];
  }
}

class _MeasuredItem {
  const _MeasuredItem({
    required this.key,
    required this.size,
  });

  final String key;
  final Size size;
}
