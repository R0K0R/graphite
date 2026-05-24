export const PALETTES = {
  'dark':        ['#a78bfa', '#60a5fa', '#34d399', '#f472b6', '#fb923c', '#facc15', '#2dd4bf', '#f87171'],
  'light':       ['#7c3aed', '#1d4ed8', '#047857', '#be185d', '#c2410c', '#a16207', '#0f766e', '#dc2626'],
  'gruvbox':     ['#b16286', '#d79921', '#98971a', '#458588', '#cc241d', '#d65d0e', '#689d6a', '#83a598'],
  'tokyo-night': ['#bb9af7', '#7aa2f7', '#9ece6a', '#f7768e', '#ff9e64', '#e0af68', '#73daca', '#2ac3de'],
};

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Returns Map<dirPath, paletteIndex>.
// Siblings and parent/child pairs avoid sharing the same index.
// Assignment is deterministic (hash of path).
export function assignColorIndices(root, paletteSize = 8) {
  const colorMap = new Map();

  function walk(entry, parentIdx, siblingUsed) {
    if (entry.type !== 'directory') return;

    const forbidden = new Set(siblingUsed);
    if (parentIdx !== null) forbidden.add(parentIdx);

    const available = [];
    for (let i = 0; i < paletteSize; i++) if (!forbidden.has(i)) available.push(i);
    const pool = available.length > 0 ? available : Array.from({ length: paletteSize }, (_, i) => i);
    const chosen = pool[hashString(entry.path) % pool.length];

    colorMap.set(entry.path, chosen);
    siblingUsed.add(chosen);

    const childSiblingUsed = new Set();
    for (const child of entry.children ?? []) walk(child, chosen, childSiblingUsed);
  }

  const rootSiblingUsed = new Set();
  for (const child of root.children ?? []) walk(child, null, rootSiblingUsed);

  return colorMap;
}
export const PALETTES = {
  'dark':        ['#a78bfa', '#60a5fa', '#34d399', '#f472b6', '#fb923c', '#facc15', '#2dd4bf', '#f87171'],
  'light':       ['#7c3aed', '#1d4ed8', '#047857', '#be185d', '#c2410c', '#a16207', '#0f766e', '#dc2626'],
  'gruvbox':     ['#b16286', '#d79921', '#98971a', '#458588', '#cc241d', '#d65d0e', '#689d6a', '#83a598'],
  'tokyo-night': ['#bb9af7', '#7aa2f7', '#9ece6a', '#f7768e', '#ff9e64', '#e0af68', '#73daca', '#2ac3de'],
};

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Returns Map<dirPath, paletteIndex>.
// Siblings and parent/child pairs avoid sharing the same index.
// Assignment is deterministic (hash of path).
export function assignColorIndices(root, paletteSize = 8) {
  const colorMap = new Map();

  function walk(entry, parentIdx, siblingUsed) {
    if (entry.type !== 'directory') return;

    const forbidden = new Set(siblingUsed);
    if (parentIdx !== null) forbidden.add(parentIdx);

    const available = [];
    for (let i = 0; i < paletteSize; i++) if (!forbidden.has(i)) available.push(i);
    const pool = available.length > 0 ? available : Array.from({ length: paletteSize }, (_, i) => i);
    const chosen = pool[hashString(entry.path) % pool.length];

    colorMap.set(entry.path, chosen);
    siblingUsed.add(chosen);

    const childSiblingUsed = new Set();
    for (const child of entry.children ?? []) walk(child, chosen, childSiblingUsed);
  }

  const rootSiblingUsed = new Set();
  for (const child of root.children ?? []) walk(child, null, rootSiblingUsed);

  return colorMap;
}
