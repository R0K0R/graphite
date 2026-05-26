// Singleton draft store + event bus for agent ↔ UI communication.
// All IPC events from main process flow through dispatch() here.

const _drafts = new Map(); // filePath → { oldContent, newContent }
const _listeners = new Set();

export function onAgentEvent(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

export function dispatch(event) {
  if (event.type === 'file-draft') {
    _drafts.set(event.path, { oldContent: event.oldContent, newContent: event.newContent });
  }
  _listeners.forEach(cb => { try { cb(event); } catch (_) {} });
}

export function getDraft(filePath) { return _drafts.get(filePath) ?? null; }
export function hasDraft(filePath) { return _drafts.has(filePath); }

export function clearDraft(filePath) {
  _drafts.delete(filePath);
  dispatch({ type: 'draft-cleared', path: filePath });
}
