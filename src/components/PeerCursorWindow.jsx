import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { getYText } from '../crdt/doc.js';
import { usePrefs } from '../ThemeContext.js';
import { extLang } from './nodes/CodeNode.jsx';

export default function PeerCursorWindow({ peer, onClose }) {
  const { theme } = usePrefs();
  const monacoTheme = theme === 'light' ? 'vs' : 'vs-dark';
  const editorRef   = useRef(null);
  const monacoRef   = useRef(null);
  const decoRef     = useRef([]);
  const [pos, setPos] = useState({ x: 20, y: 80 });
  const dragRef = useRef(null);

  const lang    = extLang(peer.filePath);
  const content = peer.filePath ? getYText(peer.filePath).toString() : '';

  function applyDecoration(editor, monaco, line) {
    decoRef.current = editor.deltaDecorations(decoRef.current, line ? [{
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: 'peer-cursor-line',
        overviewRuler: { color: peer.color, position: 1 },
      },
    }] : []);
  }

  function handleMount(editor, monaco) {
    editorRef.current  = editor;
    monacoRef.current  = monaco;
    if (peer.cursorLine) {
      editor.revealLineInCenter(peer.cursorLine);
      applyDecoration(editor, monaco, peer.cursorLine);
    }
  }

  useEffect(() => {
    const ed = editorRef.current;
    const mo = monacoRef.current;
    if (!ed || !mo || !peer.cursorLine) return;
    ed.revealLineInCenter(peer.cursorLine);
    applyDecoration(ed, mo, peer.cursorLine);
  }, [peer.cursorLine]); // eslint-disable-line

  function onMouseDown(e) {
    if (e.target.closest('button')) return;
    dragRef.current = { sx: e.clientX - pos.x, sy: e.clientY - pos.y };
    const onMove = ev => setPos({ x: ev.clientX - dragRef.current.sx, y: ev.clientY - dragRef.current.sy });
    const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  }

  return (
    <div className="peer-cursor-window" style={{ left: pos.x, top: pos.y }}>
      <div className="peer-cursor-header" onMouseDown={onMouseDown}>
        <span className="peer-cursor-dot" style={{ background: peer.color }} />
        <span className="peer-cursor-name">{peer.name}</span>
        <span className="peer-cursor-file">{peer.filePath?.split('/').pop()}</span>
        {peer.cursorLine && <span className="peer-cursor-line-num">:{peer.cursorLine}</span>}
        <button className="peer-cursor-close" onClick={onClose}>×</button>
      </div>
      <div className="peer-cursor-body">
        <Editor
          key={peer.filePath}
          height="180px"
          language={lang}
          value={content}
          theme={monacoTheme}
          onMount={handleMount}
          options={{
            readOnly: true, minimap: { enabled: false }, lineNumbers: 'on',
            fontSize: 11, fontFamily: 'var(--mono)', wordWrap: 'off',
            scrollBeyondLastLine: false, folding: false,
            scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
            renderLineHighlight: 'none',
          }}
        />
      </div>
    </div>
  );
}
