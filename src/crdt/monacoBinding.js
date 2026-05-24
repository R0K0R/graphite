import { MonacoBinding } from 'y-monaco';
import { getYText, getAwareness } from './doc.js';

export function bindMonaco(filePath, editor, initialContent) {
  const label = filePath.split('/').pop();
  const yText = getYText(filePath);

  if (yText.length === 0 && initialContent) {
    yText.insert(0, initialContent);
  }

  const awareness = getAwareness();
  console.log('[Monaco] binding', label, '— awareness:', awareness ? `clientID=${awareness.clientID}` : 'NULL');

  // Log every Y.Text delta applied to this editor
  const onTextChange = (event, txn) => {
    const isLocal = txn.local;
    const delta = event.delta;
    console.log(`[Monaco] yText delta (${isLocal ? 'local' : 'REMOTE'}) on ${label}:`, JSON.stringify(delta).slice(0, 200));
    // After remote delta, dump current awareness cursor state
    if (!isLocal && awareness) {
      const states = awareness.getStates();
      states.forEach((s, id) => {
        if (id !== awareness.clientID)
          console.log(`  remote peer ${id} cursor:`, s?.cursor ?? 'NOT SET');
      });
    }
  };
  yText.observe(onTextChange);

  // Directly watch the Monaco cursor and log what y-monaco does to awareness
  const disposable = editor.onDidChangeCursorSelection(() => {
    if (!awareness) return;
    setTimeout(() => {
      const localState = awareness.getLocalState();
      console.log(`[Monaco] cursor moved in ${label} — awareness cursor:`, localState?.cursor ?? 'NOT SET');
    }, 0);
  });

  // Log awareness cursor updates
  let unsubAwareness = null;
  if (awareness) {
    const onAwarenessChange = ({ added, updated, removed }) => {
      const states = awareness.getStates();
      const changed = [...added, ...updated].map(id => {
        const s = states.get(id);
        return { id, name: s?.name, cursor: s?.cursor ? 'has-cursor' : 'no-cursor' };
      });
      if (changed.length) console.log('[Monaco] awareness change on', label, ':', changed);
      if (removed.length) console.log('[Monaco] awareness removed:', removed);
    };
    awareness.on('change', onAwarenessChange);
    unsubAwareness = () => awareness.off('change', onAwarenessChange);
  } else {
    console.warn('[Monaco] no awareness — remote cursors will NOT show for', label);
  }

  const binding = new MonacoBinding(yText, editor.getModel(), new Set([editor]), awareness);

  return () => {
    binding.destroy();
    yText.unobserve(onTextChange);
    unsubAwareness?.();
  };
}
