import { Panel } from 'reactflow';

export default function DiffPanel({ diffMode, onExit, onOpacityChange }) {
  if (!diffMode) return null;

  const { counts, baseOpacity, fromHash, fromMessage } = diffMode;
  const label = fromMessage
    ? <>{fromHash?.slice(0, 7)} <span style={{ color: 'var(--text)', fontWeight: 'normal' }}>{fromMessage}</span></>
    : (fromHash === 'last' ? 'last commit' : (fromHash?.slice(0, 7) ?? '?'));

  return (
    <Panel position="top-right" className="diff-panel">
      <div className="diff-panel-title">
        Diffing vs. <span className="diff-panel-ref">{label}</span>
      </div>
      <div className="diff-panel-stats">
        {counts.added   > 0 && <span className="diff-stat diff-stat--added">+{counts.added} added</span>}
        {counts.removed > 0 && <span className="diff-stat diff-stat--removed">−{counts.removed} removed</span>}
        {counts.moved   > 0 && <span className="diff-stat diff-stat--moved">↔ {counts.moved} moved</span>}
        {counts.modified > 0 && <span className="diff-stat diff-stat--modified">~ {counts.modified} modified</span>}
        {!counts.added && !counts.removed && !counts.moved && !counts.modified && (
          <span className="diff-stat" style={{ opacity: 0.5 }}>no changes</span>
        )}
      </div>
      <div className="diff-panel-opacity">
        <span className="diff-panel-opacity-label">diff intensity</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={baseOpacity}
          onChange={e => onOpacityChange(parseFloat(e.target.value))}
          className="diff-opacity-slider"
        />
        <span className="diff-panel-opacity-val">{Math.round(baseOpacity * 100)}%</span>
      </div>
      <button className="diff-exit-btn" onClick={onExit}>Exit diff</button>
    </Panel>
  );
}
