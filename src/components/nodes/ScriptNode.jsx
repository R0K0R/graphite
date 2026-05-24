import Editor from '@monaco-editor/react';
import { CATEGORIES } from '../../data/modules.js';
import { usePrefs } from '../../ThemeContext.js';
import Node from './Node.jsx';

export default function ScriptNode({ data, selected }) {
  const { module: mod } = data;
  const { theme } = usePrefs();
  const monacoTheme = theme === 'light' ? 'vs' : 'vs-dark';

  if (!mod) {
    return (
      <Node selected={selected} baseClass="chap-node">
        <div style={{ padding: 12, color: '#ef4444', fontSize: 11 }}>
          invalid node ({data.varName || 'unnamed'})
        </div>
      </Node>
    );
  }

  const cat = CATEGORIES[mod.category] || { color: '#6b7280' };
  const codeParam = mod.params.find(p => p.type === 'Text.Code');

  return (
    <Node selected={selected} baseClass="chap-node" className={codeParam ? 'chap-node--has-editor' : ''}>
      <div className="chap-header">
        <span className="chap-name" style={{ color: cat.color }}>{mod.label}</span>
      </div>
      <div className="chap-body chap-body--column">
        {codeParam && (
          <div className="chap-code-container nodrag nowheel">
            <Editor
              height="260px"
              language="python"
              theme={monacoTheme}
              value={data.params[codeParam.id] ?? codeParam.default}
              onChange={val => data.onChangeParam?.(data.varName, codeParam.id, val)}
              options={{
                fontSize: 11, fontFamily: 'var(--mono)',
                minimap: { enabled: false }, lineNumbers: 'on', folding: false,
                lineDecorationsWidth: 6, lineNumbersMinChars: 2, wordWrap: 'on',
                scrollBeyondLastLine: false, automaticLayout: true,
                padding: { top: 6, bottom: 6 },
                scrollbar: { vertical: 'visible', horizontal: 'hidden', verticalScrollbarSize: 8 },
              }}
            />
          </div>
        )}
      </div>
    </Node>
  );
}
import Editor from '@monaco-editor/react';
import { CATEGORIES } from '../../data/modules.js';
import { usePrefs } from '../../ThemeContext.js';
import Node from './Node.jsx';

export default function ScriptNode({ data, selected }) {
  const { module: mod } = data;
  const { theme } = usePrefs();
  const monacoTheme = theme === 'light' ? 'vs' : 'vs-dark';

  if (!mod) {
    return (
      <Node selected={selected} baseClass="chap-node">
        <div style={{ padding: 12, color: '#ef4444', fontSize: 11 }}>
          invalid node ({data.varName || 'unnamed'})
        </div>
      </Node>
    );
  }

  const cat = CATEGORIES[mod.category] || { color: '#6b7280' };
  const codeParam = mod.params.find(p => p.type === 'Text.Code');

  return (
    <Node selected={selected} baseClass="chap-node" className={codeParam ? 'chap-node--has-editor' : ''}>
      <div className="chap-header">
        <span className="chap-name" style={{ color: cat.color }}>{mod.label}</span>
      </div>
      <div className="chap-body chap-body--column">
        {codeParam && (
          <div className="chap-code-container nodrag nowheel">
            <Editor
              height="260px"
              language="python"
              theme={monacoTheme}
              value={data.params[codeParam.id] ?? codeParam.default}
              onChange={val => data.onChangeParam?.(data.varName, codeParam.id, val)}
              options={{
                fontSize: 11, fontFamily: 'var(--mono)',
                minimap: { enabled: false }, lineNumbers: 'on', folding: false,
                lineDecorationsWidth: 6, lineNumbersMinChars: 2, wordWrap: 'on',
                scrollBeyondLastLine: false, automaticLayout: true,
                padding: { top: 6, bottom: 6 },
                scrollbar: { vertical: 'visible', horizontal: 'hidden', verticalScrollbarSize: 8 },
              }}
            />
          </div>
        )}
      </div>
    </Node>
  );
}
