// Ghost node for removed or moved-from positions in diff mode.
// Renders the node's outline without any live content — pointer-events off.
export default function DiffGhostNode({ data }) {
  const COLORS = {
    removed:     'var(--red,  #f87171)',
    moved:       'var(--amber,#fbbf24)',
    'moved-from':'var(--amber,#fbbf24)',
  };
  const color = COLORS[data.diffType] ?? 'var(--muted, #94a3b8)';

  return (
    <div className="diff-ghost-node" style={{ borderColor: color }}>
      <div className="diff-ghost-label" style={{ color }}>{data.label || '(unnamed)'}</div>
      <div className="diff-ghost-type-badge">{data.nodeType || 'node'}</div>
      {data.diffType === 'removed' && (
        <div className="diff-ghost-badge diff-ghost-badge--removed">removed</div>
      )}
      {(data.diffType === 'moved' || data.diffType === 'moved-from') && (
        <div className="diff-ghost-badge diff-ghost-badge--moved">moved from</div>
      )}
    </div>
  );
}
