import 'dart:ui';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:graphite/data/repositories/project_repository_impl.dart';

void main() {
  late Directory root;
  late ProjectRepositoryImpl repository;

  setUp(() async {
    root = await Directory.systemTemp.createTemp('graphite_project_test_');
    repository = ProjectRepositoryImpl();
  });

  tearDown(() async {
    if (root.existsSync()) {
      await root.delete(recursive: true);
    }
  });

  test('opens a root as file nodes and repairs metadata', () async {
    await File('${root.path}/README.md').writeAsString('# Example');
    await Directory('${root.path}/lib').create();
    await File('${root.path}/lib/main.dart').writeAsString('void main() {}');

    final project = await repository.openProject(root.path);

    expect(project.nodes.map((node) => node.id), contains('README.md'));
    expect(project.nodes.map((node) => node.id), contains('lib/main.dart'));
    expect(
      project.folderRegions.map((region) => region.relativePath),
      contains('lib'),
    );
    expect(project.folderRegions.single.isCollapsed, isTrue);
    expect(File('${root.path}/.graphite.json').existsSync(), isTrue);
  });

  test('creates a real file when adding a file node', () async {
    final project = await repository.openProject(root.path);

    final updated = await repository.createFile(
      project: project,
      relativePath: 'lib/new_file.dart',
      position: const Offset(10, 20),
      initialContent: 'void main() {}\n',
    );

    expect(File('${root.path}/lib/new_file.dart').existsSync(), isTrue);
    expect(updated.nodes.single.id, 'lib/new_file.dart');
    expect(updated.nodes.single.position, const Offset(10, 20));
    expect(
      _containsRect(
        updated.folderRegions.single.bounds,
        updated.nodes.single.bounds,
      ),
      isTrue,
    );
  });

  test('sync creates nodes for files added outside Graphite', () async {
    final project = await repository.openProject(root.path);
    await Directory('${root.path}/lib').create();
    await File('${root.path}/lib/external.dart').writeAsString('class A {}\n');

    final synced = await repository.syncProject(project);

    expect(synced.nodes.map((node) => node.id), contains('lib/external.dart'));
  });

  test('places default folder regions without overlap', () async {
    await Directory('${root.path}/lib').create();
    await Directory('${root.path}/test').create();
    await Directory('${root.path}/docs').create();
    await File('${root.path}/lib/main.dart').writeAsString('void main() {}\n');
    await File(
      '${root.path}/test/widget_test.dart',
    ).writeAsString('void main() {}\n');
    await File('${root.path}/docs/readme.md').writeAsString('# Docs\n');

    final project = await repository.openProject(root.path);
    final regions = project.folderRegions;

    expect(regions, hasLength(3));
    for (var i = 0; i < regions.length; i += 1) {
      for (var j = i + 1; j < regions.length; j += 1) {
        expect(regions[i].bounds.overlaps(regions[j].bounds), isFalse);
      }
    }
  });

  test('preserves collapsed folder state from metadata', () async {
    await Directory('${root.path}/lib').create();
    await File('${root.path}/lib/main.dart').writeAsString('void main() {}\n');
    await File('${root.path}/.graphite.json').writeAsString('''
{
  "schemaVersion": 1,
  "nodes": {},
  "folders": {
    "lib": {
      "x": 0,
      "y": 0,
      "width": 680,
      "height": 420,
      "color": "#DBEAFE",
      "collapsed": true
    }
  },
  "edges": []
}
''');

    final project = await repository.openProject(root.path);

    expect(project.folderRegions.single.isCollapsed, isTrue);
  });

  test('preserves expanded folder state from metadata', () async {
    await Directory('${root.path}/lib').create();
    await File('${root.path}/lib/main.dart').writeAsString('void main() {}\n');
    await File('${root.path}/.graphite.json').writeAsString('''
{
  "schemaVersion": 1,
  "nodes": {},
  "folders": {
    "lib": {
      "x": 0,
      "y": 0,
      "width": 680,
      "height": 420,
      "color": "#DBEAFE",
      "collapsed": false
    }
  },
  "edges": []
}
''');

    final project = await repository.openProject(root.path);

    expect(project.folderRegions.single.isCollapsed, isFalse);
  });

  test(
    'preserves node positions but derives folder bounds from children',
    () async {
      await Directory('${root.path}/lib').create();
      await File(
        '${root.path}/lib/main.dart',
      ).writeAsString('void main() {}\n');
      await File('${root.path}/.graphite.json').writeAsString('''
{
  "schemaVersion": 1,
  "nodes": {
    "lib/main.dart": {
      "x": 3000,
      "y": 4000,
      "width": 520,
      "height": 360
    }
  },
  "folders": {
    "lib": {
      "x": 0,
      "y": 0,
      "width": 120,
      "height": 90,
      "color": "#FCE7F3",
      "collapsed": false
    }
  },
  "edges": []
}
''');

      final project = await repository.openProject(root.path);
      final node = project.nodes.single;
      final folder = project.folderRegions.single;

      expect(node.position, const Offset(3000, 4000));
      expect(_containsRect(folder.bounds, node.bounds), isTrue);
      expect(folder.bounds.left, isNot(0));
      expect(folder.color, const Color(0xfffce7f3));
      expect(folder.isCollapsed, isFalse);
    },
  );
}

bool _containsRect(Rect outer, Rect inner) {
  return outer.left <= inner.left &&
      outer.top <= inner.top &&
      outer.right >= inner.right &&
      outer.bottom >= inner.bottom;
}
