import 'dart:collection';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:yaml/yaml.dart';

@immutable
class LspLaunchSpec {
  const LspLaunchSpec({
    required this.id,
    required this.executable,
    required this.args,
    this.environment = const <String, String>{},
    this.initializationOptions,
  });

  final String id;
  final String executable;
  final List<String> args;
  final Map<String, String> environment;
  final Map<String, Object?>? initializationOptions;
}

final class LspMergedRegistry {
  LspMergedRegistry._(this._byLanguageId, this._byServerId);

  final Map<String, LspLaunchSpec> _byLanguageId;
  final Map<String, LspLaunchSpec> _byServerId;

  factory LspMergedRegistry.defaultsOnly() =>
      LspMergedRegistry._(_defaultLanguages(), _defaultsByServerId());

  factory LspMergedRegistry.merged(File? userConfigFile) {
    final LinkedHashMap<String, LspLaunchSpec> defaultsLan = _defaultLanguages();
    final Map<String, LspLaunchSpec> defaultsSrv = _defaultsByServerId();
    if (userConfigFile == null || !userConfigFile.existsSync()) {
      return LspMergedRegistry._(defaultsLan, defaultsSrv);
    }

    Object? decoded;
    try {
      decoded = loadYaml(userConfigFile.readAsStringSync());
    } on FormatException catch (e, st) {
      debugPrint('[lsp.yaml] parse error $e\n$st');
      return LspMergedRegistry._(defaultsLan, defaultsSrv);
    }

    final YamlMap? root = decoded as YamlMap?;
    if (root == null || !root.containsKey('servers')) {
      return LspMergedRegistry._(defaultsLan, defaultsSrv);
    }

    final YamlMap? servers = root['servers'] as YamlMap?;
    if (servers == null) {
      return LspMergedRegistry._(defaultsLan, defaultsSrv);
    }

    final LinkedHashMap<String, LspLaunchSpec> byLang =
        LinkedHashMap<String, LspLaunchSpec>.from(defaultsLan);
    final LinkedHashMap<String, LspLaunchSpec> byId =
        LinkedHashMap<String, LspLaunchSpec>.from(defaultsSrv);

    for (final MapEntry<Object?, Object?> entry in servers.entries) {
      final String idHint = '${entry.key}';
      final Object? v = entry.value;
      if (v is! YamlMap) {
        continue;
      }
      final LspLaunchSpec? spec = _parseServerSpec(idHint, v);
      if (spec != null) {
        byId[spec.id] = spec;
        for (final String lang in _languagesFromYaml(v['languages'], idHint)) {
          byLang[lang.toLowerCase()] = spec;
        }
      }
    }
    return LspMergedRegistry._(byLang, byId);
  }

  /// Load `.graphite/lsp.yaml`, merged onto built-in Dart + TS/JS specs.
  static Future<LspMergedRegistry> loadProject(String projectRoot) async {
    final String path = p.join(projectRoot, '.graphite', 'lsp.yaml');
    return LspMergedRegistry.merged(File(path));
  }

  LspLaunchSpec? lookupLanguage(String monacoLanguageId) {
    final String key = monacoLanguageId.toLowerCase();
    return _byLanguageId[key];
  }

  LspLaunchSpec? lookupServer(String serverId) =>
      _byServerId[serverId];
}

LspLaunchSpec? _parseServerSpec(String idHint, YamlMap map) {
  final explicitId = map['id']?.toString();
  final String id =
      explicitId != null && explicitId.isNotEmpty ? explicitId : idHint;

  final Object? exec = map['executable'] ?? map['command'];
  if (exec == null) {
    return null;
  }

  List<String>? args;
  final Object? rawArgs = map['args'];
  if (rawArgs is YamlList) {
    args = rawArgs
        .map((dynamic element) => element.toString())
        .toList(growable: false);
  } else if (rawArgs != null && rawArgs is! YamlList) {
    args = <String>[rawArgs.toString()];
  } else {
    args = const <String>[];
  }

  Map<String, String> env = <String, String>{};
  final Object? rawEnv = map['environment'] ?? map['env'];
  if (rawEnv is YamlMap) {
    env = <String, String>{
      for (final dynamic e in rawEnv.entries)
        '${e.key}': '${e.value}',
    };
  }

  Map<String, Object?>? init;
  final Object? rawOpts = map['initialization_options'];
  if (rawOpts != null && rawOpts is YamlMap) {
    final Object? asJson = _yamlPlain(rawOpts);
    if (asJson is Map<Object?, Object?>) {
      init = asJson.map<String, Object?>(
        (Object? key, Object? val) =>
            MapEntry<String, Object?>('$key', val),
      );
    }
  }

  return LspLaunchSpec(
    id: id,
    executable: exec.toString(),
    args: args,
    environment: env,
    initializationOptions: init,
  );
}

List<String> _languagesFromYaml(Object? raw, String idHint) {
  if (raw is YamlList && raw.isNotEmpty) {
    return raw.map((dynamic e) => e.toString().toLowerCase()).toList(
          growable: false,
        );
  }
  return <String>[idHint.toLowerCase()];
}

LinkedHashMap<String, LspLaunchSpec> _defaultLanguages() =>
    LinkedHashMap<String, LspLaunchSpec>.from(<String, LspLaunchSpec>{
      'dart': _dartServer,
      'typescript': _typescriptServer,
      'javascript': _typescriptServer,
    });

Map<String, LspLaunchSpec> _defaultsByServerId() => <String, LspLaunchSpec>{
      _dartServer.id: _dartServer,
      _typescriptServer.id: _typescriptServer,
    };

const LspLaunchSpec _dartServer = LspLaunchSpec(
  id: 'dart',
  executable: 'dart',
  args: <String>['language-server', '--protocol=lsp'],
);

const LspLaunchSpec _typescriptServer = LspLaunchSpec(
  id: 'typescript',
  executable: 'typescript-language-server',
  args: <String>['--stdio'],
);

Object? _yamlPlain(Object? v) {
  if (v == null) {
    return null;
  }
  if (v is YamlScalar) {
    return v.value;
  }
  if (v is YamlMap) {
    return <String, Object?>{
      for (final MapEntry<Object?, Object?> e in v.entries)
        '${e.key}': _yamlPlain(e.value),
    };
  }
  if (v is YamlList) {
    return v.map(_yamlPlain).toList(growable: false);
  }
  return v;
}
