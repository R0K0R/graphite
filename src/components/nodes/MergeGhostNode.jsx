// Ghost node shown during a merge — conflicts (purple) and their-added nodes (teal).
export default function MergeGhostNode({ data }) {
  const { mergeType, label, nodeType, onAcceptMergeNode, nodeId } = data;

  const isConflict = mergeType === 'conflict';
  const color = isConflict ? 'var(--purple, #a78bfa)' : 'var(--teal, #2dd4bf)';

  return (
    <div className="merge-ghost-node nodrag" style={{ borderColor: color }}>
      <div className="merge-ghost-label" style={{ color }}>{label || '(unnamed)'}</div>
      <div className="merge-ghost-type">{nodeType || 'node'}</div>
      {isConflict ? (
        <div className="merge-ghost-actions">
          <div className="merge-ghost-badge" style={{ background: color + '22', borderColor: color }}>
            conflict
          </div>
          <button
            className="merge-ghost-btn merge-ghost-btn--accept"
            onClick={() => onAcceptMergeNode?.(nodeId, 'theirs')}
          >
            ↓ theirs
          </button>
          <button
            className="merge-ghost-btn"
            onClick={() => onAcceptMergeNode?.(nodeId, 'ours')}
          >
            keep ours
          </button>
        </div>
      ) : (
        <div className="merge-ghost-actions">
          <div className="merge-ghost-badge" style={{ background: color + '22', borderColor: color }}>
            they added
          </div>
          <button
            className="merge-ghost-btn merge-ghost-btn--accept"
            onClick={() => onAcceptMergeNode?.(nodeId, 'theirs')}
          >
            ↓ add
          </button>
          <button
            className="merge-ghost-btn"
            onClick={() => onAcceptMergeNode?.(nodeId, 'dismiss')}
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}
