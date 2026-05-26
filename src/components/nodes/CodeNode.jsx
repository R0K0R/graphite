import { useEffect, useRef, useState } from 'react';
import { onAgentEvent, getDraft } from '../../agent/agentBridge.js';
import { acceptDraft, rejectDraft } from '../../agent/applyDraft.js';
import UnifiedDiff from '../UnifiedDiff.jsx';
import Editor from '@monaco-editor/react';
import { usePrefs } from '../../ThemeContext.js';
import * as lspClient from '../../lsp/LspClient.js';
import { startWatchdog } from '../../lsp/watchdog.js';
import { registerProviders, applyDiagnostics, initBlameProvider } from '../../lsp/monacoProviders.js';
import { setBlame, clearBlame } from '../../vcs/blameCache.js';
import { bindMonaco } from '../../crdt/monacoBinding.js';
import { getYText, onRoomChange } from '../../crdt/doc.js';
import { parseDeps, setDeps, clearDeps, getDeps, setRefCount } from '../../lsp/depGraph.js';
import Node, { PeerDots, BlameDot } from './Node.jsx';

const KIND_LABEL = { 5:'cls', 6:'mth', 9:'ctor', 10:'enum', 11:'iface', 12:'fn', 13:'var', 14:'const' };
const TOP_KINDS  = new Set([5, 6, 9, 10, 11, 12, 13, 14]);

function flattenSymbols(syms, out = []) {
  for (const s of syms ?? []) { out.push(s); if (s.children) flattenSymbols(s.children, out); }
  return out;
}

function countOccurrences(content, names) {
  if (!names.length) return 0;
  const re = new RegExp(`\\b(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');
  return (content.match(re) ?? []).length;
}

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
  const { filePath, onFilePicked, expanded, rootPath, hasGit, onEditorFocus, onEditorBlur, peerColors, blameInfo, onAskAgent, onSymbolDetach } = data;
  const { watchdogEnabled, watchdogModel } = usePrefs();
  const getPrefs = useRef(() => ({ watchdogEnabled, watchdogModel }));
  getPrefs.current = () => ({ watchdogEnabled, watchdogModel });
  const [pendingDraft, setPendingDraft] = useState(() => filePath ? getDraft(filePath) : null);
  const [lspShadowStatus, setLspShadowStatus] = useState('clean');
  const [symbols, setSymbols] = useState([]);
  const hasPendingDraft = !!pendingDraft;
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
        setPendingDraft(getDraft(filePath));
      }
    });
  }, [filePath]);

  // Fetch git blame for this file and populate the shared blame cache
  useEffect(() => {
    if (!filePath || !rootPath || !hasGit || !window.electronAPI?.vcsGitBlameFile) return;
    const uri = 'file://' + filePath;
    window.electronAPI.vcsGitBlameFile(rootPath, filePath).then(lines => {
      if (lines) setBlame(uri, lines);
    });
    return () => clearBlame(uri);
  }, [filePath, rootPath, hasGit]);

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

    // LSP + blame hover setup
    registerProviders(monaco, lang);
    initBlameProvider(monaco);
    const workspaceRoot = rootPath ?? filePath.slice(0, filePath.lastIndexOf('/'));
    const key = await lspClient.startServer(workspaceRoot, lang);
    if (key) {
      const uri = 'file://' + filePath;
      lspUriRef.current = uri;
      lspClient.openDocument(key, uri, lang, editor.getValue());

      // Dependency graph — static parse immediately, LSP-refined async
      const refreshDeps = () => {
        const staticDeps = parseDeps(filePath, editor.getValue(), lang).map(p => 'file://' + p);
        setDeps(uri, staticDeps);
        lspClient.getDocumentLinks(uri).then(links => {
          const resolved = (links ?? []).map(l => l.target).filter(t => t?.startsWith('file://'));
          if (resolved.length) setDeps(uri, resolved);
        });
      };
      refreshDeps();

      const refreshSymbols = () => {
        lspClient.getDocumentSymbols(uri).then(syms => {
          if (!syms) return;
          const flat = flattenSymbols(syms);
          setSymbols(flat.filter(s => TOP_KINDS.has(s.kind)).slice(0, 10));
          const srcContent = editor.getValue();
          getDeps(uri).forEach(tgtUri => {
            lspClient.getDocumentSymbols(tgtUri).then(tgtSyms => {
              if (!tgtSyms) return;
              const names = flattenSymbols(tgtSyms).map(s => s.name).filter(Boolean);
              const count = countOccurrences(srcContent, names);
              setRefCount(uri, tgtUri, count);
            });
          });
        });
      };
      refreshSymbols();

      const watchdog = startWatchdog(uri, editor, monaco, lang, workspaceRoot, setLspShadowStatus, getPrefs.current);
      let depTimer = null;
      let symTimer = null;
      editor.onDidChangeModelContent(() => {
        clearTimeout(lspChangeTimer.current);
        lspChangeTimer.current = setTimeout(() => {
          if (lspUriRef.current) {
            lspClient.changeDocument(lspUriRef.current, editor.getValue());
            watchdog.tick();
          }
        }, 200);
        clearTimeout(depTimer);
        depTimer = setTimeout(refreshDeps, 2000);
        clearTimeout(symTimer);
        symTimer = setTimeout(refreshSymbols, 3000);
      });
      const unsubDiag = lspClient.onDiagnostics(uri, diags => {
        const model = editor.getModel();
        if (model) applyDiagnostics(monaco, model, diags);
        watchdog.tick();
      });
      unsubDiagRef.current = () => {
        watchdog.teardown();
        clearDeps('file://' + filePath);
        clearTimeout(depTimer);
        clearTimeout(symTimer);
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
        {(lspShadowStatus === 'repairing' || lspShadowStatus === 'shadowed') && (
          <span className="lsp-shadow-badge nodrag" title={lspShadowStatus === 'repairing' ? 'LSP repairing…' : 'LSP using shadow'}>
            {lspShadowStatus === 'repairing' ? '◌' : '◈'}
          </span>
        )}
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
        <div className="agent-draft-bar nodrag" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px' }}>
            <span className="agent-draft-bar-label">◈ AI proposed changes</span>
            <button className="session-btn session-btn--primary" style={{ padding: '2px 10px', fontSize: 10 }}
              onClick={() => { acceptDraft(filePath); setPendingDraft(null); }}>accept</button>
            <button className="session-btn" style={{ padding: '2px 10px', fontSize: 10 }}
              onClick={() => { rejectDraft(filePath); setPendingDraft(null); }}>reject</button>
          </div>
          {pendingDraft && (
            <div className="agent-draft-diff">
              <UnifiedDiff oldText={pendingDraft.oldContent} newText={pendingDraft.newContent} maxLines={80} />
            </div>
          )}
        </div>
      )}
      {symbols.length > 0 && (
        <div className="symbol-chips nodrag">
          {symbols.map(sym => (
            <span
              key={sym.name + sym.kind}
              className="symbol-chip nodrag"
              title={sym.detail || sym.name}
              onClick={e => {
                e.stopPropagation();
                const loc = sym.selectionRange ?? sym.range;
                console.log('[chip click]', sym.name, 'loc:', loc, 'editor:', editorRef.current);
                if (!loc) return;
                editorRef.current?.revealLineInCenter(loc.start.line + 1);
                editorRef.current?.setPosition({ lineNumber: loc.start.line + 1, column: loc.start.character + 1 });
                editorRef.current?.focus();
              }}
            >
              <span className="symbol-chip-kind">{KIND_LABEL[sym.kind] ?? 'sym'}</span>
              {sym.name}
              {onSymbolDetach && (
                <button className="symbol-chip-pin nodrag" title="Pin to canvas" onClick={e => { e.stopPropagation(); onSymbolDetach(sym); }}>↗</button>
              )}
            </span>
          ))}
        </div>
      )}
      {filePath && <div className="file-node-path">{filePath}</div>}
      {filePath ? (
        <div className="file-code-container nodrag nowheel" style={expanded ? undefined : { height: 300 }} onFocus={() => onEditorFocus?.(id)} onBlur={onEditorBlur}>
          <Editor
            key={filePath}
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
