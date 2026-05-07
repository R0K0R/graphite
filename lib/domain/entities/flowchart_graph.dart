import 'canvas_node.dart';
import 'edge.dart';

class FlowchartGraph {
  const FlowchartGraph({required this.nodes, required this.edges});

  final List<CanvasNode> nodes;
  final List<Edge> edges;

  bool get isEmpty => nodes.isEmpty && edges.isEmpty;
}
