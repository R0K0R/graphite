import { computeNodeDiff } from './computeNodeDiff.js';

/**
 * 3-way merge of canvas node arrays.
 * When baseNodes is empty (non-Graphite ancestor), falls back to 2-way: all
 * "their" nodes not present in ours are treated as additions.
 *
 * Returns:
 *   conflicts   Map<id, { ours: Node, theirs: Node }>  — changed on both sides
 *   theirAdded  Node[]  — in theirs but not base/ours; default auto-add
 *   theirRemoved string[] — in base+ours, deleted by them; warn user
 *   ourOnly     Node[]  — changes only on our side (auto-accepted, no UI needed)
 */
export function computeMerge(baseNodes, ourNodes, theirNodes) {
  const twoWay = baseNodes.length === 0;

  const ourMap   = new Map(ourNodes.map(n => [n.id, n]));
  const theirMap = new Map(theirNodes.map(n => [n.id, n]));
  const baseMap  = new Map(baseNodes.map(n => [n.id, n]));

  const conflicts    = new Map();
  const theirAdded   = [];
  const theirRemoved = [];

  if (twoWay) {
    // 2-way: anything in theirs that we don't have → ghost addition
    for (const [id, theirNode] of theirMap) {
      if (!ourMap.has(id)) theirAdded.push(theirNode);
    }
    // Anything in ours not in theirs → they deleted (warn)
    for (const [id] of ourMap) {
      if (!theirMap.has(id)) theirRemoved.push(id);
    }
  } else {
    // 3-way
    const ourChanges   = computeNodeDiff(baseNodes, ourNodes);
    const theirChanges = computeNodeDiff(baseNodes, theirNodes);

    // Conflict: changed on both sides
    for (const [id, theirDiff] of theirChanges) {
      if (!ourChanges.has(id)) continue;
      const ourNode   = ourMap.get(id);
      const theirNode = theirMap.get(id);
      if (ourNode && theirNode) {
        conflicts.set(id, { ours: ourNode, theirs: theirNode });
      }
    }

    // Their additions
    for (const [id, d] of theirChanges) {
      if (d.type === 'added' && !ourMap.has(id)) {
        theirAdded.push(theirMap.get(id));
      }
    }

    // Their removals (in base + ours, not in theirs)
    for (const [id] of baseMap) {
      if (ourMap.has(id) && !theirMap.has(id)) theirRemoved.push(id);
    }
  }

  return { conflicts, theirAdded, theirRemoved, isTwoWay: twoWay };
}
