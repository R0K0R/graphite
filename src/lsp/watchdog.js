import { setShadow, clearShadow, changeDocument } from './LspClient.js';

const states = new Map(); // uri → { timer, idleTimer, status }
const IDLE_TIMEOUT_MS = 30_000;

export function startWatchdog(uri, editor, monaco, lang, rootPath, onStatusChange, getPrefs) {
  const set = (status) => {
    states.get(uri).status = status;
    onStatusChange?.(status);
  };
  states.set(uri, { timer: null, idleTimer: null, status: 'clean' });

  function resetIdleTimer() {
    const state = states.get(uri);
    if (!state) return;
    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      if (!states.has(uri)) return;
      const s = states.get(uri);
      if (s.status !== 'clean') {
        clearShadow(uri);
        changeDocument(uri, editor.getValue());
        set('clean');
      }
    }, IDLE_TIMEOUT_MS);
  }

  function tick() {
    const model = editor.getModel();
    if (!model || !states.has(uri)) return;
    resetIdleTimer();
    const markers = monaco.editor.getModelMarkers({ resource: model.uri });
    const hasErrors = markers.some(m => m.severity === 8); // MarkerSeverity.Error
    const state = states.get(uri);

    if (!hasErrors) {
      if (state.status !== 'clean') {
        clearTimeout(state.timer);
        clearShadow(uri);
        changeDocument(uri, editor.getValue());
        set('clean');
      }
      return;
    }
    const prefs = getPrefs?.();
    if (!prefs?.watchdogEnabled) return;
    if (state.status === 'repairing') return;
    clearTimeout(state.timer);
    set('debouncing');
    state.timer = setTimeout(async () => {
      if (!states.has(uri)) return;
      set('repairing');
      const code = editor.getValue();
      const model = getPrefs?.()?.watchdogModel || undefined;
      const fixed = await window.electronAPI?.agentRepair({ rootPath, lang, code, model }).catch(() => null);
      if (!states.has(uri)) return;
      if (fixed && fixed !== code) {
        setShadow(uri, fixed);
        changeDocument(uri, fixed);
        set('shadowed');
      } else {
        set('clean');
      }
    }, 1000);
  }

  return {
    tick,
    teardown() {
      const s = states.get(uri);
      clearTimeout(s?.timer);
      clearTimeout(s?.idleTimer);
      states.delete(uri);
      clearShadow(uri);
    },
  };
}
