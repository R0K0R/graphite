// ignore_for_file: avoid_print

import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';

import 'package:flutter/foundation.dart';

const String _agentSessionId = 'b350c7';
const String _agentLogPath =
    '/home/r0k0r/graphite/.cursor/debug-b350c7.log';

/// Matches `hypothesisId` / session id in tooling; stable grep pattern for logcat.

const String agentLogPrintPrefix = '__GRAPHITE_DEBUG_SESSION__$_agentSessionId';

/// One word name for filters that choke on underscores (optional).
const String agentLogShortName = 'GRPHDbg_b350c7';

/// Fires even when full JSON logging is suppressed; survives most release builds.

void debugSessionMarker(String label) {
  // #region agent log
  if (kIsWeb) return;
  final String line =
      '${agentLogPrintPrefix}|MARKER|$label|${agentLogShortName}|';
  print(line);
  developer.log(label, name: agentLogShortName);
  try {
    File(_agentLogPath).writeAsStringSync(
      '${jsonEncode(<String, Object?>{
            'sessionId': _agentSessionId,
            'hypothesisId': 'MARKER',
            'location': 'debug_session_log.dart:marker',
            'message': label,
            'data': const <String, Object?>{},
            'timestamp': DateTime.now().millisecondsSinceEpoch,
            'runId': 'pre-fix',
          })}\n',
      mode: FileMode.append,
    );
  } catch (_) {}
  // #endregion
}

/// Debug NDJSON for session `b350c7`:
/// - Writes to workspace log file when reachable (Flutter on host).
/// - `print` + `developer.log` so Waydroid/`adb logcat` can grep `GRAPHITE_DEBUG…` / `GRPHDbg_b350c7`.

void debugSessionLog(
  String hypothesisId,
  String location,
  String message,
  Map<String, Object?> data, {
  String runId = 'pre-fix',
}) {
  // #region agent log
  if (kIsWeb) return;
  debugSessionMarker('$hypothesisId:$message');

  final String line = jsonEncode(<String, Object?>{
    'sessionId': _agentSessionId,
    'hypothesisId': hypothesisId,
    'location': location,
    'message': message,
    'data': data,
    'timestamp': DateTime.now().millisecondsSinceEpoch,
    'runId': runId,
  });

  developer.log('$line', name: agentLogShortName);
  debugPrint('$agentLogPrintPrefix NDJSON|$line');

  try {
    File(_agentLogPath).writeAsStringSync(
      '${line}\n',
      mode: FileMode.append,
    );
  } catch (_) {}
  // #endregion
}
