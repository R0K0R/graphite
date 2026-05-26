import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
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

function notifyRoomChange() {
  _roomListeners.forEach(cb => { try { cb(_roomCode); } catch (_) {} });
}

function notifyStatus(s) {
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

export function getWebrtcStatus() { return { connected: false, synced: false }; }

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
  const signaling = signalingUrl ? [signalingUrl] : ['ws://localhost:4444'];
  const webrtc = new WebrtcProvider(_roomCode, _doc, { signaling });
  _awareness = webrtc.awareness;
  _awareness.setLocalStateField('name', _localName);
  _awareness.setLocalStateField('color', _localColor);
  _providers = [persist, webrtc];

  webrtc.on('status', ({ connected }) => {
    console.log('[CRDT] webrtc connected:', connected);
    notifyStatus({ connected, synced: false });
  });
  webrtc.on('synced', ({ synced }) => {
    console.log('[CRDT] synced:', synced);
    notifyStatus({ connected: true, synced });
  });

  notifyRoomChange();
  return { persist, webrtc };
}

export function destroyProviders() {
  _providers.forEach(p => { try { p.destroy(); } catch (_) {} });
  _providers = [];
  _awareness = null;
  _doc = null;
  _roomCode = null;
  notifyRoomChange();
}

export const getYNodes = () => getDoc().getMap('nodes');
export const getYText  = (filePath) => getDoc().getText('file:' + filePath);

export function captureUpdate() {
  return Y.encodeStateAsUpdate(getDoc());
}
