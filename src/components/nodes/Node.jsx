// Base wrapper used by all node types.
// accentColor sets the left-border accent; peerColors shows who's viewing.
export default function Node({ selected, baseClass = 'file-node', accentColor, className = '', peerColors, fillParent = false, children }) {
  const style = {
    ...(accentColor ? { borderLeftColor: accentColor } : {}),
    ...(fillParent ? { width: '100%', height: '100%' } : {}),
  };
  return (
    <div
      className={[baseClass, selected && `${baseClass}--selected`, className].filter(Boolean).join(' ')}
      style={Object.keys(style).length ? style : undefined}
    >
      {children}
    </div>
  );
}

// Renders peer presence dots in a node header. Pass peerColors from data.
export function PeerDots({ colors = [] }) {
  if (!colors || colors.length === 0) return null;
  return (
    <div className="file-node-peers">
      {colors.map((color, i) => (
        <div key={i} className="file-node-peer-dot" style={{ background: color }} />
      ))}
    </div>
  );
}

