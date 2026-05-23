import { useCallback } from 'react';
import { usePrefs } from '../ThemeContext.js';
import { PALETTES } from '../utils/colors.js';

export default function RegionNode({ id, data, selected }) {
  const { label, collapsed = false, dirPath = null, colorIndex = 0, onToggleCollapse, onLinkDir } = data;
  const { theme, regionAlpha } = usePrefs();

  const palette = PALETTES[theme] ?? PALETTES.dark;
  const color   = palette[colorIndex % palette.length];
  const alphaHex = Math.round(regionAlpha * 255).toString(16).padStart(2, '0');

  const handleHeaderClick = useCallback(() => {
    onToggleCollapse?.(id);
  }, [onToggleCollapse, id]);

  return (
    <div
      className={`region-node${collapsed ? ' region-collapsed' : ''}`}
      style={{ borderColor: color + 'a0', background: color + alphaHex }}
    >
      <div
        className="region-header"
        onClick={handleHeaderClick}
        style={{ cursor: 'pointer', borderBottomColor: color + '50' }}
      >
        <span className="region-title" style={{ color }}>{label}</span>
        <span style={{ color, fontSize: 10, opacity: 0.7 }}>{collapsed ? '▶' : '▼'}</span>
        {selected && !collapsed && (
          <button
            className="region-link-btn nodrag"
            title={dirPath ? `Linked: ${dirPath}` : 'Link to folder'}
            onClick={e => { e.stopPropagation(); onLinkDir?.(id); }}
            style={{ borderColor: color + '80', color }}
          >
            {dirPath ? 'linked' : 'link'}
          </button>
        )}
      </div>
      {dirPath && !collapsed && (
        <div className="region-dir-path">{dirPath}</div>
      )}
    </div>
  );
}
