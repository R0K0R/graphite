import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import { generateRoomCode } from '../utils/wordlist.js';

let _doc = null;
let _providers = [];
let _awareness = null;
let _roomCode = null;
let _localName = 'me';
let _localColor = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

// WebRTC connection state exposed to the UI
let _webrtcConnected = false;
let _webrtcSynced    = false;

const _roomListeners   = new Set();
const _statusListeners = new Set();

function notifyRoomChange() {
  _roomListeners.forEach(cb => { try { cb(_roomCode); } catch (_) {} });
}

function notifyStatus() {
  const s = { connected: _webrtcConnected, synced: _webrtcSynced };
  _statusListeners.forEach(cb => { try { cb(s); } catch (_) {} });
}

export function onRoomChange(cb) {
  _roomListeners.add(cb);
  return () => _roomListeners.delete(cb);
}

export function onWebrtcStatus(cb) {
  _statusListeners.add(cb);
  return () => _statusListeners.delete(cb);
}

export function getWebrtcStatus() {
  return { connected: _webrtcConnected, synced: _webrtcSynced };
}

export function getDoc() {
  if (!_doc) _doc = new Y.Doc();
  return _doc;
}

export function getAwareness() { return _awareness; }
export function getRoomCode()  { return _roomCode; }

export function setLocalUser(name, color) {
  _localName  = name  ?? _localName;
  _localColor = color ?? _localColor;
  _awareness?.setLocalStateField('name', _localName);
  _awareness?.setLocalStateField('color', _localColor);
}

export function getPeers() {
  if (!_awareness) return [];
  const states = _awareness.getStates();
  return Array.from(states.entries()).map(([id, state]) => ({
    id,
    name:    state?.name  ?? `peer-${String(id).slice(-4)}`,
    color:   state?.color ?? '#888888',
    isLocal: id === _awareness.clientID,
    focusedNode: state?.focusedNode ?? null,
  }));
}

// Tear down providers in the correct order:
// disconnect() must come before destroy() so y-webrtc removes the SignalingConn
// from its module-level signalingConns map. Without this, the next WebrtcProvider
// reuses the already-open WebSocket — the 'connect' handler never fires again,
// the new room's subscribe/announce messages are never sent, and peers can't find
// each other (the silent join failure).
function tearDownProviders() {
  _providers.forEach(p => {
    try { p.disconnect?.(); } catch (_) {}
    try { p.destroy();      } catch (_) {}
  });
  _providers = [];
}

export function initRoom(rootPath, customCode) {
  // Tear down without notifying — avoids a spurious onRoomChange(null) that causes
  // monacoBinding's attach() to create a null-awareness MonacoBinding, leaking a
  // y-monaco cursor listener that its destroy() never removes.
  tearDownProviders();
  _awareness = null;
  _doc = null;
  _roomCode = null;
  _webrtcConnected = false;
  _webrtcSynced    = false;

  _doc = new Y.Doc();
  _roomCode = customCode ?? generateRoomCode();

  const persist = new IndexeddbPersistence(_roomCode, _doc);
  const webrtc = new WebrtcProvider(_roomCode, _doc, {
    signaling: ['wss://y-webrtc-eu.fly.dev'],
  });
  _awareness = webrtc.awareness;
  _awareness.setLocalStateField('name', _localName);
  _awareness.setLocalStateField('color', _localColor);
  _providers = [persist, webrtc];

  // y-webrtc v10 emits { connected: boolean }, not { status: string }
  webrtc.on('status', ({ connected }) => {
    _webrtcConnected = connected;
    console.log('[CRDT] webrtc connected:', connected);
    notifyStatus();
  });
  webrtc.on('synced', ({ synced }) => {
    _webrtcSynced = synced;
    console.log('[CRDT] synced:', synced);
    notifyStatus();
  });
  webrtc.on('peers', ({ webrtcPeers, bcPeers }) => {
    console.log('[CRDT] peers — webrtc:', webrtcPeers.length, 'bc:', bcPeers.length);
  });

  notifyRoomChange();
  return { persist, webrtc };
}

export function destroyProviders() {
  tearDownProviders();
  _awareness = null;
  _doc = null;
  _roomCode = null;
  _webrtcConnected = false;
  _webrtcSynced    = false;
  notifyRoomChange();
  notifyStatus();
}

export const getYNodes = () => getDoc().getMap('nodes');
export const getYText  = (filePath) => getDoc().getText('file:' + filePath);
