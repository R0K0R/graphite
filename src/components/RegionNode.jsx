import { useCallback } from 'react';

export default function RegionNode({ id, data, selected }) {
  const { label, collapsed = false, dirPath = null, onToggleCollapse, onLinkDir } = data;

  const handleHeaderClick = useCallback(() => {
    onToggleCollapse?.(id);
  }, [onToggleCollapse, id]);

  return (
    <div className={`region-node${collapsed ? ' region-collapsed' : ''}`}>
      <div className="region-header" onClick={handleHeaderClick} style={{ cursor: 'pointer' }}>
        <span className="region-title">{label}</span>
        <span style={{ color: 'var(--muted)', fontSize: 10 }}>{collapsed ? '▶' : '▼'}</span>
        {selected && !collapsed && (
          <button
            className="region-link-btn nodrag"
            title={dirPath ? `Linked: ${dirPath}` : 'Link to folder'}
            onClick={e => { e.stopPropagation(); onLinkDir?.(id); }}
          >
            {dirPath ? '📂' : '🔗'}
          </button>
        )}
      </div>
      {dirPath && !collapsed && (
        <div className="region-dir-path">{dirPath}</div>
      )}
    </div>
  );
}
