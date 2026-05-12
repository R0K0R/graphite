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
  static const double radialGap = 140;
  static const double minimumRingRadius = 360;
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
    final contentSize = _measureRadialLayout(items).size;
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
    final center = isRoot
        ? origin
        : _contentCenterForFolder(
            origin,
            _measureDirectory(
              dir,
              defaultNodeSize: defaultNodeSize,
              existingNodesByPath: existingNodesByPath,
            ),
          );
    final placements = _radialPlacements(items, center: center);

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

  static Rect _measureRadialLayout(List<_LayoutItem> items) {
    if (items.isEmpty) {
      return Rect.zero;
    }

    final placements = _radialPlacements(items, center: Offset.zero);
    return _unionRects([
      for (final placement in placements)
        placement.origin & placement.item.size,
    ]);
  }

  static List<_Placement> _radialPlacements(
    List<_LayoutItem> items, {
    required Offset center,
  }) {
    if (items.isEmpty) {
      return const <_Placement>[];
    }
    if (items.length == 1) {
      final item = items.single;
      return <_Placement>[
        _Placement(
          item: item,
          origin: center - Offset(item.size.width / 2, item.size.height / 2),
        ),
      ];
    }

    final placements = <_Placement>[];
    final maxRadius = items
        .map((item) => _itemRadius(item.size))
        .reduce(math.max);
    final ringStep = maxRadius * 2 + radialGap;
    var ringRadius = math.max(minimumRingRadius, maxRadius + radialGap);
    var index = 0;

    while (index < items.length) {
      final capacity = math.max(
        1,
        (math.pi * 2 * ringRadius / (maxRadius * 2 + itemGapX)).floor(),
      );
      final end = math.min(items.length, index + capacity);
      final ringItems = items.sublist(index, end);
      final angleStep = (math.pi * 2) / ringItems.length;
      for (var ringIndex = 0; ringIndex < ringItems.length; ringIndex += 1) {
        final item = ringItems[ringIndex];
        final angle = -math.pi / 2 + ringIndex * angleStep;
        final itemCenter = center.translate(
          math.cos(angle) * ringRadius,
          math.sin(angle) * ringRadius,
        );
        placements.add(
          _Placement(
            item: item,
            origin:
                itemCenter - Offset(item.size.width / 2, item.size.height / 2),
          ),
        );
      }
      index = end;
      ringRadius += ringStep;
    }
    return placements;
  }

  static double _itemRadius(Size size) {
    return math.sqrt(size.width * size.width + size.height * size.height) / 2;
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
          nodeByPath[file.relativePath]!.visualBounds,
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

  static Offset _contentCenterForFolder(Offset folderOrigin, Size folderSize) {
    final contentHeight = math.max(
      0,
      folderSize.height - folderHeaderHeight - folderPadding * 2,
    );
    return Offset(
      folderOrigin.dx + folderSize.width / 2,
      folderOrigin.dy + folderPadding + folderHeaderHeight + contentHeight / 2,
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
