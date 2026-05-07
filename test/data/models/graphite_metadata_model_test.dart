import 'package:flutter_test/flutter_test.dart';
import 'package:graphite/data/models/graphite_metadata_model.dart';

void main() {
  test('parses and serializes Graphite canvas metadata', () {
    final metadata = GraphiteMetadataModel.fromJson(<String, Object?>{
      'schemaVersion': 1,
      'nodes': <String, Object?>{
        'lib/main.dart': <String, Object?>{
          'x': 120,
          'y': 80,
          'width': 520,
          'height': 360,
        },
      },
      'folders': <String, Object?>{
        'lib': <String, Object?>{
          'x': 80,
          'y': 40,
          'width': 1400,
          'height': 900,
          'color': '#DBEAFE',
          'collapsed': true,
        },
      },
      'edges': <Map<String, Object?>>[
        <String, Object?>{
          'id': 'edge-1',
          'sourcePath': 'lib/main.dart',
          'targetPath': 'lib/app.dart',
          'label': 'imports',
        },
      ],
    });

    expect(metadata.nodes['lib/main.dart']?.position.dx, 120);
    expect(metadata.folders['lib']?.bounds.width, 1400);
    expect(metadata.folders['lib']?.isCollapsed, isTrue);
    expect(metadata.edges.single.sourceNodeId, 'lib/main.dart');

    final encoded = metadata.toJson();
    expect(encoded['schemaVersion'], 1);
    expect((encoded['nodes'] as Map).containsKey('lib/main.dart'), isTrue);
    expect(((encoded['folders'] as Map)['lib'] as Map)['collapsed'], isTrue);
  });

  test('defaults folders to collapsed when metadata omits collapsed', () {
    final metadata = GraphiteMetadataModel.fromJson(<String, Object?>{
      'folders': <String, Object?>{
        'lib': <String, Object?>{
          'x': 80,
          'y': 40,
          'width': 1400,
          'height': 900,
          'color': '#DBEAFE',
        },
      },
    });

    expect(metadata.folders['lib']?.isCollapsed, isTrue);
  });
}
