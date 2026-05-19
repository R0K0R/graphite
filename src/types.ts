export type NodeKind = "file" | "folder";

export interface CanvasNode {
  id: string;
  kind: NodeKind;
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed?: boolean;
  expanded?: boolean;
}

export interface GraphiteMetadata {
  version: number;
  nodes: CanvasNode[];
}

export interface FsEntry {
  path: string;
  kind: NodeKind;
}

export interface ProjectSnapshot {
  root: string;
  metadata: GraphiteMetadata;
}

export interface Camera {
  x: number;
  y: number;
  scale: number;
}
