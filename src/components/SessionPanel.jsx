import { useState, useEffect } from 'react';
import { getRoomCode, initRoom, setLocalUser, onRoomChange, onWebrtcStatus, getWebrtcStatus } from '../crdt/doc.js';
import { usePeers } from '../crdt/usePeers.js';

const SIGNALING_PORT = 4444;

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

export default function SessionPanel({ open, onClose, rootPath }) {
  const peers = usePeers();
  const [roomCode, setRoomCode]         = useState(() => getRoomCode() ?? '');
  const [joinInput, setJoinInput]       = useState('');
  const [localName, setLocalName]       = useState('me');
  const [copied, setCopied]             = useState(false);
  const [webrtcStatus, setWebrtcStatus] = useState(() => getWebrtcStatus());
  const [tab, setTab]                   = useState('p2p'); // 'p2p' | 'server'
  const [serverRunning, setServerRunning] = useState(false);
  const [localIps, setLocalIps]         = useState([]);
  const [signalingUrl, setSignalingUrl] = useState('');
  const [urlSaved, setUrlSaved]         = useState(false);

  useEffect(() => {
    setWebrtcStatus(getWebrtcStatus());
    return onWebrtcStatus(setWebrtcStatus);
  }, []);

  useEffect(() => {
    const unsub = onRoomChange(code => setRoomCode(code ?? ''));
    setRoomCode(getRoomCode() ?? '');
    return unsub;
  }, []);

  useEffect(() => {
    if (!open || !window.electronAPI) return;
    window.electronAPI.signalingStatus().then(s => setServerRunning(s.running));
    window.electronAPI.signalingLocalIps().then(setLocalIps);
    if (rootPath) {
      window.electronAPI.graphiteReadConfig(rootPath).then(cfg => {
        setSignalingUrl(cfg.signalingUrl ?? '');
      });
    }
  }, [open, rootPath]);

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
    initRoom(rootPath ?? '', code, signalingUrl || null);
    setJoinInput('');
    onClose();
  }

  function handleNameChange(e) {
    const name = e.target.value;
    setLocalName(name);
    setLocalUser(name || 'me');
  }

  async function handleToggleServer() {
    if (!window.electronAPI) return;
    if (serverRunning) {
      await window.electronAPI.signalingStop();
      setServerRunning(false);
    } else {
      await window.electronAPI.signalingStart();
      setServerRunning(true);
      const ips = await window.electronAPI.signalingLocalIps();
      setLocalIps(ips);
    }
  }

  async function handleSaveUrl() {
    if (!rootPath || !window.electronAPI) return;
    const cfg = await window.electronAPI.graphiteReadConfig(rootPath);
    await window.electronAPI.graphiteWriteConfig(rootPath, { ...cfg, signalingUrl: signalingUrl.trim() || undefined });
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 1800);
  }

  const primaryIp = localIps[0] ?? '—';

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

          {/* Join */}
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

          {/* Active room */}
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

          {!rootPath && !roomCode && (
            <div className="session-section">
              <div className="session-section-label">hosting</div>
              <div className="session-section-content">
                <p className="session-hint">Open a folder to start hosting — your canvas will get a room code to share.</p>
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

          {/* Transport tabs */}
          <div className="session-section">
            <div className="session-section-label">transport</div>
            <div className="session-section-content">
              <div className="session-transport">
                <div
                  className={`session-transport-opt${tab === 'p2p' ? ' active' : ''}`}
                  onClick={() => setTab('p2p')}
                >
                  <div className="session-transport-dot" />
                  P2P / WebRTC
                </div>
                <div
                  className={`session-transport-opt${tab === 'server' ? ' active' : ''}`}
                  onClick={() => setTab('server')}
                >
                  <div className={`session-transport-dot${serverRunning ? ' is-running' : ''}`} />
                  Server
                </div>
              </div>

              {tab === 'p2p' && (
                <>
                  {roomCode && (
                    <div className="session-webrtc-status">
                      <span className={`session-webrtc-dot ${webrtcStatus.connected ? 'is-connected' : 'is-connecting'}`} />
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
                    Data flows peer-to-peer via WebRTC. The signaling server is only used to introduce peers — it never sees your canvas data.
                  </p>
                  <div className="session-url-row">
                    <input
                      className="session-input-sm"
                      style={{ flex: 1 }}
                      value={signalingUrl}
                      onChange={e => setSignalingUrl(e.target.value)}
                      placeholder={`signaling URL  (default: ws://localhost:${SIGNALING_PORT})`}
                    />
                    <button className="session-btn" onClick={handleSaveUrl} disabled={!rootPath} title={!rootPath ? 'Open a folder first to persist this setting' : ''}>
                      {urlSaved ? 'saved' : 'save'}
                    </button>
                  </div>
                </>
              )}

              {tab === 'server' && (
                <>
                  <div className="session-server-block">
                    <button
                      className={`session-btn${serverRunning ? '' : ' session-btn--primary'}`}
                      onClick={handleToggleServer}
                    >
                      {serverRunning ? 'stop signaling server' : 'start signaling server'}
                    </button>
                    {serverRunning && (
                      <div className="session-server-info">
                        <div className="session-server-addr">
                          <span className="session-server-dot running" />
                          {`ws://${primaryIp}:${SIGNALING_PORT}`}
                          {localIps.length > 1 && (
                            <span className="session-hint" style={{ margin: '2px 0 0' }}>
                              also on: {localIps.slice(1).join(', ')}
                            </span>
                          )}
                        </div>
                        <p className="session-hint" style={{ marginTop: 6 }}>
                          Share this URL with peers so they can enter it in the signaling URL field above.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="session-server-notice">
                    <span className="session-notice-icon">⚠</span>
                    <span>
                      This server is only reachable on your <strong>local network</strong>.
                      For internet access, forward port {SIGNALING_PORT} on your router to this machine.
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
