import 'dart:io';

bool get graphiteMonacoEmbeddedSupported =>
    Platform.isAndroid || Platform.isIOS || Platform.isMacOS;
