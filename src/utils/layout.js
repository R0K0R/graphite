// ---- Small-count presets (2–4 children) ----
//
// 2: side by side, vertically centered
// 3: [0][1] on bottom row (like 2), [2] above centered on midpoint
// 4: 2×2 grid, columns/rows sized to their widest/tallest item

function presetLayout(items, gap) {
  const n = items.length;

  if (n === 2) {
    const [a, b] = items;
    const maxH = Math.max(a.h, b.h);
    return [
      { id: a.id, x: 0,          y: Math.round((maxH - a.h) / 2) },
      { id: b.id, x: a.w + gap,  y: Math.round((maxH - b.h) / 2) },
    ];
  }

  if (n === 3) {
    const [a, b, c] = items;
    const rowW   = a.w + gap + b.w;
    const rowMaxH = Math.max(a.h, b.h);
    const bottomY = c.h + gap;
    const topX    = Math.max(0, Math.round(rowW / 2 - c.w / 2));
    return [
      { id: a.id, x: 0,          y: bottomY + Math.round((rowMaxH - a.h) / 2) },
      { id: b.id, x: a.w + gap,  y: bottomY + Math.round((rowMaxH - b.h) / 2) },
      { id: c.id, x: topX,       y: 0 },
    ];
  }

  if (n === 4) {
    const [a, b, c, d] = items;
    const col0W = Math.max(a.w, c.w);
    const row0H = Math.max(a.h, b.h);
    return [
      { id: a.id, x: 0,           y: 0 },
      { id: b.id, x: col0W + gap, y: 0 },
      { id: c.id, x: 0,           y: row0H + gap },
      { id: d.id, x: col0W + gap, y: row0H + gap },
    ];
  }

  return null;
}

// ---- Annular bin-pack (5+ children) ----
//
// Each rect is approximated as a bounding circle (r = hypot(w,h)/2).
// Items are sorted largest-first, then placed one by one by scanning
// candidate angles around every already-placed circle and picking the
// valid position closest to the origin.
//
// items: [{ id, w, h }]
// returns: [{ id, x, y }]  — top-left corners, shifted so min is (0,0)

function annularPack(items, gap) {
  const sorted = [...items]
    .map(item => ({ ...item, r: Math.hypot(item.w, item.h) / 2 }))
    .sort((a, b) => b.r - a.r);

  const placed = []; // { id, w, h, r, x, y }  —  x,y is center

  function overlaps(x, y, r) {
    return placed.some(p => Math.hypot(x - p.x, y - p.y) < r + p.r + gap);
  }

  for (const c of sorted) {
    if (!placed.length) {
      placed.push({ ...c, x: 0, y: 0 });
      continue;
    }

    let bestX = 0, bestY = 0, bestDist = Infinity;

    for (const p of placed) {
      const orbitR = p.r + c.r + gap;
      const steps = Math.max(24, Math.round((2 * Math.PI * orbitR) / (c.r * 0.4)));
      for (let k = 0; k < steps; k++) {
        const angle = (k / steps) * 2 * Math.PI;
        const px = p.x + orbitR * Math.cos(angle);
        const py = p.y + orbitR * Math.sin(angle);
        if (!overlaps(px, py, c.r)) {
          const d = px * px + py * py;
          if (d < bestDist) {
            bestDist = d;
            bestX = px;
            bestY = py;
          }
        }
      }
    }

    placed.push({ ...c, x: bestX, y: bestY });
  }

  const minX = Math.min(...placed.map(p => p.x - p.w / 2));
  const minY = Math.min(...placed.map(p => p.y - p.h / 2));

  return placed.map(p => ({
    id: p.id,
    x: Math.round(p.x - p.w / 2 - minX),
    y: Math.round(p.y - p.h / 2 - minY),
  }));
}

// ---- Public entry point ----

export function annularBinPack(items, opts = {}) {
  if (!items.length) return [];
  const { gap = 40 } = opts;
  return presetLayout(items, gap) ?? annularPack(items, gap);
}
