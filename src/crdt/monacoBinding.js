import { MonacoBinding } from 'y-monaco';
import { getYText, getAwareness, onRoomChange } from './doc.js';

export function bindMonaco(filePath, editor, initialContent) {
  const label = filePath.split('/').pop();

  let binding       = null;
  let activeYText   = null;
  let unsubAwareness = null;
  let selDisposable  = null;

  function onTextChange(event, txn) {
    const isLocal = txn.local;
    console.log(`[Monaco] yText delta (${isLocal ? 'local' : 'REMOTE'}) on ${label}:`,
      JSON.stringify(event.delta).slice(0, 200));
    if (!isLocal) {
      const aw = getAwareness();
      if (aw) {
        aw.getStates().forEach((s, id) => {
          if (id !== aw.clientID)
            console.log(`  remote peer ${id} selection:`, s?.selection ?? 'NOT SET');
        });
      }
    }
  }

  function attach() {
    // Tear down any existing binding before reconnecting
    binding?.destroy();
    activeYText?.unobserve(onTextChange);
    unsubAwareness?.();
    selDisposable?.dispose();

    activeYText = getYText(filePath);
    if (activeYText.length === 0 && initialContent) {
      activeYText.insert(0, initialContent);
    }

    const awareness = getAwareness();
    console.log('[Monaco] binding', label, '— awareness:', awareness ? `clientID=${awareness.clientID}` : 'NULL');

    activeYText.observe(onTextChange);

    selDisposable = editor.onDidChangeCursorSelection(() => {
      if (!awareness) return;
      setTimeout(() => {
        const localState = awareness.getLocalState();
        console.log(`[Monaco] cursor moved in ${label} — awareness selection:`, localState?.selection ?? 'NOT SET');
      }, 0);
    });

    if (awareness) {
      const onAwarenessChange = ({ added, updated, removed }) => {
        const states = awareness.getStates();
        states.forEach((s, id) => {
          if (id === awareness.clientID || !s?.color) return;
          // Rebuild on every change so the name label stays current
          const styleId = `y-peer-${id}`;
          let el = document.getElementById(styleId);
          if (!el) {
            el = document.createElement('style');
            el.id = styleId;
            document.head.appendChild(el);
          }
          // Strip chars that would break a CSS string literal
          const name = (s.name ?? `peer-${String(id).slice(-4)}`).replace(/[\\'"\n\r]/g, '');
          el.textContent = [
            `.yRemoteSelection-${id} { background: ${s.color}44; }`,
            // The head span IS the DOM element — border-left = cursor caret
            `.yRemoteSelectionHead-${id} {`,
            `  border-left-color: ${s.color};`,
            `  border-top-color:  ${s.color};`,
            `}`,
            // Name tag floats above the cursor on hover
            `.yRemoteSelectionHead-${id}::after {`,
            `  content: '${name}';`,
            `  background: ${s.color};`,
            `}`,
          ].join('\n');
        });
        const changed = [...added, ...updated].map(id => {
          const s = states.get(id);
          return { id, name: s?.name, selection: s?.selection ? 'has-selection' : 'no-selection' };
        });
        if (changed.length) console.log('[Monaco] awareness change on', label, ':', changed);
        if (removed.length) {
          removed.forEach(id => document.getElementById(`y-peer-${id}`)?.remove());
          console.log('[Monaco] awareness removed:', removed);
        }
      };
      awareness.on('change', onAwarenessChange);
      unsubAwareness = () => awareness.off('change', onAwarenessChange);
    } else {
      console.warn('[Monaco] no awareness — remote cursors will NOT show for', label);
      unsubAwareness = null;
    }

    binding = new MonacoBinding(activeYText, editor.getModel(), new Set([editor]), awareness);
  }

  attach();
  // Recreate the binding whenever initRoom() fires a new doc + awareness into existence
  const unsubRoom = onRoomChange(attach);

  return () => {
    binding?.destroy();
    activeYText?.unobserve(onTextChange);
    unsubAwareness?.();
    selDisposable?.dispose();
    unsubRoom();
  };
}
