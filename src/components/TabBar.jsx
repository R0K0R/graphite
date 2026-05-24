export default function TabBar({ tabs, activeId, onSelect, onClose }) {
  return (
    <div className="ide-tabbar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`ide-tab${tab.id === activeId ? ' ide-tab--active' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          <span className="ide-tab-label">{tab.label}</span>
          <button
            className="ide-tab-close"
            onClick={e => { e.stopPropagation(); onClose(tab.id); }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
