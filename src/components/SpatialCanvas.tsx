import { useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Group, Layer, Rect, Stage, Text } from "react-konva";
import type { CanvasNode } from "../types";
import { basename, useGraphiteStore } from "../store/useGraphiteStore";
import { NodeEditorOverlay } from "./NodeEditorOverlay";

function nodeHidden(node: CanvasNode, nodes: CanvasNode[]): boolean {
  for (const folder of nodes) {
    if (folder.kind !== "folder") continue;
    if (!folder.collapsed) continue;
    if (folder.path === node.path) continue;
    const prefix = folder.path.endsWith("/")
      ? folder.path
      : `${folder.path}/`;
    if (node.path.startsWith(prefix)) return true;
  }
  return false;
}

export function SpatialCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const metadata = useGraphiteStore((s) => s.metadata);
  const camera = useGraphiteStore((s) => s.camera);
  const patchNode = useGraphiteStore((s) => s.patchNode);

  const panning = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const visibleNodes = useMemo(
    () => metadata.nodes.filter((n) => !nodeHidden(n, metadata.nodes)),
    [metadata.nodes],
  );

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.06;
    const direction = e.evt.deltaY > 0 ? -1 : 1;

    useGraphiteStore.setState((s) => {
      const oldScale = s.camera.scale;
      const newScale =
        direction > 0
          ? Math.min(3, oldScale * scaleBy)
          : Math.max(0.25, oldScale / scaleBy);

      const mousePointTo = {
        x: (pointer.x - s.camera.x) / oldScale,
        y: (pointer.y - s.camera.y) / oldScale,
      };

      return {
        camera: {
          scale: newScale,
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        },
      };
    });
  };

  const startPan = (ev: Konva.KonvaEventObject<MouseEvent>) => {
    if (ev.evt.button !== 1) return;
    panning.current = true;
    lastPointer.current = stageRef.current?.getPointerPosition() ?? null;
    ev.evt.preventDefault();
  };

  const movePan = () => {
    if (!panning.current || !lastPointer.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const next = stage.getPointerPosition();
    if (!next) return;
    const dx = next.x - lastPointer.current.x;
    const dy = next.y - lastPointer.current.y;
    lastPointer.current = next;
    useGraphiteStore.setState((s) => ({
      camera: { ...s.camera, x: s.camera.x + dx, y: s.camera.y + dy },
    }));
  };

  const endPan = () => {
    panning.current = false;
    lastPointer.current = null;
  };

  return (
    <div ref={containerRef} className="canvas-shell">
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        onWheel={handleWheel}
        onMouseDown={startPan}
        onMouseMove={movePan}
        onMouseUp={endPan}
        onMouseLeave={endPan}
      >
        <Layer>
          <Group x={camera.x} y={camera.y} scaleX={camera.scale} scaleY={camera.scale}>
            <Rect
              x={-50000}
              y={-50000}
              width={100000}
              height={100000}
              fill="#eef1f7"
              listening={false}
            />
            {visibleNodes.map((node) =>
              node.kind === "folder" ? (
                <Group
                  key={node.id}
                  x={node.x}
                  y={node.y}
                  draggable
                  onDragEnd={(ev) =>
                    patchNode(node.id, {
                      x: ev.target.x(),
                      y: ev.target.y(),
                    })
                  }
                >
                  <Rect
                    width={node.width}
                    height={node.height}
                    cornerRadius={8}
                    fill="#dbeafe"
                    stroke="#2563eb"
                    strokeWidth={1}
                  />
                  <Text
                    text={`📁 ${basename(node.path)}`}
                    width={node.width}
                    height={26}
                    padding={10}
                    fontSize={14}
                    fill="#1e3a8a"
                  />
                  <Text
                    text={node.collapsed ? "▸ expand" : "▾ collapse"}
                    x={node.width - 96}
                    y={10}
                    fontSize={12}
                    fill="#1e40af"
                    listening
                    onMouseDown={(e) => {
                      e.cancelBubble = true;
                      patchNode(node.id, { collapsed: !node.collapsed });
                    }}
                  />
                </Group>
              ) : (
                <Group
                  key={node.id}
                  x={node.x}
                  y={node.y}
                  draggable
                  onDragEnd={(ev) =>
                    patchNode(node.id, {
                      x: ev.target.x(),
                      y: ev.target.y(),
                    })
                  }
                  onMouseDown={(e) => {
                    e.cancelBubble = true;
                  }}
                  onDblClick={() =>
                    patchNode(node.id, { expanded: !node.expanded })
                  }
                >
                  {!node.expanded && (
                    <>
                      <Rect
                        width={node.width}
                        height={node.height}
                        cornerRadius={8}
                        fill="#ffffff"
                        stroke="#cbd5f5"
                        strokeWidth={1}
                      />
                      <Text
                        text={`📄 ${basename(node.path)}`}
                        width={node.width}
                        height={node.height}
                        padding={12}
                        fontSize={14}
                        fill="#111827"
                      />
                      <Text
                        text="double-click to edit"
                        y={node.height - 26}
                        x={12}
                        fontSize={11}
                        fill="#6b7280"
                      />
                    </>
                  )}
                  {node.expanded && <NodeEditorOverlay node={node} />}
                </Group>
              ),
            )}
          </Group>
        </Layer>
      </Stage>
      <div className="canvas-hint">
        Middle-mouse drag to pan · wheel to zoom · double-click files to toggle Monaco
      </div>
    </div>
  );
}
