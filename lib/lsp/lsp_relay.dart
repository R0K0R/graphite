import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

const List<int> _crlfcrlf = <int>[13, 10, 13, 10];

int _indexSeparator(List<int> bytes) {
  for (var i = 0; i + _crlfcrlf.length <= bytes.length; i++) {
    var hit = true;
    for (var j = 0; j < _crlfcrlf.length; j++) {
      if (bytes[i + j] != _crlfcrlf[j]) {
        hit = false;
        break;
      }
    }
    if (hit) {
      return i;
    }
  }
  return -1;
}

int? _parseContentLength(String asciiHeader) {
  for (final line in asciiHeader.split('\r\n')) {
    final trimmed = line.trimLeft();
    if (trimmed.toLowerCase().startsWith('content-length:')) {
      final rest = trimmed.substring('content-length:'.length).trim();
      final n = int.tryParse(rest);
      if (n != null && n > 0) {
        return n;
      }
    }
  }
  return null;
}

/// Decode RFC-style LSP messages with `Content-Length` headers.
final class LspMessageDecoder {
  final List<int> _buf = <int>[];

  void add(List<int> chunk) => _buf.addAll(chunk);

  /// Yields JSON bodies decoded as UTF‑8 strings.
  List<String> consume() {
    final out = <String>[];
    while (true) {
      final delim = _indexSeparator(_buf);
      if (delim < 0) {
        return out;
      }
      final asciiHeader = String.fromCharCodes(_buf.sublist(0, delim));
      final len = _parseContentLength(asciiHeader);
      if (len == null) {
        throw const FormatException('invalid Content-Length header');
      }
      final bodyStart = delim + _crlfcrlf.length;
      final end = bodyStart + len;
      if (_buf.length < end) {
        return out;
      }
      out.add(utf8.decode(_buf.sublist(bodyStart, end)));
      _buf.removeRange(0, end);
    }
  }
}

/// Bridge one WebSocket (JSON-RPC text frames ↔ LSP stdin/stdout framing).
Future<void> runLspWebSocketRelay({
  required WebSocket socket,
  required Process process,
}) async {
  final decoder = LspMessageDecoder();
  var toreDown = false;

  late StreamSubscription<List<int>> subOut;
  late StreamSubscription<dynamic> subIn;
  late StreamSubscription<String> stderrCapture;

  Future<void> tearDown() async {
    if (toreDown) {
      return;
    }
    toreDown = true;
    await stderrCapture.cancel().catchError((_) {});
    await subOut.cancel().catchError((_) {});
    await subIn.cancel().catchError((_) {});
    try {
      socket.close();
    } on Object {
      /* ignore */
    }
    try {
      process.kill(ProcessSignal.sigterm);
      await Future<void>.delayed(const Duration(milliseconds: 80));
      process.kill(ProcessSignal.sigkill);
    } on Object {
      /* ignore */
    }
    try {
      await process.stdin.close().catchError((_) {});
    } on Object {
      /* ignore */
    }
  }

  stderrCapture = utf8.decoder.bind(process.stderr).listen(
      (String line) => debugPrint('[graphite:lspstderr] ${line.trimRight()}'));

  subOut = process.stdout.listen(
    (List<int> chunk) {
      decoder.add(chunk);
      try {
        for (final String msg in decoder.consume()) {
          socket.add(msg);
        }
      } on FormatException catch (e, st) {
        debugPrint('[graphite:lsp] corrupt LSP framing $e\n$st');
      }
    },
    onDone: tearDown,
    onError: (Object _, StackTrace _) => tearDown(),
    cancelOnError: false,
  );

  subIn = socket.listen(
    (dynamic frame) {
      if (frame is String) {
        final List<int> body = utf8.encode(frame);
        process.stdin.add(
          ascii.encode('Content-Length: ${body.length}\r\n\r\n'),
        );
        process.stdin.add(body);
      }
    },
    onDone: tearDown,
    onError: (Object _) => tearDown(),
    cancelOnError: false,
  );

  try {
    await Future.any(<Future<Object?>>[
      process.exitCode,
      socket.done,
    ]);
  } finally {
    await tearDown();
  }
}

