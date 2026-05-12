import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:graphite/domain/entities/canvas_node.dart';
import 'package:graphite/domain/entities/folder_region.dart';
import 'package:graphite/domain/entities/project_file.dart';
import 'package:graphite/domain/usecases/organize_project_layout.dart';
import 'package:path/path.dart' as p;

void main() {
  const defaultNodeSize = Size(520, 360);
  const folderColors = <Color>[Color(0xffdbeafe), Color(0xffdcfce7)];

  test(
    'initializes nested folders with containment and no sibling overlap',
    () {
      final files = <ProjectFile>[
        _file('README.md'),
        _file('lib/main.dart'),
        _file('lib/src/a.dart'),
        _file('lib/src/b.dart'),
        _file('test/widget_test.dart'),
      ];

      final layout = ProjectLayoutOrganizer.organize(
        files: files,
        existingNodesByPath: const <String, CanvasNode>{},
        previousFolders: const <FolderRegion>[],
        defaultNodeSize: defaultNodeSize,
        folderColors: folderColors,
        createNode: _nodeForFile,
      );

      final nodeByPath = {for (final node in layout.nodes) node.id: node};
      final folderByPath = {
        for (final folder in layout.folderRegions) folder.relativePath: folder,
      };

      for (final node in layout.nodes) {
        for (final ancestor in _ancestorFolders(node.id)) {
          expect(
            _containsRect(folderByPath[ancestor]!.bounds, node.bounds),
            isTrue,
            reason: '$ancestor should contain ${node.id}',
          );
        }
      }

      expect(
        _containsRect(
          folderByPath['lib']!.bounds,
          folderByPath['lib/src']!.bounds,
        ),
        isTrue,
      );
      _expectNoOverlaps([
        nodeByPath['README.md']!.visualBounds,
        folderByPath['lib']!.bounds,
        folderByPath['test']!.bounds,
      ]);
      final topLevelCenters = <Offset>[
        nodeByPath['README.md']!.visualBounds.center,
        folderByPath['lib']!.bounds.center,
        folderByPath['test']!.bounds.center,
      ];
      expect(topLevelCenters.map((center) => center.dx).toSet(), hasLength(3));
      expect(
        topLevelCenters.map((center) => center.dy).toSet().length,
        greaterThan(1),
      );

      for (final folder in layout.folderRegions) {
        _expectNoOverlaps(
          _directChildRects(folder.relativePath, nodeByPath, folderByPath),
        );
      }
    },
  );

  test('recomputes folder envelopes after node movement', () {
    final files = <ProjectFile>[_file('lib/src/a.dart')];
    final initial = ProjectLayoutOrganizer.organize(
      files: files,
      existingNodesByPath: const <String, CanvasNode>{},
      previousFolders: const <FolderRegion>[
        FolderRegion(
          relativePath: 'lib',
          bounds: Rect.zero,
          color: Color(0xff111111),
          isCollapsed: false,
        ),
        FolderRegion(
          relativePath: 'lib/src',
          bounds: Rect.zero,
          color: Color(0xff222222),
          isCollapsed: false,
        ),
      ],
      defaultNodeSize: defaultNodeSize,
      folderColors: folderColors,
      createNode: _nodeForFile,
    );
    final movedNode = initial.nodes.single.copyWith(
      position: const Offset(5000, 3000),
    );

    final folders = ProjectLayoutOrganizer.recomputeFolderRegions(
      files: files,
      nodes: <CanvasNode>[movedNode],
      previousFolders: initial.folderRegions,
      folderColors: folderColors,
    );
    final folderByPath = {
      for (final folder in folders) folder.relativePath: folder,
    };

    expect(
      _containsRect(folderByPath['lib/src']!.bounds, movedNode.bounds),
      isTrue,
    );
    expect(
      _containsRect(
        folderByPath['lib']!.bounds,
        folderByPath['lib/src']!.bounds,
      ),
      isTrue,
    );
    expect(folderByPath['lib']!.isCollapsed, isFalse);
    expect(folderByPath['lib/src']!.color, const Color(0xff222222));
  });
}

ProjectFile _file(String relativePath) {
  return ProjectFile(
    relativePath: relativePath,
    modifiedAt: DateTime(2026),
    sizeBytes: 1,
  );
}

CanvasNode _nodeForFile(ProjectFile file, Offset position, Size size) {
  return CanvasNode(
    id: file.relativePath,
    title: file.displayName,
    content: file.relativePath,
    type: CanvasNodeType.code,
    position: position,
    size: size,
    metadata: <String, Object?>{
      'kind': 'file',
      'relativePath': file.relativePath,
      'extension': file.extension,
    },
  );
}

List<String> _ancestorFolders(String relativePath) {
  final ancestors = <String>[];
  var parent = p.posix.dirname(relativePath);
  while (parent != '.') {
    ancestors.add(parent);
    parent = p.posix.dirname(parent);
  }
  return ancestors;
}

List<Rect> _directChildRects(
  String folderPath,
  Map<String, CanvasNode> nodeByPath,
  Map<String, FolderRegion> folderByPath,
) {
  final rects = <Rect>[];
  for (final entry in nodeByPath.entries) {
    if (p.posix.dirname(entry.key) == folderPath) {
      rects.add(entry.value.visualBounds);
    }
  }
  for (final entry in folderByPath.entries) {
    if (entry.key != folderPath && p.posix.dirname(entry.key) == folderPath) {
      rects.add(entry.value.bounds);
    }
  }
  return rects;
}

void _expectNoOverlaps(List<Rect> rects) {
  for (var i = 0; i < rects.length; i += 1) {
    for (var j = i + 1; j < rects.length; j += 1) {
      expect(
        rects[i].overlaps(rects[j]),
        isFalse,
        reason: '${rects[i]} should not overlap ${rects[j]}',
      );
    }
  }
}

bool _containsRect(Rect outer, Rect inner) {
  return outer.left <= inner.left &&
      outer.top <= inner.top &&
      outer.right >= inner.right &&
      outer.bottom >= inner.bottom;
}
