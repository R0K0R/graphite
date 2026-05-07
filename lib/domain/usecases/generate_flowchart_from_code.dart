import '../entities/flowchart_graph.dart';
import '../repositories/llm_flowchart_repository.dart';

class GenerateFlowchartFromCode {
  const GenerateFlowchartFromCode(this._repository);

  final LlmFlowchartRepository _repository;

  Future<FlowchartGraph> call({
    required String code,
    String language = 'dart',
  }) {
    return _repository.generateFlowchartFromCode(
      code: code,
      language: language,
    );
  }
}
