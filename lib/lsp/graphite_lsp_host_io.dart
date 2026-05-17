import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:graphite/presentation/project/project_controller.dart';

import 'graphite_lsp_runtime.dart';
import 'lsp_capabilities.dart';
import 'lsp_host_service.dart';

final class GraphiteLspHostNotifier extends AsyncNotifier<GraphiteLspRuntime?> {
  @override
  Future<GraphiteLspRuntime?> build() async {
    if (!graphiteMonacoEmbeddedSupported) {
      return null;
    }

    final String? root =
        ref.watch(projectControllerProvider.select((s) => s.project?.rootPath));
    if (root == null) {
      return null;
    }

    final GraphiteEmbeddedLspHost host =
        await GraphiteEmbeddedLspHost.bind(root);
    ref.onDispose(() {
      unawaited(host.shutdown());
    });

    return host.toRuntime();
  }
}

final AsyncNotifierProvider<GraphiteLspHostNotifier, GraphiteLspRuntime?>
    graphiteLspHostProvider =
    AsyncNotifierProvider<GraphiteLspHostNotifier, GraphiteLspRuntime?>(
  GraphiteLspHostNotifier.new,
);
