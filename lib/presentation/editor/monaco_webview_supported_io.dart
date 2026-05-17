import 'dart:io';

/// `webview_flutter` ships implementations only for Android, iOS, and macOS.
bool get isMonacoWebViewSupported =>
    Platform.isAndroid || Platform.isIOS || Platform.isMacOS;
