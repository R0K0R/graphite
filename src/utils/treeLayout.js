import { T_PAD, T_HDR, fileNodeSize } from './canvasConstants.js';
import { annularBinPack } from './layout.js';
import { assignColorIndices } from './colors.js';

function resolveSize(entry, sizeMap) {
  const id = `file:${entry.path}`;
  return sizeMap?.get(id) ?? fileNodeSize(entry.path);
}

function layoutSubtree(entry, colorIndices, sizeMap) {
  if (entry.type === 'file') {
    const { w, h } = resolveSize(entry, sizeMap);
    return {
      nodes: [{
        id: `file:${entry.path}`,
        type: 'file',
        position: { x: 0, y: 0 },
        data: { filePath: entry.path, content: '', externalChange: false },
      }],
      w,
      h,
    };
  }

  const children = entry.children ?? [];
  const colorIndex = colorIndices.get(entry.path) ?? 0;

  if (!children.length) {
    return {
      nodes: [{
        id: `dir:${entry.path}`,
        type: 'region',
        position: { x: 0, y: 0 },
        style: { width: 220, height: 100 },
        data: { label: entry.name, dirPath: entry.path, children: [], colorIndex },
        draggable: false,
      }],
      w: 220,
      h: 100,
    };
  }

  const childResults = children.map(child => {
    const id = child.type === 'file' ? `file:${child.path}` : `dir:${child.path}`;
    return { id, child, ...layoutSubtree(child, colorIndices, sizeMap) };
  });

  const packed = annularBinPack(childResults.map(cr => ({ id: cr.id, w: cr.w, h: cr.h })));
  const posMap = new Map(packed.map(p => [p.id, p]));

  const childIds = [];
  const allChildNodes = [];

  for (const cr of childResults) {
    childIds.push(cr.id);
    const pos = posMap.get(cr.id);
    const ox = T_PAD + pos.x;
    const oy = T_HDR + T_PAD + pos.y;
    allChildNodes.push(...cr.nodes.map(n => ({
      ...n,
      position: { x: n.position.x + ox, y: n.position.y + oy },
    })));
  }

  const maxX = Math.max(...childResults.map(cr => posMap.get(cr.id).x + cr.w));
  const maxY = Math.max(...childResults.map(cr => posMap.get(cr.id).y + cr.h));
  const w = Math.max(maxX + T_PAD * 2, 220);
  const h = Math.max(maxY + T_HDR + T_PAD * 2, 80);

  return {
    nodes: [
      {
        id: `dir:${entry.path}`,
        type: 'region',
        position: { x: 0, y: 0 },
        style: { width: w, height: h },
        data: { label: entry.name, dirPath: entry.path, children: childIds, colorIndex },
        draggable: false,
      },
      ...allChildNodes,
    ],
    w,
    h,
  };
}

// sizeMap: optional Map<nodeId, {w, h}> of measured dimensions.
// When provided, uses actual sizes instead of fileNodeSize estimates.
export function buildNodesFromTree(root, sizeMap = null) {
  const colorIndices = assignColorIndices(root);
  const children = root.children ?? [];
  if (!children.length) return [];

  const childResults = children.map(child => {
    const id = child.type === 'file' ? `file:${child.path}` : `dir:${child.path}`;
    return { id, ...layoutSubtree(child, colorIndices, sizeMap) };
  });

  const packed = annularBinPack(childResults.map(cr => ({ id: cr.id, w: cr.w, h: cr.h })));
  const posMap = new Map(packed.map(p => [p.id, p]));

  const allNodes = [];
  for (const cr of childResults) {
    const pos = posMap.get(cr.id);
    allNodes.push(...cr.nodes.map(n => ({
      ...n,
      position: { x: n.position.x + pos.x + 100, y: n.position.y + pos.y + 100 },
    })));
  }
  return allNodes;
}
