import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;

import '../debug/debug_session_log.dart';
import 'graphite_lsp_runtime.dart';
import 'lsp_config.dart';
import 'lsp_process.dart';
import 'lsp_relay.dart';

const String _kMonacoAssetPrefix = 'assets/monaco_lsp/';

/// Cap debug log volume for missing static assets (H1_STATIC).
int _monacoAssetMissLogCount = 0;

Future<Map<String, String>> buildMonacoRouteTable([AssetBundle? bundle]) async {
  final AssetManifest mf =
      await AssetManifest.loadFromAssetBundle(bundle ?? rootBundle);
  final Map<String, String> normalized = <String, String>{};
  for (final String key in mf.listAssets()) {
    if (!key.startsWith(_kMonacoAssetPrefix)) {
      continue;
    }
    final String relative = key.substring(_kMonacoAssetPrefix.length);
    final String posixPath = relative.replaceAll(r'\', '/');
    normalized[posixPath.toLowerCase()] = key;
  }
  return normalized;
}

String _guessMime(String logicalPosixPath) => switch (
      p.extension(logicalPosixPath).toLowerCase()) {
      '.html' || '.htm' => 'text/html; charset=UTF-8',
      '.css' => 'text/css; charset=UTF-8',
      '.js' || '.mjs' || '.cjs' => 'application/javascript',
      '.json' => 'application/json',
      '.wasm' => 'application/wasm',
      '.woff' => 'font/woff',
      '.woff2' => 'font/woff2',
      '.ttf' => 'font/ttf',
      '.png' => 'image/png',
      '.svg' => 'image/svg+xml',
      '.ico' => 'image/x-icon',
      '.map' => 'application/json',
      _ => 'application/octet-stream',
    };

void _addCrossOriginIsolationHeaders(HttpResponse response) {
  response.headers.add('cross-origin-opener-policy', 'same-origin');
  response.headers.add(
    'cross-origin-embedder-policy',
    'credentialless',
  );
  response.headers.add('cross-origin-resource-policy', 'cross-origin');
}

Future<void> serveMonacoAsset({
  required HttpRequest request,
  required Map<String, String> routeTable,
}) async {
  final HttpResponse resp = request.response;

  try {
    if (request.method != 'GET' && request.method != 'HEAD') {
      _addCrossOriginIsolationHeaders(resp);
      resp.statusCode = HttpStatus.methodNotAllowed;
      await resp.close();
      return;
    }

    var logicalPath = request.uri.path;
    if (logicalPath.startsWith('/')) {
      logicalPath = logicalPath.substring(1);
    }
    if (logicalPath.isEmpty) {
      logicalPath = 'index.html';
    }
    if (logicalPath.contains('..') ||
        logicalPath.startsWith('/') ||
        p.normalize(logicalPath).startsWith('..')) {
      _addCrossOriginIsolationHeaders(resp);
      resp.statusCode = HttpStatus.forbidden;
      await resp.close();
      return;
    }

    final String? assetKey = routeTable[logicalPath.toLowerCase()];
    if (assetKey == null) {
      // #region agent log
      if (_monacoAssetMissLogCount < 24) {
        _monacoAssetMissLogCount++;
        debugSessionLog(
          'H1_STATIC',
          'lsp_host_service.dart:serveMonacoAsset',
          'asset_not_in_route_table',
          <String, Object?>{
            'logicalPath': logicalPath,
          },
        );
      }
      // #endregion
      _addCrossOriginIsolationHeaders(resp);
      resp.statusCode = HttpStatus.notFound;
      await resp.close();
      return;
    }

    final ByteData blob = await rootBundle.load(assetKey);
    final Uint8List bytes = blob.buffer.asUint8List(blob.offsetInBytes, blob.lengthInBytes);

    resp.statusCode = HttpStatus.ok;
    resp.headers.contentType = ContentType.parse(_guessMime(logicalPath));

    _addCrossOriginIsolationHeaders(resp);

    if (request.method == 'HEAD') {
      resp.headers.add('Content-Length', bytes.lengthInBytes.toString());
      await resp.close();
      return;
    }

    resp.headers.add('Content-Length', bytes.lengthInBytes.toString());
    resp.add(bytes);
    await resp.close();
  } catch (exception, stack) {
    debugPrint('[graphite:lsp-host] asset error $exception\n$stack');
    resp.statusCode = HttpStatus.internalServerError;
    await resp.close().catchError((_) {});
  }
}

/// Fire-and-forget WebSocket ⇄ Language Server bootstrap (one subprocess per WS).
Future<void> _attachLspWebSocket({
  required HttpRequest httpRequest,
  required String projectRoot,
  required LspLaunchSpec spec,
}) async {
  if (!WebSocketTransformer.isUpgradeRequest(httpRequest)) {
    _addCrossOriginIsolationHeaders(httpRequest.response);
    httpRequest.response.statusCode = HttpStatus.badRequest;
    await httpRequest.response.close();
    return;
  }

  Process? child;
  try {
    child = await startLanguageServer(
      projectRoot: projectRoot,
      spec: spec,
    );
  } on Object catch (error, trace) {
    debugPrint('[graphite:lsp-host] spawn ${spec.id}: $error\n$trace');
    _addCrossOriginIsolationHeaders(httpRequest.response);
    httpRequest.response.statusCode = HttpStatus.serviceUnavailable;
    await httpRequest.response.close();
    return;
  }

  final Process running = child;
  WebSocket socket;
  try {
    socket = await WebSocketTransformer.upgrade(httpRequest);
  } on Object catch (error, trace) {
    debugPrint('[graphite:lsp-host] websocket upgrade failed: $error\n$trace');
    running.kill(ProcessSignal.sigterm);
    return;
  }

  await runLspWebSocketRelay(socket: socket, process: running);
}

/// Local HttpServer exposing bundled Monaco (`assets/monaco_lsp/`) and `/lsp/<id>`.
final class GraphiteEmbeddedLspHost {
  GraphiteEmbeddedLspHost._({
    required this.editorEntryUri,
    required this.registry,
    required Future<void> Function() dispose,
  }) : _dispose = dispose;

  final Future<void> Function() _dispose;

  final Uri editorEntryUri;
  final LspMergedRegistry registry;

  GraphiteLspRuntime toRuntime() =>
      GraphiteLspRuntime(editorBaseUri: editorEntryUri, registry: registry);

  Future<void> shutdown() => _dispose();

  /// Binds localhost on a dynamic port and merges `.graphite/lsp.yaml`.
  static Future<GraphiteEmbeddedLspHost> bind(String projectRoot) async {
    final LspMergedRegistry registry =
        await LspMergedRegistry.loadProject(projectRoot);
    final Map<String, String> routeTable = await buildMonacoRouteTable();

    final HttpServer server =
        await HttpServer.bind(InternetAddress.loopbackIPv4, 0);

    late StreamSubscription<HttpRequest> subscription;

    Future<void> stop() async {
      await subscription.cancel();
      await server.close(force: true);
    }

    subscription = server.listen(
      (HttpRequest request) async {
        final List<String> segs = request.uri.pathSegments;
        final bool wsRoute = segs.length == 2 && segs.first == 'lsp';
        if (!wsRoute) {
          await serveMonacoAsset(
            request: request,
            routeTable: routeTable,
          );
          return;
        }

        final String serverId =
            Uri.decodeComponent(segs[1]);
        final LspLaunchSpec? spec = registry.lookupServer(serverId);

        if (spec == null) {
          _addCrossOriginIsolationHeaders(request.response);
          request.response.statusCode = HttpStatus.notFound;
          await request.response.close();
          return;
        }

        unawaited(
          _attachLspWebSocket(
            httpRequest: request,
            projectRoot: projectRoot,
            spec: spec,
          ).catchError(
            (Object error, StackTrace trace) =>
                debugPrint('[graphite:lsp-host] WS session error $error\n$trace'),
          ),
        );
      },
      cancelOnError: false,
      onError: (Object _, StackTrace _) {},
      onDone: () {},
    );

    final Uri editorUri = Uri(
      scheme: 'http',
      host: '127.0.0.1',
      port: server.port,
      path: '/index.html',
    );

    return GraphiteEmbeddedLspHost._(
      editorEntryUri: editorUri,
      registry: registry,
      dispose: stop,
    );
  }
}
