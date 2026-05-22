import { Handle, Position } from 'reactflow';
import { CATEGORIES, TYPE_COLORS, handleLeft } from '../data/modules';

const RETENTION_BADGE = {
  permanent: { label: '♾ perm', color: '#8b5cf6' },
  bulky:     { label: '📦 bulky', color: '#f59e0b' },
  standard:  { label: '≈ std', color: '#6b7280' },
  ephemeral: { label: '⚡ fast', color: '#10b981' },
};

export default function ChaperonNode({ data, selected }) {
  const { module: mod, status = 'idle', progress, missingInputs = [], typeErrInputs = [] } = data;
  if (!mod) {
    return (
      <div className="chap-node" style={{ padding: 12, color: '#ef4444', fontSize: 11 }}>
        invalid node ({data.varName || 'unnamed'})
      </div>
    );
  }
  const cat = CATEGORIES[mod.category] || { color: '#6b7280' };
  const ret = RETENTION_BADGE[mod.retention] || RETENTION_BADGE.standard;
  const hasError = missingInputs.length > 0 || typeErrInputs.length > 0;

  return (
    <div
      className={`chap-node status-${status}${selected ? ' chap-node--selected' : ''}${hasError ? ' chap-node--error' : ''}`}
      style={{ '--cat': cat.color }}
    >
      {mod.inputs.map((inp, i) => {
        const isMissing = missingInputs.includes(inp.id);
        const isTypeErr = typeErrInputs.includes(inp.id);
        return (
          <Handle
            key={inp.id}
            type="target"
            position={Position.Top}
            id={inp.id}
            title={`${inp.id}: ${inp.type}`}
            style={{
              left: handleLeft(i, mod.inputs.length),
              background: isMissing ? '#ef4444' : isTypeErr ? '#f59e0b' : (TYPE_COLORS[inp.type] || '#6b7280'),
              width: 9,
              height: 9,
              border: isMissing ? '2px solid #fca5a5' : '2px solid #0d1117',
            }}
          />
        );
      })}

      {mod.inputs.length > 0 && (
        <div className="chap-labels chap-labels--top">
          {mod.inputs.map((inp) => (
            <span key={inp.id} className="chap-label" style={{ color: TYPE_COLORS[inp.type] || '#6b7280' }}>
              {inp.id}
            </span>
          ))}
        </div>
      )}

      {mod.inputs.length > 0 && <div className="chap-rule" />}

      <div className="chap-header">
        <span className="chap-name" style={{ color: cat.color }}>{mod.label}</span>
        <StatusDot status={status} />
      </div>

      <div className="chap-body">
        {status === 'idle' && (
          <div className="chap-meta">
            {mod.resources.gpu > 0 && <span className="chap-badge chap-badge--gpu">GPU</span>}
            <span className="chap-badge">{mod.resources.memory_gb} GB</span>
            <span className="chap-badge" style={{ color: ret.color }}>{ret.label}</span>
          </div>
        )}
        {status === 'running' && progress && (
          <div className="chap-progress-wrap">
            <div className="chap-progress-track">
              <div
                className="chap-progress-fill"
                style={{ width: `${(progress.current / progress.total) * 100}%`, background: cat.color }}
              />
            </div>
            <span className="chap-progress-label">{progress.current}/{progress.total}</span>
          </div>
        )}
        {status === 'done' && (
          <div className="chap-status-row">
            <span style={{ color: '#10b981', fontSize: 10 }}>complete</span>
          </div>
        )}
      </div>

      {mod.outputs.length > 0 && <div className="chap-rule" />}

      {mod.outputs.length > 0 && (
        <div className="chap-labels chap-labels--bottom">
          {mod.outputs.map((out) => (
            <span key={out.id} className="chap-label" style={{ color: TYPE_COLORS[out.type] || '#6b7280' }}>
              {out.id}
            </span>
          ))}
        </div>
      )}

      {mod.outputs.map((out, i) => (
        <Handle
          key={out.id}
          type="source"
          position={Position.Bottom}
          id={out.id}
          title={`${out.id}: ${out.type}`}
          style={{
            left: handleLeft(i, mod.outputs.length),
            background: TYPE_COLORS[out.type] || '#6b7280',
            width: 9,
            height: 9,
            border: '2px solid #0d1117',
          }}
        />
      ))}
    </div>
  );
}

function StatusDot({ status }) {
  const colors = {
    idle: '#334155',
    running: '#3b82f6',
    done: '#10b981',
  };
  return (
    <span
      className={`chap-status-dot${status === 'running' ? ' chap-status-dot--pulse' : ''}`}
      style={{ background: colors[status] || '#334155' }}
    />
  );
}
