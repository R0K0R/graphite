// Pure function: computes diff between two snapshots of node arrays.
// Returns a Map<nodeId, DiffEntry> where DiffEntry is:
//   { type: 'added'|'removed'|'modified'|'moved', node, prevPosition? }

const POS_THRESHOLD = 8; // pixels — smaller than this is not considered "moved"

function posEqual(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) <= POS_THRESHOLD && Math.abs(a.y - b.y) <= POS_THRESHOLD;
}

function dataEqual(a, b) {
  // Compare stable fields; ignore callbacks and ephemeral UI state
  const SKIP = new Set(['peerColors', 'blameInfo', 'diffState', 'mergeConflict',
    'onContentChange', 'onFilePicked', 'onEditorFocus', 'onEditorBlur',
    'onChangeParam', 'onToggleCollapse', 'onLinkDir', 'expanded', 'rootPath']);
  const keysA = Object.keys(a ?? {}).filter(k => !SKIP.has(k));
  const keysB = Object.keys(b ?? {}).filter(k => !SKIP.has(k));
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  }
  return true;
}

export function computeNodeDiff(baseNodes, currentNodes) {
  const baseMap    = new Map(baseNodes.map(n => [n.id, n]));
  const currentMap = new Map(currentNodes.map(n => [n.id, n]));
  const result     = new Map();

  // Removed or modified/moved
  for (const [id, base] of baseMap) {
    const cur = currentMap.get(id);
    if (!cur) {
      result.set(id, { type: 'removed', node: base });
      continue;
    }
    const moved    = !posEqual(base.position, cur.position);
    const modified = !dataEqual(base.data, cur.data);
    if (moved && modified) {
      result.set(id, { type: 'moved', node: base, prevPosition: base.position });
    } else if (moved) {
      result.set(id, { type: 'moved', node: base, prevPosition: base.position });
    } else if (modified) {
      result.set(id, { type: 'modified', node: base });
    }
    // else: unchanged — no entry
  }

  // Added
  for (const [id, cur] of currentMap) {
    if (!baseMap.has(id)) {
      result.set(id, { type: 'added', node: cur });
    }
  }

  return result;
}
