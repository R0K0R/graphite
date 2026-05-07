import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../core/errors/app_exception.dart';
import '../../domain/entities/flowchart_graph.dart';
import '../../domain/repositories/llm_flowchart_repository.dart';
import '../models/flowchart_graph_model.dart';

class LlmFlowchartRepositoryImpl implements LlmFlowchartRepository {
  LlmFlowchartRepositoryImpl({
    required this.endpoint,
    required this.model,
    http.Client? client,
    this.apiKey,
  }) : _client = client ?? http.Client();

  factory LlmFlowchartRepositoryImpl.ollama({
    String model = 'gemma2',
    http.Client? client,
  }) {
    return LlmFlowchartRepositoryImpl(
      endpoint: Uri.parse('http://localhost:11434/v1/chat/completions'),
      model: model,
      client: client,
    );
  }

  final Uri endpoint;
  final String model;
  final String? apiKey;
  final http.Client _client;

  @override
  Future<FlowchartGraph> generateFlowchartFromCode({
    required String code,
    required String language,
  }) async {
    final response = await _client.post(
      endpoint,
      headers: <String, String>{
        'content-type': 'application/json',
        if (apiKey != null && apiKey!.isNotEmpty)
          'authorization': 'Bearer $apiKey',
      },
      body: jsonEncode(<String, Object?>{
        'model': model,
        'temperature': 0.1,
        'response_format': <String, String>{'type': 'json_object'},
        'messages': <Map<String, String>>[
          <String, String>{'role': 'system', 'content': _systemPrompt},
          <String, String>{
            'role': 'user',
            'content': 'Language: $language\n\n```$language\n$code\n```',
          },
        ],
      }),
    );

    if (response.statusCode >= 400) {
      throw AppException(
        'LLM request failed with status ${response.statusCode}.',
        cause: response.body,
      );
    }

    final payload = jsonDecode(response.body);
    if (payload is! Map<String, Object?>) {
      throw const AppException('LLM response was not a JSON object.');
    }

    final content = _extractMessageContent(payload);
    final graphJson = _extractJsonObject(content);
    return FlowchartGraphModel.fromJson(graphJson);
  }

  String _extractMessageContent(Map<String, Object?> payload) {
    final choices = payload['choices'];
    if (choices is List && choices.isNotEmpty) {
      final first = choices.first;
      if (first is Map) {
        final message = first['message'];
        if (message is Map && message['content'] is String) {
          return message['content'] as String;
        }
        if (first['text'] is String) {
          return first['text'] as String;
        }
      }
    }

    if (payload['message'] is Map) {
      final message = payload['message'] as Map;
      if (message['content'] is String) {
        return message['content'] as String;
      }
    }

    throw const AppException('LLM response did not include message content.');
  }

  Map<String, Object?> _extractJsonObject(String content) {
    final trimmed = content.trim();
    final fenced = RegExp(
      r'```(?:json)?\s*([\s\S]*?)\s*```',
      caseSensitive: false,
    ).firstMatch(trimmed);
    final jsonText =
        fenced?.group(1) ??
        RegExp(r'\{[\s\S]*\}').firstMatch(trimmed)?.group(0) ??
        trimmed;
    final decoded = jsonDecode(jsonText);

    if (decoded is! Map<String, Object?>) {
      throw const AppException('Flowchart JSON must be an object.');
    }
    return decoded;
  }

  static const _systemPrompt = '''
You convert code into spatial flowchart JSON for a Flutter infinite canvas.
Return only a JSON object with this shape:
{
  "nodes": [
    {
      "id": "stable-short-id",
      "title": "Step title",
      "content": "Short explanation",
      "type": "flowchart",
      "x": 0,
      "y": 0,
      "width": 240,
      "height": 120
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "sourceNodeId": "source-id",
      "targetNodeId": "target-id",
      "label": "condition or action",
      "directed": true
    }
  ]
}
Place nodes left-to-right or top-to-bottom with non-overlapping coordinates.
''';
}
