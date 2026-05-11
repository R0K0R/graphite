import 'dart:math' as math;
import 'dart:ui';

import 'package:path/path.dart' as p;

import '../entities/canvas_node.dart';
import '../entities/folder_region.dart';
import '../entities/project_file.dart';

typedef CanvasNodeFactory =
    CanvasNode Function(ProjectFile file, Offset position, Size size);

class OrganizedProjectLayout {
  const OrganizedProjectLayout({
    required this.nodes,
    required this.folderRegions,
  });

  final List<CanvasNode> nodes;
  final List<FolderRegion> folderRegions;
}

class ProjectLayoutOrganizer {
  const ProjectLayoutOrganizer._();

  static const double folderPadding = 40;
  static const double folderHeaderHeight = 88;
  static const double itemGapX = 48;
  static const double itemGapY = 48;
  static const double rootTargetRowWidth = 2600;
  static const double folderTargetRowWidth = 1800;
  static const double minFolderWidth = 680;
  static const double minFolderHeight = 520;

  static OrganizedProjectLayout organize({
    required List<ProjectFile> files,
    required Map<String, CanvasNode> existingNodesByPath,
    required List<FolderRegion> previousFolders,
    required Size defaultNodeSize,
    required List<Color> folderColors,
    required CanvasNodeFactory createNode,
  }) {
    final tree = _buildTree(files);
    final idealNodes = <String, _MeasuredFile>{};
    _layoutDirectory(
      tree,
      origin: Offset.zero,
      isRoot: true,
      defaultNodeSize: defaultNodeSize,
      existingNodesByPath: existingNodesByPath,
      measuredFiles: idealNodes,
    );

    final nodes = <CanvasNode>[
      for (final file in files)
        existingNodesByPath[file.relativePath] ??
            createNode(
              file,
              idealNodes[file.relativePath]?.position ?? Offset.zero,
              idealNodes[file.relativePath]?.size ?? defaultNodeSize,
            ),
    ];

    return OrganizedProjectLayout(
      nodes: nodes,
      folderRegions: recomputeFolderRegions(
        files: files,
        nodes: nodes,
        previousFolders: previousFolders,
        folderColors: folderColors,
      ),
    );
  }

  static List<FolderRegion> recomputeFolderRegions({
    required List<ProjectFile> files,
    required List<CanvasNode> nodes,
    required List<FolderRegion> previousFolders,
    required List<Color> folderColors,
  }) {
    final tree = _buildTree(files);
    final nodeByPath = <String, CanvasNode>{
      for (final node in nodes)
        (node.metadata['relativePath'] as String?) ?? node.id: node,
    };
    final previousFolderByPath = <String, FolderRegion>{
      for (final folder in previousFolders) folder.relativePath: folder,
    };
    final colorByPath = _folderColorMap(tree, folderColors);
    final nextFolders = <String, FolderRegion>{};

    _computeDirectoryBounds(
      tree,
      isRoot: true,
      nodeByPath: nodeByPath,
      previousFolderByPath: previousFolderByPath,
      colorByPath: colorByPath,
      nextFolders: nextFolders,
    );

    return nextFolders.values.toList(growable: false)
      ..sort((a, b) => a.relativePath.compareTo(b.relativePath));
  }

  static _DirEntry _buildTree(List<ProjectFile> files) {
    final root = _DirEntry('');
    final sortedFiles = [...files]
      ..sort((a, b) => a.relativePath.compareTo(b.relativePath));

    for (final file in sortedFiles) {
      final dirPath = p.posix.dirname(file.relativePath);
      final dirParts = dirPath == '.' ? const <String>[] : dirPath.split('/');
      var current = root;
      var currentPath = '';

      for (final part in dirParts) {
        currentPath = currentPath.isEmpty ? part : '$currentPath/$part';
        current = current.childDir(currentPath);
      }

      current.directFiles.add(file);
    }

    root.sortRecursively();
    return root;
  }

  static Size _measureDirectory(
    _DirEntry dir, {
    required Size defaultNodeSize,
    required Map<String, CanvasNode> existingNodesByPath,
  }) {
    final items = _layoutItemsForDirectory(
      dir,
      defaultNodeSize: defaultNodeSize,
      existingNodesByPath: existingNodesByPath,
    );
    final contentSize = _measurePackedRows(
      items,
      targetRowWidth: folderTargetRowWidth,
    );
    return Size(
      math.max(minFolderWidth, contentSize.width + folderPadding * 2),
      math.max(
        minFolderHeight,
        contentSize.height + folderPadding * 2 + folderHeaderHeight,
      ),
    );
  }

  static void _layoutDirectory(
    _DirEntry dir, {
    required Offset origin,
    required bool isRoot,
    required Size defaultNodeSize,
    required Map<String, CanvasNode> existingNodesByPath,
    required Map<String, _MeasuredFile> measuredFiles,
  }) {
    final items = _layoutItemsForDirectory(
      dir,
      defaultNodeSize: defaultNodeSize,
      existingNodesByPath: existingNodesByPath,
    );
    final contentOrigin = origin.translate(
      isRoot ? 0 : folderPadding,
      isRoot ? 0 : folderPadding + folderHeaderHeight,
    );
    final placements = _packRows(
      items,
      origin: contentOrigin,
      targetRowWidth: isRoot ? rootTargetRowWidth : folderTargetRowWidth,
    );

    for (final placement in placements) {
      final item = placement.item;
      switch (item.kind) {
        case _LayoutItemKind.file:
          measuredFiles[item.key] = _MeasuredFile(
            position: placement.origin,
            size: item.size,
          );
          break;
        case _LayoutItemKind.folder:
          _layoutDirectory(
            item.dir!,
            origin: placement.origin,
            isRoot: false,
            defaultNodeSize: defaultNodeSize,
            existingNodesByPath: existingNodesByPath,
            measuredFiles: measuredFiles,
          );
          break;
      }
    }
  }

  static List<_LayoutItem> _layoutItemsForDirectory(
    _DirEntry dir, {
    required Size defaultNodeSize,
    required Map<String, CanvasNode> existingNodesByPath,
  }) {
    final items = <_LayoutItem>[
      for (final childDir in dir.childDirs)
        _LayoutItem(
          key: childDir.path,
          kind: _LayoutItemKind.folder,
          size: _measureDirectory(
            childDir,
            defaultNodeSize: defaultNodeSize,
            existingNodesByPath: existingNodesByPath,
          ),
          dir: childDir,
        ),
      for (final file in dir.directFiles)
        _LayoutItem(
          key: file.relativePath,
          kind: _LayoutItemKind.file,
          size: existingNodesByPath[file.relativePath]?.size ?? defaultNodeSize,
        ),
    ];
    return items..sort((a, b) => a.key.compareTo(b.key));
  }

  static Size _measurePackedRows(
    List<_LayoutItem> items, {
    required double targetRowWidth,
  }) {
    if (items.isEmpty) {
      return Size.zero;
    }

    final placements = _packRows(
      items,
      origin: Offset.zero,
      targetRowWidth: targetRowWidth,
    );
    final bounds = _unionRects([
      for (final placement in placements)
        placement.origin & placement.item.size,
    ]);
    return bounds.size;
  }

  static List<_Placement> _packRows(
    List<_LayoutItem> items, {
    required Offset origin,
    required double targetRowWidth,
  }) {
    final placements = <_Placement>[];
    var cursor = origin;
    var rowTop = origin.dy;
    var rowHeight = 0.0;

    for (final item in items) {
      final wouldExceedRow =
          cursor.dx > origin.dx &&
          cursor.dx + item.size.width > origin.dx + targetRowWidth;

      if (wouldExceedRow) {
        cursor = Offset(origin.dx, rowTop + rowHeight + itemGapY);
        rowTop = cursor.dy;
        rowHeight = 0;
      }

      placements.add(_Placement(item: item, origin: cursor));
      cursor = Offset(cursor.dx + item.size.width + itemGapX, cursor.dy);
      rowHeight = math.max(rowHeight, item.size.height);
    }

    return placements;
  }

  static Rect _computeDirectoryBounds(
    _DirEntry dir, {
    required bool isRoot,
    required Map<String, CanvasNode> nodeByPath,
    required Map<String, FolderRegion> previousFolderByPath,
    required Map<String, Color> colorByPath,
    required Map<String, FolderRegion> nextFolders,
  }) {
    final childRects = <Rect>[
      for (final childDir in dir.childDirs)
        _computeDirectoryBounds(
          childDir,
          isRoot: false,
          nodeByPath: nodeByPath,
          previousFolderByPath: previousFolderByPath,
          colorByPath: colorByPath,
          nextFolders: nextFolders,
        ),
      for (final file in dir.directFiles)
        if (nodeByPath[file.relativePath] != null)
          nodeByPath[file.relativePath]!.bounds,
    ];

    final contentBounds = childRects.isEmpty
        ? Rect.fromLTWH(0, 0, minFolderWidth, minFolderHeight)
        : _unionRects(childRects);

    if (isRoot) {
      return contentBounds;
    }

    final folderBounds = _folderBoundsForContent(contentBounds);
    final previous = previousFolderByPath[dir.path];
    nextFolders[dir.path] = FolderRegion(
      relativePath: dir.path,
      bounds: folderBounds,
      color:
          previous?.color ?? colorByPath[dir.path] ?? const Color(0xffdbeafe),
      isCollapsed: previous?.isCollapsed ?? true,
    );
    return folderBounds;
  }

  static Rect _folderBoundsForContent(Rect contentBounds) {
    final rawBounds = Rect.fromLTRB(
      contentBounds.left - folderPadding,
      contentBounds.top - folderPadding - folderHeaderHeight,
      contentBounds.right + folderPadding,
      contentBounds.bottom + folderPadding,
    );
    return Rect.fromLTWH(
      rawBounds.left,
      rawBounds.top,
      math.max(minFolderWidth, rawBounds.width),
      math.max(minFolderHeight, rawBounds.height),
    );
  }

  static Rect _unionRects(List<Rect> rects) {
    assert(rects.isNotEmpty, 'Cannot union an empty rect list.');
    var result = rects.first;
    for (final rect in rects.skip(1)) {
      result = result.expandToInclude(rect);
    }
    return result;
  }

  static Map<String, Color> _folderColorMap(
    _DirEntry root,
    List<Color> folderColors,
  ) {
    if (folderColors.isEmpty) {
      return const <String, Color>{};
    }

    final paths = <String>[];
    void collect(_DirEntry dir) {
      for (final child in dir.childDirs) {
        paths.add(child.path);
        collect(child);
      }
    }

    collect(root);
    paths.sort();
    return <String, Color>{
      for (var index = 0; index < paths.length; index += 1)
        paths[index]: folderColors[index % folderColors.length],
    };
  }
}

class _DirEntry {
  _DirEntry(this.path);

  final String path;
  final List<ProjectFile> directFiles = <ProjectFile>[];
  final Map<String, _DirEntry> _childDirsByPath = <String, _DirEntry>{};

  List<_DirEntry> get childDirs => _childDirsByPath.values.toList();

  _DirEntry childDir(String path) {
    return _childDirsByPath.putIfAbsent(path, () => _DirEntry(path));
  }

  void sortRecursively() {
    directFiles.sort((a, b) => a.relativePath.compareTo(b.relativePath));
    for (final child in _childDirsByPath.values) {
      child.sortRecursively();
    }
  }
}

enum _LayoutItemKind { file, folder }

class _LayoutItem {
  const _LayoutItem({
    required this.key,
    required this.kind,
    required this.size,
    this.dir,
  });

  final String key;
  final _LayoutItemKind kind;
  final Size size;
  final _DirEntry? dir;
}

class _Placement {
  const _Placement({required this.item, required this.origin});

  final _LayoutItem item;
  final Offset origin;
}

class _MeasuredFile {
  const _MeasuredFile({required this.position, required this.size});

  final Offset position;
  final Size size;
}
