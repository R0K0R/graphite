import { useState, useEffect } from 'react';
import { getRoomCode, initRoom, setLocalUser, getPeers, getAwareness, onRoomChange } from '../crdt/doc.js';
import { usePeers } from '../crdt/usePeers.js';

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

export default function SessionPanel({ open, onClose, rootPath, onRoomJoined }) {
  const peers = usePeers();
  const [roomCode, setRoomCode] = useState(() => getRoomCode() ?? '');
  const [joinInput, setJoinInput] = useState('');
  const [localName, setLocalName] = useState('me');
  const [copied, setCopied] = useState(false);

  // Keep room code in sync with doc state
  useEffect(() => {
    const unsub = onRoomChange(code => setRoomCode(code ?? ''));
    setRoomCode(getRoomCode() ?? '');
    return unsub;
  }, []);

  if (!open) return null;

  const remotePeers = peers.filter(p => !p.isLocal);
  const localPeer   = peers.find(p => p.isLocal);

  function handleCopy() {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  function handleJoin(e) {
    e.preventDefault();
    const code = joinInput.trim();
    if (!code || !rootPath) return;
    initRoom(rootPath, code);
    onRoomJoined?.(code);
    setJoinInput('');
  }

  function handleNameChange(e) {
    const name = e.target.value;
    setLocalName(name);
    setLocalUser(name || 'me');
  }

  const isLive = peers.length > 1;

  return (
    <div className="session-overlay" onClick={onClose}>
      <div className="session-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="session-header">
          <div className="session-title">
            <div className={`session-title-live${isLive ? ' is-live' : ''}`} />
            graphite sync
          </div>
          <button className="session-close" onClick={onClose}>×</button>
        </div>

        <div className="session-body">

          {!rootPath ? (
            <p className="session-hint" style={{ padding: '8px 0' }}>
              Open a folder to start a session. Your canvas will be shared with anyone who joins the same room.
            </p>
          ) : (
            <>
              {/* Active room */}
              <div className="session-section">
                <div className="session-section-label">
                  active room
                  {remotePeers.length > 0 && (
                    <span className="session-section-badge">{remotePeers.length} peer{remotePeers.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <div className="session-section-content">
                  <div className="session-room-code">
                    <div className="session-room-code-text">{roomCode || '—'}</div>
                    <button className={`session-copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
                      {copied ? 'copied' : 'copy'}
                    </button>
                  </div>
                  <p className="session-hint">Share this code with collaborators to join your canvas in real time.</p>
                </div>
              </div>

              {/* Your identity */}
              <div className="session-section">
                <div className="session-section-label">your identity</div>
                <div className="session-section-content">
                  <div className="session-name-row">
                    <span className="session-name-label">name</span>
                    <input
                      className="session-input-sm"
                      value={localName}
                      onChange={handleNameChange}
                      placeholder="display name"
                      maxLength={24}
                    />
                    {localPeer && (
                      <div
                        className="session-peer-avatar"
                        style={{ background: localPeer.color, flexShrink: 0 }}
                      >
                        {initials(localName)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Peers */}
              {peers.length > 0 && (
                <div className="session-section">
                  <div className="session-section-label">
                    peers
                    <span className="session-section-badge">{peers.length} connected</span>
                  </div>
                  <div className="session-section-content">
                    <div className="session-peer-list">
                      {peers.map(peer => (
                        <div key={peer.id} className="session-peer-item">
                          <div
                            className="session-peer-avatar"
                            style={{ background: peer.color }}
                          >
                            {initials(peer.name)}
                          </div>
                          <span className="session-peer-name">{peer.name}</span>
                          {peer.isLocal && <span className="session-peer-badge local">you</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Join different room */}
              <div className="session-section">
                <div className="session-section-label">join a room</div>
                <div className="session-section-content">
                  <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      className="session-input"
                      value={joinInput}
                      onChange={e => setJoinInput(e.target.value)}
                      placeholder="enter room code"
                    />
                    <button type="submit" className="session-btn session-btn--primary" disabled={!joinInput.trim()}>
                      → join room
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}

          {/* Transport */}
          <div className="session-section">
            <div className="session-section-label">transport</div>
            <div className="session-section-content">
              <div className="session-transport">
                <div className="session-transport-opt active">
                  <div className="session-transport-dot" />
                  P2P / WebRTC
                </div>
                <div className="session-transport-opt disabled" title="Central relay server — coming soon">
                  <div className="session-transport-dot" />
                  Server
                </div>
              </div>
              <p className="session-hint">
                P2P connects peers directly via WebRTC. A central relay server with persistence and access control is planned.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
