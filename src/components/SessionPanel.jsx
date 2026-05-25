import { useState, useEffect } from 'react';
import { getRoomCode, initRoom, setLocalUser, onRoomChange, onWebrtcStatus, getWebrtcStatus } from '../crdt/doc.js';
import { usePeers } from '../crdt/usePeers.js';

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

export default function SessionPanel({ open, onClose, rootPath }) {
  const peers = usePeers();
  const [roomCode, setRoomCode] = useState(() => getRoomCode() ?? '');
  const [joinInput, setJoinInput] = useState('');
  const [localName, setLocalName] = useState('me');
  const [copied, setCopied] = useState(false);
  const [webrtcStatus, setWebrtcStatus] = useState(() => getWebrtcStatus());

  useEffect(() => {
    setWebrtcStatus(getWebrtcStatus());
    return onWebrtcStatus(setWebrtcStatus);
  }, []);

  useEffect(() => {
    const unsub = onRoomChange(code => setRoomCode(code ?? ''));
    setRoomCode(getRoomCode() ?? '');
    return unsub;
  }, []);

  if (!open) return null;

  const remotePeers = peers.filter(p => !p.isLocal);
  const localPeer   = peers.find(p => p.isLocal);
  const isLive      = peers.length > 1;

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
    if (!code) return;
    // rootPath can be null — joining doesn't require a local folder.
    // The host's nodes sync over CRDT; file content arrives via Y.Text.
    initRoom(rootPath ?? '', code);
    setJoinInput('');
    onClose();
  }

  function handleNameChange(e) {
    const name = e.target.value;
    setLocalName(name);
    setLocalUser(name || 'me');
  }

  return (
    <div className="session-overlay" onClick={onClose}>
      <div className="session-panel" onClick={e => e.stopPropagation()}>

        <div className="session-header">
          <div className="session-title">
            <div className={`session-title-live${isLive ? ' is-live' : ''}`} />
            graphite sync
          </div>
          <button className="session-close" onClick={onClose}>×</button>
        </div>

        <div className="session-body">

          {/* Join a room — always visible */}
          <div className="session-section">
            <div className="session-section-label">join a room</div>
            <div className="session-section-content">
              <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  className="session-input"
                  value={joinInput}
                  onChange={e => setJoinInput(e.target.value)}
                  placeholder="enter room code  e.g. amber-crane-forge-tide"
                  autoFocus
                />
                <button type="submit" className="session-btn session-btn--primary" disabled={!joinInput.trim()}>
                  → join room
                </button>
              </form>
              <p className="session-hint" style={{ marginTop: 6 }}>
                You don't need a local folder to join — the host's canvas syncs to you directly.
              </p>
            </div>
          </div>

          {/* Active room — only shown when a room is open */}
          {roomCode && (
            <div className="session-section">
              <div className="session-section-label">
                active room
                {remotePeers.length > 0 && (
                  <span className="session-section-badge">{remotePeers.length} peer{remotePeers.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="session-section-content">
                <div className="session-room-code">
                  <div className="session-room-code-text">{roomCode}</div>
                  <button className={`session-copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
                    {copied ? 'copied' : 'copy'}
                  </button>
                </div>
                <p className="session-hint">Share this code for others to join your canvas.</p>
              </div>
            </div>
          )}

          {/* Hosting hint when no folder is open */}
          {!rootPath && !roomCode && (
            <div className="session-section">
              <div className="session-section-label">hosting</div>
              <div className="session-section-content">
                <p className="session-hint">
                  Open a folder to start hosting — your canvas will get a room code to share.
                </p>
              </div>
            </div>
          )}

          {/* Identity */}
          {roomCode && (
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
                    <div className="session-peer-avatar" style={{ background: localPeer.color, flexShrink: 0 }}>
                      {initials(localName)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

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
                      <div className="session-peer-avatar" style={{ background: peer.color }}>
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

          {/* Transport */}
          <div className="session-section">
            <div className="session-section-label">transport</div>
            <div className="session-section-content">
              <div className="session-transport">
                <div className="session-transport-opt active">
                  <div className="session-transport-dot" />
                  P2P / WebRTC
                </div>
                <div className="session-transport-opt disabled">
                  <div className="session-transport-dot" />
                  Server
                </div>
              </div>
              {roomCode && (
                <div className="session-webrtc-status">
                  <span
                    className={`session-webrtc-dot ${webrtcStatus.connected ? 'is-connected' : 'is-connecting'}`}
                  />
                  <span className="session-hint" style={{ margin: 0 }}>
                    {webrtcStatus.synced
                      ? 'synced with peers'
                      : webrtcStatus.connected
                        ? 'signaling connected — waiting for peers'
                        : 'connecting to signaling server…'}
                  </span>
                </div>
              )}
              <p className="session-hint">
                Peers connect directly via WebRTC. Signaling server only used for the initial handshake.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
