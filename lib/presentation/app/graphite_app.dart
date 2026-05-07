import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../canvas/canvas_widget.dart';

class GraphiteApp extends StatelessWidget {
  const GraphiteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ProviderScope(
      child: MaterialApp(
        title: 'Graphite',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff2563eb)),
          useMaterial3: true,
        ),
        home: const GraphiteHomePage(),
      ),
    );
  }
}

class GraphiteHomePage extends StatelessWidget {
  const GraphiteHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Stack(children: <Widget>[CanvasWidget(), _CanvasHud()]),
    );
  }
}

class _CanvasHud extends StatelessWidget {
  const _CanvasHud();

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 24,
      top: 24,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: const <BoxShadow>[
            BoxShadow(
              color: Color(0x1f000000),
              blurRadius: 16,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: const Padding(
          padding: EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                'Graphite',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              SizedBox(height: 4),
              Text('Drag nodes, pan the canvas, scroll to zoom.'),
            ],
          ),
        ),
      ),
    );
  }
}
