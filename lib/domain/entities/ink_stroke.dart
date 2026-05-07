import 'dart:ui';

class InkPoint {
  const InkPoint({
    required this.position,
    required this.timestamp,
    this.pressure = 1,
    this.tiltX = 0,
    this.tiltY = 0,
  });

  final Offset position;
  final Duration timestamp;
  final double pressure;
  final double tiltX;
  final double tiltY;

  Map<String, Object?> toJson() {
    return <String, Object?>{
      'x': position.dx,
      'y': position.dy,
      't': timestamp.inMicroseconds,
      'pressure': pressure,
      'tiltX': tiltX,
      'tiltY': tiltY,
    };
  }
}

class InkStroke {
  const InkStroke({
    required this.id,
    required this.points,
    this.color = const Color(0xff1f2937),
    this.width = 2,
  });

  final String id;
  final List<InkPoint> points;
  final Color color;
  final double width;

  bool get isEmpty => points.isEmpty;

  String toSvgPathData() {
    if (points.isEmpty) {
      return '';
    }

    final buffer = StringBuffer()
      ..write('M ${points.first.position.dx} ${points.first.position.dy}');

    for (final point in points.skip(1)) {
      buffer.write(' L ${point.position.dx} ${point.position.dy}');
    }

    return buffer.toString();
  }

  Map<String, Object?> toJson() {
    return <String, Object?>{
      'id': id,
      'points': points.map((point) => point.toJson()).toList(),
      'color': color.toARGB32(),
      'width': width,
      'svgPath': toSvgPathData(),
    };
  }
}
