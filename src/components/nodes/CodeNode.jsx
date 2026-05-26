import { useEffect, useRef, useState } from 'react';
import { onAgentEvent, getDraft } from '../../agent/agentBridge.js';
import { acceptDraft, rejectDraft } from '../../agent/applyDraft.js';
import Editor from '@monaco-editor/react';
import { usePrefs } from '../../ThemeContext.js';
import * as lspClient from '../../lsp/LspClient.js';
import { registerProviders, applyDiagnostics } from '../../lsp/monacoProviders.js';
import { bindMonaco } from '../../crdt/monacoBinding.js';
import { getYText, onRoomChange } from '../../crdt/doc.js';
import Node, { PeerDots, BlameDot } from './Node.jsx';

export const EXT_LANG = {
  py: 'python', js: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', json: 'json',
  sh: 'shell', css: 'css', html: 'html',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', rs: 'rust',
  go: 'go', rb: 'ruby', java: 'java', c: 'c', cpp: 'cpp',
  h: 'c', hpp: 'cpp', cs: 'csharp', php: 'php',
  swift: 'swift', kt: 'kotlin', sql: 'sql', xml: 'xml',
  txt: 'plaintext', env: 'plaintext',
};

export const LANG_COLOR = {
  python: '#3572A5', javascript: '#f1e05a', typescript: '#3178c6',
  rust: '#dea584', go: '#00ADD8', css: '#563d7c', html: '#e34c26',
  json: '#cbcb41', shell: '#89e051', ruby: '#701516', java: '#b07219',
  csharp: '#178600', php: '#4F5D95', swift: '#F05138', kotlin: '#A97BFF',
  sql: '#e38c00', xml: '#0060ac', plaintext: '#4a5568',
};

export function fileExt(filePath) {
  return filePath?.slice(filePath.lastIndexOf('.') + 1).toLowerCase() ?? '';
}

export function extLang(filePath) {
  return EXT_LANG[fileExt(filePath)] || 'plaintext';
}

export function basename(filePath) {
  return filePath?.slice(filePath.lastIndexOf('/') + 1) ?? '';
}

export default function CodeNode({ id, data, selected }) {
  const { filePath, onFilePicked, expanded, rootPath, onEditorFocus, onEditorBlur, peerColors, blameInfo, onAskAgent } = data;
  const [hasPendingDraft, setHasPendingDraft] = useState(() => filePath ? !!getDraft(filePath) : false);
  const writeTimer     = useRef(null);
  const lspChangeTimer = useRef(null);
  const editorRef      = useRef(null);
  const monacoRef      = useRef(null);
  const lspUriRef      = useRef(null);
  const unsubDiagRef   = useRef(null);
  const { theme } = usePrefs();
  const monacoTheme = theme === 'light' ? 'vs' : 'vs-dark';

  const lang      = filePath ? extLang(filePath) : 'plaintext';
  const langColor = LANG_COLOR[lang] || LANG_COLOR.plaintext;

  useEffect(() => {
    if (!filePath || !window.electronAPI) return;
    window.electronAPI.watchFile(filePath);
    return () => window.electronAPI.unwatchFile(filePath);
  }, [filePath]); // eslint-disable-line

  useEffect(() => {
    if (!filePath) return;
    return onAgentEvent(event => {
      if ((event.type === 'file-draft' && event.path === filePath) ||
          (event.type === 'draft-cleared' && event.path === filePath)) {
        setHasPendingDraft(!!getDraft(filePath));
      }
    });
  }, [filePath]);

  useEffect(() => {
    if (!expanded && editorRef.current) {
      // Monaco doesn't auto-shrink when its container gets smaller.
      // Reset layout so automaticLayout's ResizeObserver fires with the correct size.
      editorRef.current.layout({ width: 0, height: 0 });
    }
  }, [expanded]);

  useEffect(() => {
    return () => {
      clearTimeout(lspChangeTimer.current);
      clearTimeout(writeTimer.current);
      unsubDiagRef.current?.();
      if (lspUriRef.current) {
        lspClient.closeDocument(lspUriRef.current);
        const model = editorRef.current?.getModel();
        if (model) monacoRef.current?.editor.setModelMarkers(model, 'lsp', []);
      }
    };
  }, []); // eslint-disable-line

  async function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    if (!filePath) return;

    // Seed Y.Text from disk if needed, then bind Monaco ↔ Y.Text
    let diskContent = '';
    try { diskContent = await window.electronAPI?.readFile(filePath) ?? ''; } catch (_) {}
    const unbind = bindMonaco(filePath, editor, diskContent);

    // Disk write: Y.Text observer debounces → writeFile.
    // activeYText must follow room changes — initRoom() replaces the Y.Doc entirely.
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

    // LSP setup
    registerProviders(monaco, lang);
    const workspaceRoot = rootPath ?? filePath.slice(0, filePath.lastIndexOf('/'));
    const key = await lspClient.startServer(workspaceRoot, lang);
    if (key) {
      const uri = 'file://' + filePath;
      lspUriRef.current = uri;
      lspClient.openDocument(key, uri, lang, editor.getValue());
      editor.onDidChangeModelContent(() => {
        clearTimeout(lspChangeTimer.current);
        lspChangeTimer.current = setTimeout(() => {
          if (lspUriRef.current) lspClient.changeDocument(lspUriRef.current, editor.getValue());
        }, 200);
      });
      const unsubDiag = lspClient.onDiagnostics(uri, diags => {
        const model = editor.getModel();
        if (model) applyDiagnostics(monaco, model, diags);
      });
      unsubDiagRef.current = () => {
        unbind();
        activeYText.unobserve(onYChange);
        unsubDiskRoom();
        unsubDiag();
      };
    } else {
      unsubDiagRef.current = () => {
        unbind();
        activeYText.unobserve(onYChange);
        unsubDiskRoom();
      };
    }
  }

  return (
    <Node selected={selected} accentColor={langColor} className={expanded ? 'file-node--expanded' : ''} fillParent={!!expanded}>
      <div className="file-node-header">
        <span className="file-node-filename">{filePath ? basename(filePath) : 'File Node'}</span>
        {filePath && <span className="file-node-lang">{lang}</span>}
        <PeerDots colors={peerColors} />
        <BlameDot blameInfo={blameInfo} />
        {hasPendingDraft && (
          <span className="agent-draft-badge nodrag" title="Agent proposed changes">AI draft</span>
        )}
        {filePath && (
          <button className="toolbar-btn nodrag agent-ask-btn" title="Ask AI about this file" onClick={() => onAskAgent?.(filePath)}>
            ✦
          </button>
        )}
        {!filePath && (
          <button className="toolbar-btn nodrag" style={{ padding: '2px 8px', fontSize: 10, borderRadius: 4 }} onClick={() => onFilePicked?.(id)}>
            open file
          </button>
        )}
      </div>
      {hasPendingDraft && filePath && (
        <div className="agent-draft-bar nodrag">
          <span className="agent-draft-bar-label">◈ AI proposed changes</span>
          <button className="session-btn session-btn--primary" style={{ padding: '2px 10px', fontSize: 10 }}
            onClick={() => acceptDraft(filePath)}>accept</button>
          <button className="session-btn" style={{ padding: '2px 10px', fontSize: 10 }}
            onClick={() => rejectDraft(filePath)}>reject</button>
        </div>
      )}
      {filePath && <div className="file-node-path">{filePath}</div>}
      {filePath ? (
        <div className="file-code-container nodrag nowheel" style={expanded ? undefined : { height: 300 }} onFocus={() => onEditorFocus?.(id)} onBlur={onEditorBlur}>
          <Editor
            height={expanded ? '100%' : '300px'}
            path={'file://' + filePath}
            language={lang}
            theme={monacoTheme}
            onMount={handleEditorMount}
            options={{
              fontSize: 11, fontFamily: 'var(--mono)', minimap: { enabled: false },
              lineNumbers: 'on', folding: false, lineDecorationsWidth: 6,
              lineNumbersMinChars: 2, wordWrap: 'on', scrollBeyondLastLine: false,
              automaticLayout: true, padding: { top: 6, bottom: 6 },
              scrollbar: { vertical: 'visible', horizontal: 'hidden', verticalScrollbarSize: 8 },
            }}
          />
        </div>
      ) : (
        <div className="file-node-placeholder nodrag">
          <button className="toolbar-btn" style={{ border: '1px dashed var(--border)', borderRadius: 6 }} onClick={() => onFilePicked?.(id)}>
            Pick a file…
          </button>
        </div>
      )}
    </Node>
  );
}
