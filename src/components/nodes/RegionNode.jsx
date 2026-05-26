import { useCallback } from 'react';
import { usePrefs } from '../../ThemeContext.js';
import { PALETTES } from '../../utils/colors.js';

export default function RegionNode({ id, data, selected }) {
  const { label, collapsed = false, dirPath = null, colorIndex = 0, isCtrlDragTarget = false, onToggleCollapse, onLinkDir } = data;
  const { theme, regionAlpha } = usePrefs();

  const palette = PALETTES[theme] ?? PALETTES.dark;
  const color   = palette[colorIndex % palette.length];
  const alphaHex = Math.round(regionAlpha * 255).toString(16).padStart(2, '0');

  const handleHeaderClick = useCallback(() => {
    onToggleCollapse?.(id);
  }, [onToggleCollapse, id]);

  return (
    <div
      className={`region-node${collapsed ? ' region-collapsed' : ''}${isCtrlDragTarget ? ' region-drop-target' : ''}`}
      style={{
        borderColor: isCtrlDragTarget ? '#60a5fa' : color + 'a0',
        background: isCtrlDragTarget ? 'rgba(96,165,250,0.12)' : color + alphaHex,
      }}
    >
      {isCtrlDragTarget && (
        <div className="region-drop-plus">+</div>
      )}
      {/* Label floats above the border — no vertical space consumed inside */}
      <div
        className="region-label nodrag"
        onClick={handleHeaderClick}
        style={{ color, borderColor: color + '60', background: `color-mix(in srgb, ${color} 12%, var(--bg))` }}
      >
        <span className="region-label-text">{label}</span>
        <span className="region-label-collapse">{collapsed ? '▶' : '▼'}</span>
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
    </div>
  );
}
