import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:graphite/presentation/app/graphite_app.dart';

void main() {
  testWidgets('Graphite canvas shell renders', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: GraphiteApp()),
    );

    expect(find.text('Graphite'), findsOneWidget);
    expect(
      find.text('Drag nodes, pan the canvas, scroll to zoom.'),
      findsOneWidget,
    );
  });
}
