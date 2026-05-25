import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { marked } from 'marked';
import { usePrefs } from '../../ThemeContext.js';
import { bindMonaco } from '../../crdt/monacoBinding.js';
import { getYText, onRoomChange } from '../../crdt/doc.js';
import Node, { PeerDots, BlameDot } from './Node.jsx';
import { basename, LANG_COLOR } from './CodeNode.jsx';

marked.setOptions({ breaks: true, gfm: true });

export default function MarkdownNode({ id, data, selected }) {
  const { filePath, onFilePicked, expanded, onEditorFocus, onEditorBlur, peerColors, blameInfo } = data;
  const [mode, setMode] = useState('preview'); // 'preview' | 'source'
  const [content, setContent] = useState('');
  const writeTimer = useRef(null);
  const unbindRef  = useRef(null);
  const { theme } = usePrefs();
  const monacoTheme = theme === 'light' ? 'vs' : 'vs-dark';

  // Subscribe to Y.Text for preview rendering — re-attach when initRoom() replaces the doc.
  useEffect(() => {
    if (!filePath) return;
    let yText = getYText(filePath);
    const sync = () => setContent(yText.toString());
    yText.observe(sync);
    sync();
    const unsubRoom = onRoomChange(() => {
      yText.unobserve(sync);
      yText = getYText(filePath);
      yText.observe(sync);
      sync();
    });
    return () => {
      yText.unobserve(sync);
      unsubRoom();
    };
  }, [filePath]);

  useEffect(() => {
    if (!filePath || !window.electronAPI) return;
    window.electronAPI.watchFile(filePath);
    return () => {
      window.electronAPI.unwatchFile(filePath);
      clearTimeout(writeTimer.current);
    };
  }, [filePath]); // eslint-disable-line

  // Cleanup Monaco binding on unmount
  useEffect(() => () => { unbindRef.current?.(); }, []);

  async function handleEditorMount(editor) {
    unbindRef.current?.();
    if (!filePath) return;
    let diskContent = '';
    try { diskContent = await window.electronAPI?.readFile(filePath) ?? ''; } catch (_) {}
    const unbind = bindMonaco(filePath, editor, diskContent);

    let activeYText = getYText(filePath);
    function onYChange() {
      clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        window.electronAPI?.writeFile(filePath, activeYText.toString());
      }, 500);
    }
    activeYText.observe(onYChange);
    const unsubDiskRoom = onRoomChange(() => {
      activeYText.unobserve(onYChange);
      activeYText = getYText(filePath);
      activeYText.observe(onYChange);
    });

    unbindRef.current = () => {
      unbind();
      activeYText.unobserve(onYChange);
      unsubDiskRoom();
    };
  }

  const renderedHtml = content ? marked.parse(content) : '<p style="color:var(--muted);font-size:11px">Empty file</p>';

  return (
    <Node selected={selected} accentColor={LANG_COLOR.markdown ?? '#083fa1'} className={expanded ? 'file-node--expanded' : ''} fillParent={!!expanded}>
      <div className="file-node-header">
        <span className="file-node-filename">{filePath ? basename(filePath) : 'Markdown'}</span>
        <span className="file-node-lang">md</span>
        <PeerDots colors={peerColors} />
        <BlameDot blameInfo={blameInfo} />
        <button
          className="md-toggle-btn nodrag"
          onClick={() => setMode(m => m === 'preview' ? 'source' : 'preview')}
        >
          {mode === 'preview' ? 'source' : 'preview'}
        </button>
      </div>
      {filePath && <div className="file-node-path">{filePath}</div>}
      {!filePath && (
        <div className="file-node-placeholder nodrag">
          <button className="toolbar-btn" style={{ border: '1px dashed var(--border)', borderRadius: 6 }} onClick={() => onFilePicked?.(id)}>
            Pick a file…
          </button>
        </div>
      )}
      {filePath && mode === 'preview' && (
        <div
          className="markdown-preview nodrag nowheel"
          style={expanded ? undefined : { height: 300 }}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      )}
      {filePath && mode === 'source' && (
        <div className="file-code-container nodrag nowheel" style={expanded ? undefined : { height: 300 }} onFocus={() => onEditorFocus?.(id)} onBlur={onEditorBlur}>
          <Editor
            height={expanded ? '100%' : '300px'}
            path={'file://' + filePath}
            language="markdown"
            theme={monacoTheme}
            onMount={handleEditorMount}
            options={{
              fontSize: 11, fontFamily: 'var(--mono)', minimap: { enabled: false },
              lineNumbers: 'on', folding: false, wordWrap: 'on',
              scrollBeyondLastLine: false, automaticLayout: true,
              padding: { top: 6, bottom: 6 },
              scrollbar: { vertical: 'visible', horizontal: 'hidden', verticalScrollbarSize: 8 },
            }}
          />
        </div>
      )}
    </Node>
  );
}
