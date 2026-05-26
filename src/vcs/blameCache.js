// Per-file blame data cache. Keyed by Monaco model URI (e.g. "file:///abs/path").
// Populated by CodeNode on mount; read by the Monaco blame hover provider.
const _cache = new Map();

export function setBlame(uri, lines) {
  _cache.set(uri, lines);
}

// Returns the BlameLineInfo for a 1-indexed line number, or null.
export function getBlameForLine(uri, lineNumber) {
  return _cache.get(uri)?.[lineNumber - 1] ?? null;
}

export function clearBlame(uri) {
  _cache.delete(uri);
}
