import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';

let _doc = null;
let _providers = [];
let _awareness = null;
let _roomCode = null;
let _localName = 'me';
let _localColor = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

const _roomListeners = new Set();

function notifyRoomChange() {
  _roomListeners.forEach(cb => { try { cb(_roomCode); } catch (_) {} });
}

export function onRoomChange(cb) {
  _roomListeners.add(cb);
  return () => _roomListeners.delete(cb);
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
  _awareness?.setLocalState({ name: _localName, color: _localColor });
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
  _roomCode = customCode ?? ('graphite-' + rootPath.replace(/[^a-zA-Z0-9]/g, '-'));
  const persist = new IndexeddbPersistence(_roomCode, _doc);
  const webrtc  = new WebrtcProvider(_roomCode, _doc, {
    signaling: ['ws://localhost:4444'],
  });
  _awareness    = webrtc.awareness;
  _awareness.setLocalState({ name: _localName, color: _localColor });
  _providers = [persist, webrtc];
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
