import 'package:flutter/material.dart';

import '../../domain/usecases/rectangle_layout_config.dart';

class GraphiteSettings {
  const GraphiteSettings({
    required this.themeMode,
    required this.layout,
    required this.enableRepelBounce,
  });

  final ThemeMode themeMode;
  final RectangleLayoutConfig layout;
  final bool enableRepelBounce;

  static const GraphiteSettings initial = GraphiteSettings(
    themeMode: ThemeMode.system,
    layout: RectangleLayoutConfig.defaults,
    enableRepelBounce: true,
  );

  GraphiteSettings copyWith({
    ThemeMode? themeMode,
    RectangleLayoutConfig? layout,
    bool? enableRepelBounce,
  }) {
    return GraphiteSettings(
      themeMode: themeMode ?? this.themeMode,
      layout: layout ?? this.layout,
      enableRepelBounce: enableRepelBounce ?? this.enableRepelBounce,
    );
  }
}
