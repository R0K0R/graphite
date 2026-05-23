import { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { usePrefs } from '../ThemeContext.js';

const EXT_LANG = {
  py: 'python', js: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', json: 'json',
  md: 'markdown', sh: 'shell', css: 'css', html: 'html',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', rs: 'rust',
  go: 'go', rb: 'ruby', java: 'java', c: 'c', cpp: 'cpp',
};

const LANG_COLOR = {
  python: '#3572A5', javascript: '#f1e05a', typescript: '#3178c6',
  rust: '#dea584', go: '#00ADD8', css: '#563d7c', html: '#e34c26',
  json: '#cbcb41', markdown: '#083fa1', shell: '#89e051',
  plaintext: '#4a5568',
};

function ext(filePath) {
  return filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
}

function extLang(filePath) {
  return EXT_LANG[ext(filePath)] || 'plaintext';
}

function basename(filePath) {
  return filePath.slice(filePath.lastIndexOf('/') + 1);
}

export default function FileNode({ id, data, selected }) {
  const { filePath, content, externalChange, _diskContent, onContentChange, onFilePicked } = data;
  const writeTimer = useRef(null);
  const { theme } = usePrefs();
  const monacoTheme = theme === 'light' ? 'vs' : 'vs-dark';

  const lang = filePath ? extLang(filePath) : 'plaintext';
  const langColor = LANG_COLOR[lang] || LANG_COLOR.plaintext;

  useEffect(() => {
    if (!filePath || !window.electronAPI) return;
    window.electronAPI.readFile(filePath).then(c => {
      onContentChange?.(id, c);
    });
    window.electronAPI.watchFile(filePath);
    return () => { window.electronAPI.unwatchFile(filePath); };
  }, [filePath]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(val) {
    if (!filePath) return;
    onContentChange?.(id, val ?? '');
    clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      window.electronAPI?.writeFile(filePath, val ?? '');
    }, 500);
  }

  function handleReloadFromDisk() {
    if (_diskContent != null) onContentChange?.(id, _diskContent);
  }

  return (
    <div
      className={`file-node${selected ? ' file-node--selected' : ''}`}
      style={{ borderLeftColor: langColor }}
    >
      <div className="file-node-header">
        <span className="file-node-filename">
          {filePath ? basename(filePath) : 'File Node'}
        </span>
        {filePath && <span className="file-node-lang">{lang}</span>}
        {!filePath && (
          <button
            className="toolbar-btn nodrag"
            style={{ padding: '2px 8px', fontSize: 10, borderRadius: 4 }}
            onClick={() => onFilePicked?.(id)}
          >
            Open File
          </button>
        )}
      </div>

      {filePath && (
        <div className="file-node-path">{filePath}</div>
      )}

      {externalChange && (
        <div className="file-node-external-banner nodrag" onClick={handleReloadFromDisk}>
          File changed on disk — click to reload
        </div>
      )}

      {filePath ? (
        <div className="file-code-container nodrag nowheel" style={{ height: 300 }}>
          <Editor
            height="300px"
            language={lang}
            theme={monacoTheme}
            value={content}
            onChange={handleChange}
            options={{
              fontSize: 11,
              fontFamily: 'var(--mono)',
              minimap: { enabled: false },
              lineNumbers: 'on',
              folding: false,
              lineDecorationsWidth: 6,
              lineNumbersMinChars: 2,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 6, bottom: 6 },
              scrollbar: { vertical: 'visible', horizontal: 'hidden', verticalScrollbarSize: 8 },
            }}
          />
        </div>
      ) : (
        <div className="file-node-placeholder nodrag">
          <button
            className="toolbar-btn"
            style={{ border: '1px dashed var(--border)', borderRadius: 6 }}
            onClick={() => onFilePicked?.(id)}
          >
            Pick a file…
          </button>
        </div>
      )}
    </div>
  );
}
