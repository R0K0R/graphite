import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:graphite/data/models/graphite_metadata_model.dart';
import 'package:graphite/domain/entities/canvas_node.dart';
import 'package:graphite/domain/entities/folder_region.dart';
import 'package:graphite/domain/entities/project_file.dart';
import 'package:graphite/domain/usecases/organize_project_layout.dart';

void main() {
  late OrganizeProjectLayout organizer;

  setUp(() {
    organizer = OrganizeProjectLayout();
  });

  group('organizeInitialLayout', () {
    test('places file nodes inside their parent folder regions', () {
      final files = <ProjectFile>[
        ProjectFile(
          relativePath: 'lib/main.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
        ProjectFile(
          relativePath: 'lib/app.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
      ];

      final input = LayoutInput(
        files: files,
        metadataNodes: const <String, NodeLayoutModel>{},
        metadataFolders: const <String, FolderRegionLayoutModel>{},
      );

      final result = organizer.organizeInitialLayout(input);

      expect(result.nodes, hasLength(2));
      expect(result.folders, hasLength(1));

      final libFolder = result.folders
          .firstWhere((folder) => folder.relativePath == 'lib');
      final mainNode = result.nodes
          .firstWhere((node) => node.id == 'lib/main.dart');
      final appNode = result.nodes
          .firstWhere((node) => node.id == 'lib/app.dart');

      expect(libFolder.bounds.contains(mainNode.bounds.topLeft), isTrue);
      expect(libFolder.bounds.contains(appNode.bounds.topLeft), isTrue);
    });

    test('nested folders are enclosed by their parent folder region', () {
      final files = <ProjectFile>[
        ProjectFile(
          relativePath: 'lib/src/utils.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
      ];

      final input = LayoutInput(
        files: files,
        metadataNodes: const <String, NodeLayoutModel>{},
        metadataFolders: const <String, FolderRegionLayoutModel>{},
      );

      final result = organizer.organizeInitialLayout(input);

      expect(result.folders, hasLength(2));

      final libFolder = result.folders
          .firstWhere((folder) => folder.relativePath == 'lib');
      final srcFolder = result.folders
          .firstWhere((folder) => folder.relativePath == 'lib/src');

      expect(libFolder.bounds.contains(srcFolder.bounds.topLeft), isTrue);
      expect(libFolder.bounds.contains(srcFolder.bounds.bottomRight), isTrue);
    });

    test('sibling files do not overlap after initialization', () {
      final files = <ProjectFile>[
        ProjectFile(
          relativePath: 'lib/a.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
        ProjectFile(
          relativePath: 'lib/b.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
        ProjectFile(
          relativePath: 'lib/c.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
      ];

      final input = LayoutInput(
        files: files,
        metadataNodes: const <String, NodeLayoutModel>{},
        metadataFolders: const <String, FolderRegionLayoutModel>{},
      );

      final result = organizer.organizeInitialLayout(input);

      final nodes = result.nodes;
      expect(nodes, hasLength(3));

      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          expect(nodes[i].bounds.overlaps(nodes[j].bounds), isFalse,
              reason: '${nodes[i].id} overlaps ${nodes[j].id}');
        }
      }
    });

    test('sibling folders do not overlap after initialization', () {
      final files = <ProjectFile>[
        ProjectFile(
          relativePath: 'lib/main.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
        ProjectFile(
          relativePath: 'test/widget_test.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
        ProjectFile(
          relativePath: 'docs/readme.md',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
      ];

      final input = LayoutInput(
        files: files,
        metadataNodes: const <String, NodeLayoutModel>{},
        metadataFolders: const <String, FolderRegionLayoutModel>{},
      );

      final result = organizer.organizeInitialLayout(input);

      final folders = result.folders;
      expect(folders, hasLength(3));

      for (var i = 0; i < folders.length; i++) {
        for (var j = i + 1; j < folders.length; j++) {
          expect(folders[i].bounds.overlaps(folders[j].bounds), isFalse,
              reason:
                  '${folders[i].relativePath} overlaps ${folders[j].relativePath}');
        }
      }
    });

    test('top-level files and folders do not overlap', () {
      final files = <ProjectFile>[
        ProjectFile(
          relativePath: 'README.md',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
        ProjectFile(
          relativePath: 'lib/main.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
      ];

      final input = LayoutInput(
        files: files,
        metadataNodes: const <String, NodeLayoutModel>{},
        metadataFolders: const <String, FolderRegionLayoutModel>{},
      );

      final result = organizer.organizeInitialLayout(input);

      final readmeNode = result.nodes
          .firstWhere((node) => node.id == 'README.md');
      final libFolder = result.folders
          .firstWhere((folder) => folder.relativePath == 'lib');

      expect(readmeNode.bounds.overlaps(libFolder.bounds), isFalse);
    });

    test('preserves persisted node positions', () {
      final files = <ProjectFile>[
        ProjectFile(
          relativePath: 'lib/main.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
      ];

      const customPosition = Offset(1000, 2000);
      const customSize = Size(600, 400);

      final input = LayoutInput(
        files: files,
        metadataNodes: <String, NodeLayoutModel>{
          'lib/main.dart': const NodeLayoutModel(
            position: customPosition,
            size: customSize,
          ),
        },
        metadataFolders: const <String, FolderRegionLayoutModel>{},
      );

      final result = organizer.organizeInitialLayout(input);

      final mainNode = result.nodes
          .firstWhere((node) => node.id == 'lib/main.dart');

      expect(mainNode.position, customPosition);
      expect(mainNode.size, customSize);
    });

    test('preserves folder color and collapsed state', () {
      final files = <ProjectFile>[
        ProjectFile(
          relativePath: 'lib/main.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
      ];

      const customColor = Color(0xffff0000);
      const isCollapsed = false;

      final input = LayoutInput(
        files: files,
        metadataNodes: const <String, NodeLayoutModel>{},
        metadataFolders: <String, FolderRegionLayoutModel>{
          'lib': FolderRegionLayoutModel(
            bounds: const Rect.fromLTWH(0, 0, 680, 420),
            color: customColor,
            isCollapsed: isCollapsed,
          ),
        },
      );

      final result = organizer.organizeInitialLayout(input);

      final libFolder = result.folders
          .firstWhere((folder) => folder.relativePath == 'lib');

      expect(libFolder.color, customColor);
      expect(libFolder.isCollapsed, isCollapsed);
    });
  });

  group('recomputeFolderBounds', () {
    test('moving a child node recomputes folder bounds', () {
      final files = <ProjectFile>[
        ProjectFile(
          relativePath: 'lib/main.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
      ];

      const originalPosition = Offset(100, 100);
      const movedPosition = Offset(5000, 5000);
      const nodeSize = Size(520, 360);

      final originalNode = CanvasNode(
        id: 'lib/main.dart',
        title: 'main.dart',
        content: 'lib/main.dart',
        type: CanvasNodeType.code,
        position: originalPosition,
        size: nodeSize,
        metadata: const <String, Object?>{
          'kind': 'file',
          'relativePath': 'lib/main.dart',
          'extension': '.dart',
        },
      );

      final originalFolder = FolderRegion(
        relativePath: 'lib',
        bounds: const Rect.fromLTWH(50, 50, 680, 420),
        color: const Color(0xffdbeafe),
        isCollapsed: true,
      );

      final movedNode = originalNode.copyWith(position: movedPosition);

      final recomputedFolders = organizer.recomputeFolderBounds(
        files: files,
        nodes: <CanvasNode>[movedNode],
        previousFolders: <FolderRegion>[originalFolder],
      );

      expect(recomputedFolders, hasLength(1));
      final newFolder = recomputedFolders.first;

      expect(newFolder.bounds.contains(movedNode.bounds.topLeft), isTrue);
      expect(newFolder.bounds.contains(movedNode.bounds.bottomRight), isTrue);

      expect(newFolder.color, originalFolder.color);
      expect(newFolder.isCollapsed, originalFolder.isCollapsed);
    });

    test('moving a nested child recomputes all ancestor folders', () {
      final files = <ProjectFile>[
        ProjectFile(
          relativePath: 'lib/src/utils.dart',
          modifiedAt: DateTime(2024, 1, 1),
          sizeBytes: 100,
        ),
      ];

      const movedPosition = Offset(10000, 10000);
      const nodeSize = Size(520, 360);

      final movedNode = CanvasNode(
        id: 'lib/src/utils.dart',
        title: 'utils.dart',
        content: 'lib/src/utils.dart',
        type: CanvasNodeType.code,
        position: movedPosition,
        size: nodeSize,
        metadata: const <String, Object?>{
          'kind': 'file',
          'relativePath': 'lib/src/utils.dart',
          'extension': '.dart',
        },
      );

      final previousFolders = <FolderRegion>[
        FolderRegion(
          relativePath: 'lib',
          bounds: Rect.fromLTWH(0, 0, 1000, 1000),
          color: Color(0xffdbeafe),
          isCollapsed: true,
        ),
        FolderRegion(
          relativePath: 'lib/src',
          bounds: Rect.fromLTWH(50, 50, 680, 420),
          color: Color(0xffdcfce7),
          isCollapsed: true,
        ),
      ];

      final recomputedFolders = organizer.recomputeFolderBounds(
        files: files,
        nodes: <CanvasNode>[movedNode],
        previousFolders: previousFolders,
      );

      expect(recomputedFolders, hasLength(2));

      final srcFolder = recomputedFolders
          .firstWhere((folder) => folder.relativePath == 'lib/src');
      final libFolder = recomputedFolders
          .firstWhere((folder) => folder.relativePath == 'lib');

      expect(srcFolder.bounds.contains(movedNode.bounds.topLeft), isTrue);
      expect(srcFolder.bounds.contains(movedNode.bounds.bottomRight), isTrue);

      expect(libFolder.bounds.contains(srcFolder.bounds.topLeft), isTrue);
      expect(libFolder.bounds.contains(srcFolder.bounds.bottomRight), isTrue);
    });
  });
}
