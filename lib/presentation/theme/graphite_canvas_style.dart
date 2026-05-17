import 'package:flutter/material.dart';

@immutable
class GraphiteCanvasStyle extends ThemeExtension<GraphiteCanvasStyle> {
  const GraphiteCanvasStyle({
    required this.gridMinor,
    required this.gridMajor,
    required this.edgeColor,
    required this.folderLabel,
    required this.folderShadow,
  });

  final Color gridMinor;
  final Color gridMajor;
  final Color edgeColor;
  final Color folderLabel;
  final Color folderShadow;

  /// Light canvas background is derived from scaffold; dark uses layered slate.
  static const GraphiteCanvasStyle light = GraphiteCanvasStyle(
    gridMinor: Color(0x1a475569),
    gridMajor: Color(0xffcbd5e1),
    edgeColor: Color(0xff64748b),
    folderLabel: Color(0xff334155),
    folderShadow: Color(0x40000000),
  );

  static const GraphiteCanvasStyle dark = GraphiteCanvasStyle(
    gridMinor: Color(0x2894a3b8),
    gridMajor: Color(0x33475169),
    edgeColor: Color(0xff94a3b8),
    folderLabel: Color(0xffe2e8f0),
    folderShadow: Color(0x66000000),
  );

  @override
  GraphiteCanvasStyle copyWith({
    Color? gridMinor,
    Color? gridMajor,
    Color? edgeColor,
    Color? folderLabel,
    Color? folderShadow,
  }) {
    return GraphiteCanvasStyle(
      gridMinor: gridMinor ?? this.gridMinor,
      gridMajor: gridMajor ?? this.gridMajor,
      edgeColor: edgeColor ?? this.edgeColor,
      folderLabel: folderLabel ?? this.folderLabel,
      folderShadow: folderShadow ?? this.folderShadow,
    );
  }

  @override
  GraphiteCanvasStyle lerp(ThemeExtension<GraphiteCanvasStyle>? other, double t) {
    if (other is! GraphiteCanvasStyle) {
      return this;
    }
    return GraphiteCanvasStyle(
      gridMinor: Color.lerp(gridMinor, other.gridMinor, t)!,
      gridMajor: Color.lerp(gridMajor, other.gridMajor, t)!,
      edgeColor: Color.lerp(edgeColor, other.edgeColor, t)!,
      folderLabel: Color.lerp(folderLabel, other.folderLabel, t)!,
      folderShadow: Color.lerp(folderShadow, other.folderShadow, t)!,
    );
  }
}
