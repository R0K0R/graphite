import { MonacoBinding } from 'y-monaco';
import { getYText, getAwareness, onRoomChange, setLocalUserFile } from './doc.js';

export function bindMonaco(filePath, editor, initialContent) {
  let binding       = null;
  let activeYText   = null;
  let unsubAwareness = null;
  let selDisposable  = null;

  function onTextChange() {}

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

    activeYText.observe(onTextChange);

    setLocalUserFile(filePath, null);
    selDisposable = editor.onDidChangeCursorPosition(e => {
      setLocalUserFile(filePath, e.position.lineNumber);
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
        if (removed.length) {
          removed.forEach(id => document.getElementById(`y-peer-${id}`)?.remove());
        }
      };
      awareness.on('change', onAwarenessChange);
      unsubAwareness = () => awareness.off('change', onAwarenessChange);
    } else {
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
