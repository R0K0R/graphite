import { Handle, Position, useNodeId, useUpdateNodeInternals } from 'reactflow';
import { useEffect } from 'react';

// Base wrapper used by all node types.
// accentColor sets the left-border accent; peerColors shows who's viewing.

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Node({ selected, baseClass = 'file-node', accentColor, className = '', fillParent = false, children }) {
  const nodeId = useNodeId();
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => { if (nodeId) updateNodeInternals(nodeId); }, [nodeId]); // eslint-disable-line

  const style = {
    ...(accentColor ? { borderLeftColor: accentColor } : {}),
    ...(fillParent ? { width: '100%', height: '100%' } : {}),
  };
  return (
    <>
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, pointerEvents: 'none', width: 1, height: 1, minWidth: 0, minHeight: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none', width: 1, height: 1, minWidth: 0, minHeight: 0 }} />
      <div
        className={[baseClass, selected && `${baseClass}--selected`, className].filter(Boolean).join(' ')}
        style={Object.keys(style).length ? style : undefined}
      >
        {children}
      </div>
    </>
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

// Blame dot — shows author color + tooltip with commit info.
export function BlameDot({ blameInfo }) {
  if (!blameInfo) return null;
  const tip = [blameInfo.author, blameInfo.message, timeAgo(blameInfo.timestamp)].filter(Boolean).join(' · ');
  return (
    <div
      className="blame-dot nodrag"
      style={{ background: blameInfo.authorColor ?? '#888' }}
      title={tip}
    />
  );
}
