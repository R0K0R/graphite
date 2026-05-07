import '../entities/flowchart_graph.dart';

abstract interface class LlmFlowchartRepository {
  Future<FlowchartGraph> generateFlowchartFromCode({
    required String code,
    required String language,
  });
}
