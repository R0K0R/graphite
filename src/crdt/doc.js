import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import { WebrtcProvider } from 'y-webrtc';
import { roomCodeForPath } from '../utils/wordlist.js';

let _doc = null;
let _providers = [];
let _awareness = null;
let _roomCode = null;
let _localName = 'me';
let _localColor = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

const _roomListeners   = new Set();
const _statusListeners = new Set();
let _currentStatus = { connected: false, synced: false };

function notifyRoomChange() {
  _roomListeners.forEach(cb => { try { cb(_roomCode); } catch (_) {} });
}

function notifyStatus(s) {
  _currentStatus = s;
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

export function getWebrtcStatus() { return _currentStatus; }

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

export function setLocalUserFile(filePath, cursorLine) {
  _awareness?.setLocalStateField('filePath',   filePath   ?? null);
  _awareness?.setLocalStateField('cursorLine', cursorLine ?? null);
}

export function getPeers() {
  if (!_awareness) return [];
  const states = _awareness.getStates();
  return Array.from(states.entries()).map(([id, state]) => ({
    id,
    name:        state?.name        ?? `peer-${String(id).slice(-4)}`,
    color:       state?.color       ?? '#888888',
    isLocal:     id === _awareness.clientID,
    focusedNode: state?.focusedNode ?? null,
    filePath:    state?.filePath    ?? null,
    cursorLine:  state?.cursorLine  ?? null,
  }));
}

export function initRoom(rootPath, customCode, signalingUrl) {
  destroyProviders();
  _doc = new Y.Doc();
  _roomCode = customCode ?? roomCodeForPath(rootPath);

  const persist = new IndexeddbPersistence(_roomCode, _doc);

  // WebSocket relay — always active; peers sync through the local relay server.
  const ws = new WebsocketProvider('ws://localhost:1234', _roomCode, _doc);

  // WebRTC P2P — shares awareness with WebSocket so cursor state merges across transports.
  const signaling = signalingUrl ? [signalingUrl] : ['ws://localhost:4444'];
  const webrtc = new WebrtcProvider(_roomCode, _doc, { signaling, awareness: ws.awareness });

  _awareness = ws.awareness;
  _awareness.setLocalStateField('name', _localName);
  _awareness.setLocalStateField('color', _localColor);
  _providers = [persist, ws, webrtc];

  ws.on('status', ({ status }) => {
    console.log('[CRDT] ws:', status);
    notifyStatus({ connected: status === 'connected', synced: false });
  });
  ws.on('sync', (synced) => {
    console.log('[CRDT] ws synced:', synced);
    notifyStatus({ connected: true, synced });
  });
  webrtc.on('status', ({ connected }) => console.log('[CRDT] webrtc:', connected ? 'connected' : 'disconnected'));

  notifyRoomChange();
  return { persist, ws, webrtc };
}

export function destroyProviders() {
  _providers.forEach(p => { try { p.destroy(); } catch (_) {} });
  _providers = [];
  _awareness = null;
  _doc = null;
  _roomCode = null;
  _currentStatus = { connected: false, synced: false };
  notifyRoomChange();
}

export const getYNodes = () => getDoc().getMap('nodes');
export const getYText  = (filePath) => getDoc().getText('file:' + filePath);

export function captureUpdate() {
  return Y.encodeStateAsUpdate(getDoc());
}
