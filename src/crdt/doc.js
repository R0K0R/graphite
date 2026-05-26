import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
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

export function initRoom(rootPath, customCode) {
  destroyProviders();
  _doc = new Y.Doc();
  _roomCode = customCode ?? roomCodeForPath(rootPath);
  const persist = new IndexeddbPersistence(_roomCode, _doc);
  const ws = new WebsocketProvider('ws://localhost:1234', _roomCode, _doc);
  _awareness = ws.awareness;
  _awareness.setLocalStateField('name', _localName);
  _awareness.setLocalStateField('color', _localColor);
  _providers = [persist, ws];

  ws.on('status', ({ status }) => {
    console.log('[CRDT] ws status:', status);
    notifyStatus({ connected: status === 'connected', synced: false });
  });
  ws.on('sync', (synced) => {
    console.log('[CRDT] synced:', synced);
    notifyStatus({ connected: true, synced });
  });

  notifyRoomChange();
  return { persist, ws };
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
