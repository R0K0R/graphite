import Editor from '@monaco-editor/react';
import { CATEGORIES } from '../data/modules';

export default function ChaperonNode({ data, selected }) {
  const { module: mod } = data;
  if (!mod) {
    return (
      <div className="chap-node" style={{ padding: 12, color: '#ef4444', fontSize: 11 }}>
        invalid node ({data.varName || 'unnamed'})
      </div>
    );
  }
  const cat = CATEGORIES[mod.category] || { color: '#6b7280' };

  const codeParam = mod.params.find((p) => p.type === 'Text.Code');
  const hasCodeEditor = !!codeParam;

  return (
    <div
      className={`chap-node${selected ? ' chap-node--selected' : ''}${hasCodeEditor ? ' chap-node--has-editor' : ''}`}
      style={{ '--cat': cat.color }}
    >
      <div className="chap-header">
        <span className="chap-name" style={{ color: cat.color }}>{mod.label}</span>
      </div>

      <div className="chap-body chap-body--column">
        {hasCodeEditor && (
          <div className="chap-code-container nodrag nowheel">
            <Editor
              height="260px"
              language="python"
              theme="vs-dark"
              value={data.params[codeParam.id] ?? codeParam.default}
              onChange={(val) => {
                if (data.onChangeParam) {
                  data.onChangeParam(data.varName, codeParam.id, val);
                }
              }}
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
                scrollbar: {
                  vertical: 'visible',
                  horizontal: 'hidden',
                  verticalScrollbarSize: 8,
                },
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

