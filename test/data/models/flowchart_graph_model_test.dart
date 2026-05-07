import 'package:flutter_test/flutter_test.dart';
import 'package:graphite/data/models/flowchart_graph_model.dart';

void main() {
  test('parses LLM flowchart JSON into graph entities', () {
    final graph = FlowchartGraphModel.fromJson(<String, Object?>{
      'nodes': <Map<String, Object?>>[
        <String, Object?>{
          'id': 'start',
          'title': 'Start',
          'content': 'Read input',
          'x': 0,
          'y': 0,
          'width': 240,
          'height': 120,
        },
        <String, Object?>{
          'id': 'branch',
          'title': 'Branch',
          'content': 'Check condition',
          'x': 280,
          'y': 0,
          'width': 240,
          'height': 120,
        },
      ],
      'edges': <Map<String, Object?>>[
        <String, Object?>{
          'id': 'start-branch',
          'sourceNodeId': 'start',
          'targetNodeId': 'branch',
          'label': 'next',
        },
      ],
    });

    expect(graph.nodes, hasLength(2));
    expect(graph.edges, hasLength(1));
    expect(graph.nodes.first.title, 'Start');
    expect(graph.edges.first.sourceNodeId, 'start');
  });

  test('drops edges that point to missing nodes', () {
    final graph = FlowchartGraphModel.fromJson(<String, Object?>{
      'nodes': <Map<String, Object?>>[
        <String, Object?>{'id': 'start', 'title': 'Start', 'x': 0, 'y': 0},
      ],
      'edges': <Map<String, Object?>>[
        <String, Object?>{'sourceNodeId': 'start', 'targetNodeId': 'missing'},
      ],
    });

    expect(graph.edges, isEmpty);
  });
}
