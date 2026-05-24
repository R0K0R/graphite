import { fileNodeSize } from './canvasConstants.js';

const REGION_PAD = 16; // padding around children; label floats above so no T_HDR needed
const COLLAPSED_H = 28;

function childSize(child) {
  // Prefer ReactFlow-measured dimensions; fall back to per-type estimate
  if (child.width > 0 && child.height > 0) return { w: child.width, h: child.height };
  return fileNodeSize(child.data?.filePath);
}

export function computeAllRegionBounds(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const memo = new Map();

  function process(region) {
    if (memo.has(region.id)) return memo.get(region.id);

    if (region.data?.collapsed) {
      const saved = region.data?.savedBounds;
      if (saved) {
        const b = { position: saved.position, width: saved.width, height: COLLAPSED_H };
        memo.set(region.id, b);
        return b;
      }
    }

    const children = (region.data?.children ?? []).map(id => byId.get(id)).filter(Boolean);

    if (!children.length) {
      const b = {
        position: region.position,
        width:  Math.max(region.style?.width  ?? 220, 220),
        height: Math.max(region.style?.height ?? 80,  80),
      };
      memo.set(region.id, b);
      return b;
    }

    const rects = children.map(child => {
      if (child.type === 'region') {
        const b = process(child);
        return b ? { x: b.position.x, y: b.position.y, w: b.width, h: b.height } : null;
      }
      const { w, h } = childSize(child);
      return { x: child.position.x, y: child.position.y, w, h };
    }).filter(Boolean);

    if (!rects.length) { memo.set(region.id, null); return null; }

    const minX = Math.min(...rects.map(r => r.x))       - REGION_PAD;
    const minY = Math.min(...rects.map(r => r.y))       - REGION_PAD - 20; // 20px for floating label
    const maxX = Math.max(...rects.map(r => r.x + r.w)) + REGION_PAD;
    const maxY = Math.max(...rects.map(r => r.y + r.h)) + REGION_PAD;

    const b = {
      position: { x: minX, y: minY },
      width:  Math.max(maxX - minX, 120),
      height: Math.max(maxY - minY, 60),
    };
    memo.set(region.id, b);
    return b;
  }

  nodes.filter(n => n.type === 'region').forEach(process);
  return memo;
}
