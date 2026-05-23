import { T_PAD, T_HDR, T_FW, T_FH } from './canvasConstants.js';

export function computeAllRegionBounds(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const memo = new Map();

  function process(region) {
    if (memo.has(region.id)) return memo.get(region.id);

    if (region.data?.collapsed) {
      const saved = region.data?.savedBounds;
      if (saved) {
        const b = { position: saved.position, width: saved.width, height: T_HDR };
        memo.set(region.id, b);
        return b;
      }
    }

    const children = (region.data?.children ?? []).map(id => byId.get(id)).filter(Boolean);

    if (!children.length) {
      const b = {
        position: region.position,
        width:  Math.max(region.style?.width  ?? 220, 220),
        height: Math.max(region.style?.height ?? 100, 100),
      };
      memo.set(region.id, b);
      return b;
    }

    const rects = children.map(child => {
      if (child.type === 'region') {
        const b = process(child);
        return b ? { x: b.position.x, y: b.position.y, w: b.width, h: b.height } : null;
      }
      return { x: child.position.x, y: child.position.y, w: T_FW, h: T_FH };
    }).filter(Boolean);

    if (!rects.length) { memo.set(region.id, null); return null; }

    const minX = Math.min(...rects.map(r => r.x)) - T_PAD;
    const minY = Math.min(...rects.map(r => r.y)) - T_HDR - T_PAD;
    const maxX = Math.max(...rects.map(r => r.x + r.w)) + T_PAD;
    const maxY = Math.max(...rects.map(r => r.y + r.h)) + T_PAD;

    const b = {
      position: { x: minX, y: minY },
      width:  Math.max(maxX - minX, 220),
      height: Math.max(maxY - minY, 80),
    };
    memo.set(region.id, b);
    return b;
  }

  nodes.filter(n => n.type === 'region').forEach(process);
  return memo;
}
