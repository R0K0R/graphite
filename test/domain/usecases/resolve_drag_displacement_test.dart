import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:graphite/domain/entities/canvas_node.dart';
import 'package:graphite/domain/usecases/resolve_drag_displacement.dart';

void main() {
  test('knocks nearby bystander away during approach', () {
    const active = CanvasNode(
      id: 'active.dart',
      title: 'active.dart',
      position: Offset(0, 0),
      size: Size(100, 100),
    );
    const bystander = CanvasNode(
      id: 'a.dart',
      title: 'a.dart',
      position: Offset(140, 0),
      size: Size(100, 100),
    );

    final resolved = DragDisplacementResolver.resolveTransient(
      baselineNodes: const <CanvasNode>[active, bystander],
      activeNodeId: active.id,
      activeDelta: const Offset(80, 0),
    );

    final movedBystander = resolved.singleWhere(
      (node) => node.id == bystander.id,
    );
    expect(movedBystander.position.dx, greaterThan(bystander.position.dx));
  });

  test('returns bystander after active node passes its baseline position', () {
    const active = CanvasNode(
      id: 'active.dart',
      title: 'active.dart',
      position: Offset(0, 0),
      size: Size(100, 100),
    );
    const bystander = CanvasNode(
      id: 'a.dart',
      title: 'a.dart',
      position: Offset(140, 0),
      size: Size(100, 100),
    );

    final resolved = DragDisplacementResolver.resolveTransient(
      baselineNodes: const <CanvasNode>[active, bystander],
      activeNodeId: active.id,
      activeDelta: const Offset(260, 0),
    );

    final movedBystander = resolved.singleWhere(
      (node) => node.id == bystander.id,
    );
    expect(movedBystander.position, bystander.position);
  });

  test('settles final overlap by permanently displacing bystander', () {
    const active = CanvasNode(
      id: 'active.dart',
      title: 'active.dart',
      position: Offset(0, 0),
      size: Size(100, 100),
    );
    const bystander = CanvasNode(
      id: 'a.dart',
      title: 'a.dart',
      position: Offset(80, 0),
      size: Size(100, 100),
    );

    final resolved = DragDisplacementResolver.settleFinal(
      baselineNodes: const <CanvasNode>[active, bystander],
      activeNodeId: active.id,
      activeDelta: const Offset(40, 0),
    );

    final movedBystander = resolved.singleWhere(
      (node) => node.id == bystander.id,
    );
    expect(movedBystander.position.dx, greaterThan(bystander.position.dx));
  });
}
