import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'graphite_lsp_runtime.dart';

final class GraphiteLspHostNotifier extends AsyncNotifier<GraphiteLspRuntime?> {
  @override
  Future<GraphiteLspRuntime?> build() async => null;
}

final AsyncNotifierProvider<GraphiteLspHostNotifier, GraphiteLspRuntime?>
    graphiteLspHostProvider = AsyncNotifierProvider<GraphiteLspHostNotifier,
        GraphiteLspRuntime?>(GraphiteLspHostNotifier.new);
