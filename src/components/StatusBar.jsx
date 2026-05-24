export default function StatusBar({ rootPath, nodeCount, peers = [] }) {
  const folder = rootPath ? rootPath.split('/').pop() : null;
  const remotePeers = peers.filter(p => !p.isLocal);

  return (
    <div className="ide-statusbar">
      <div className="statusbar-left">
        <span className="statusbar-item">
          {folder ? folder : 'no folder open'}
        </span>
        {nodeCount > 0 && (
          <span className="statusbar-item">
            {nodeCount} node{nodeCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="statusbar-right">
        {remotePeers.length > 0 && (
          <span className="statusbar-item statusbar-item--accent">
            <div className="statusbar-peers">
              {remotePeers.slice(0, 6).map(p => (
                <div
                  key={p.id}
                  className="statusbar-peer-dot"
                  style={{ background: p.color }}
                  title={p.name}
                />
              ))}
            </div>
            {remotePeers.length} peer{remotePeers.length !== 1 ? 's' : ''} live
          </span>
        )}
      </div>
    </div>
  );
}

export default function StatusBar({ rootPath, nodeCount, peers = [] }) {
  const folder = rootPath ? rootPath.split('/').pop() : null;
  const remotePeers = peers.filter(p => !p.isLocal);

  return (
    <div className="ide-statusbar">
      <div className="statusbar-left">
        <span className="statusbar-item">
          {folder ? folder : 'no folder open'}
        </span>
        {nodeCount > 0 && (
          <span className="statusbar-item">
            {nodeCount} node{nodeCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="statusbar-right">
        {remotePeers.length > 0 && (
          <span className="statusbar-item statusbar-item--accent">
            <div className="statusbar-peers">
              {remotePeers.slice(0, 6).map(p => (
                <div
                  key={p.id}
                  className="statusbar-peer-dot"
                  style={{ background: p.color }}
                  title={p.name}
                />
              ))}
            </div>
            {remotePeers.length} peer{remotePeers.length !== 1 ? 's' : ''} live
          </span>
        )}
      </div>
    </div>
  );
}

