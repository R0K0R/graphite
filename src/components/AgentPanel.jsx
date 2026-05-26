import { useState, useEffect, useRef } from 'react';
import { useAgent } from '../agent/useAgent.js';
import { acceptDraft, rejectDraft } from '../agent/applyDraft.js';
import { hasDraft } from '../agent/agentBridge.js';

const PROVIDERS = ['anthropic', 'openai', 'gemini', 'ollama'];

export default function AgentPanel({ open, onClose, rootPath, scopedFilePath }) {
  const { messages, isRunning, run, stop, clear } = useAgent();
  const [prompt, setPrompt]         = useState('');
  const [provider, setProvider]     = useState('anthropic');
  const [model, setModel]           = useState('');
  const [models, setModels]         = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [agentConfig, setAgentConfig]   = useState({});
  const [configDraft, setConfigDraft]   = useState({});
  const threadRef = useRef(null);
  const inputRef  = useRef(null);

  // Load config on open
  useEffect(() => {
    if (!open || !rootPath || !window.electronAPI) return;
    window.electronAPI.graphiteReadConfig(rootPath).then(cfg => {
      const ac = cfg.agent ?? {};
      setAgentConfig(ac);
      setConfigDraft(ac);
      setProvider(ac.provider ?? 'anthropic');
      setModel(ac.model ?? '');
    });
  }, [open, rootPath]);

  // Fetch model list when provider changes
  useEffect(() => {
    if (!open || !window.electronAPI) return;
    window.electronAPI.agentListModels({ ...agentConfig, provider }).then(list => {
      setModels(list);
      if (list.length && !list.includes(model)) setModel(list[0]);
    });
  }, [open, provider, agentConfig.ollamaBaseUrl]); // eslint-disable-line

  // Auto-scroll thread
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages]);

  if (!open) return null;

  async function saveConfig(patch) {
    const next = { ...agentConfig, ...patch };
    setAgentConfig(next);
    if (!rootPath || !window.electronAPI) return;
    const cfg = await window.electronAPI.graphiteReadConfig(rootPath);
    await window.electronAPI.graphiteWriteConfig(rootPath, { ...cfg, agent: next });
  }

  function handleProviderChange(p) {
    setProvider(p);
    saveConfig({ provider: p });
  }

  function handleModelChange(m) {
    setModel(m);
    saveConfig({ model: m });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || isRunning) return;
    setPrompt('');
    run(text, {
      rootPath,
      filePaths: scopedFilePath ? [scopedFilePath] : [],
      agentConfig: { ...agentConfig, provider, model },
    });
  }

  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(e);
  }

  return (
    <div className="session-overlay" onClick={onClose}>
      <div className="agent-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="session-header">
          <div className="session-title" style={{ gap: 8 }}>
            <div className={`session-title-live${isRunning ? ' is-live' : ''}`} />
            agent
            {scopedFilePath && (
              <span className="agent-scope-badge">{scopedFilePath.split('/').pop()}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="session-btn" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setShowSettings(s => !s)}>
              {showSettings ? 'done' : 'settings'}
            </button>
            {messages.length > 0 && !isRunning && (
              <button className="session-btn" style={{ padding: '2px 8px', fontSize: 10 }} onClick={clear}>clear</button>
            )}
            <button className="session-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Provider / model row */}
        {!showSettings && (
          <div className="agent-model-row">
            <select className="agent-select" value={provider} onChange={e => handleProviderChange(e.target.value)}>
              {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="agent-select" value={model} onChange={e => handleModelChange(e.target.value)}
              disabled={models.length === 0}>
              {models.length === 0 && <option value="">— no models —</option>}
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}

        {/* Settings panel */}
        {showSettings && (
          <div className="agent-settings">
            {provider === 'anthropic' && (
              <AgentConfigRow label="Anthropic API key" type="password"
                value={configDraft.anthropicApiKey ?? ''}
                onChange={v => setConfigDraft(d => ({ ...d, anthropicApiKey: v }))}
                onBlur={() => saveConfig({ anthropicApiKey: configDraft.anthropicApiKey })} />
            )}
            {provider === 'openai' && <>
              <AgentConfigRow label="OpenAI API key" type="password"
                value={configDraft.openaiApiKey ?? ''}
                onChange={v => setConfigDraft(d => ({ ...d, openaiApiKey: v }))}
                onBlur={() => saveConfig({ openaiApiKey: configDraft.openaiApiKey })} />
              <AgentConfigRow label="Base URL"
                value={configDraft.openaiBaseUrl ?? ''}
                placeholder="https://api.openai.com/v1"
                onChange={v => setConfigDraft(d => ({ ...d, openaiBaseUrl: v }))}
                onBlur={() => saveConfig({ openaiBaseUrl: configDraft.openaiBaseUrl })} />
            </>}
            {provider === 'gemini' && (
              <AgentConfigRow label="Gemini API key" type="password"
                value={configDraft.geminiApiKey ?? ''}
                onChange={v => setConfigDraft(d => ({ ...d, geminiApiKey: v }))}
                onBlur={() => saveConfig({ geminiApiKey: configDraft.geminiApiKey })} />
            )}
            {provider === 'ollama' && (
              <AgentConfigRow label="Ollama base URL"
                value={configDraft.ollamaBaseUrl ?? ''}
                placeholder="http://localhost:11434"
                onChange={v => setConfigDraft(d => ({ ...d, ollamaBaseUrl: v }))}
                onBlur={() => saveConfig({ ollamaBaseUrl: configDraft.ollamaBaseUrl })} />
            )}
            <p className="session-hint" style={{ marginTop: 4 }}>
              Settings saved to <code>.graphite/config.json</code> — never committed to git.
            </p>
          </div>
        )}

        {/* Message thread */}
        <div className="agent-thread" ref={threadRef}>
          {messages.length === 0 && (
            <p className="agent-empty">Ask the agent to read, edit, or create files in your project.</p>
          )}
          {messages.map((msg, i) => <AgentMessage key={i} msg={msg} />)}
          {isRunning && <div className="agent-thinking"><span /><span /><span /></div>}
        </div>

        {/* Input */}
        <form className="agent-input-row" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            className="agent-textarea"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRunning ? 'agent is running…' : 'Ask the agent… (⌘Enter to send)'}
            disabled={isRunning}
            rows={3}
          />
          <div className="agent-input-actions">
            {isRunning
              ? <button type="button" className="session-btn" onClick={stop}>stop</button>
              : <button type="submit" className="session-btn session-btn--primary" disabled={!prompt.trim()}>send</button>
            }
          </div>
        </form>

      </div>
    </div>
  );
}

function AgentConfigRow({ label, value, onChange, onBlur, type = 'text', placeholder = '' }) {
  return (
    <div className="agent-config-row">
      <span className="agent-config-label">{label}</span>
      <input
        className="session-input-sm" style={{ flex: 1 }}
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}

function AgentMessage({ msg }) {
  const [collapsed, setCollapsed] = useState(true);
  const [draftAccepted, setDraftAccepted] = useState(false);

  if (msg.role === 'user') {
    return <div className="agent-msg agent-msg--user">{msg.content}</div>;
  }

  if (msg.kind === 'text') {
    return <div className="agent-msg agent-msg--assistant">{msg.content}</div>;
  }

  if (msg.kind === 'tool') {
    return (
      <div className="agent-tool-card" onClick={() => setCollapsed(c => !c)}>
        <div className="agent-tool-header">
          <span className="agent-tool-icon">{msg.result === null ? '⟳' : '✓'}</span>
          <span className="agent-tool-name">{msg.name}</span>
          <span className="agent-tool-toggle">{collapsed ? '▸' : '▾'}</span>
        </div>
        {!collapsed && (
          <div className="agent-tool-body">
            <pre className="agent-tool-pre">{JSON.stringify(msg.input, null, 2)}</pre>
            {msg.result !== null && (
              <pre className="agent-tool-pre agent-tool-result">{
                typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result, null, 2)
              }</pre>
            )}
          </div>
        )}
      </div>
    );
  }

  if (msg.kind === 'file-draft') {
    if (draftAccepted) {
      return (
        <div className="agent-draft-card agent-draft-card--done">
          <span>✓ applied to <code>{msg.path.split('/').pop()}</code></span>
        </div>
      );
    }
    const stillPending = hasDraft(msg.path);
    return (
      <div className="agent-draft-card">
        <div className="agent-draft-header">
          <span className="agent-draft-icon">◈</span>
          <span className="agent-draft-filename">{msg.path.split('/').pop()}</span>
          <span className="agent-draft-label">proposed edit</span>
        </div>
        <div className="agent-draft-hint">Review the diff overlay on the file node, then:</div>
        <div className="agent-draft-actions">
          <button className="session-btn session-btn--primary" onClick={() => { acceptDraft(msg.path); setDraftAccepted(true); }}>
            ✓ accept
          </button>
          <button className="session-btn" onClick={() => { rejectDraft(msg.path); setDraftAccepted(true); }}>
            ✕ reject
          </button>
        </div>
        {!stillPending && !draftAccepted && (
          <p className="session-hint" style={{ margin: '4px 0 0' }}>Draft was already applied or rejected.</p>
        )}
      </div>
    );
  }

  if (msg.kind === 'canvas-action') {
    return (
      <div className="agent-tool-card">
        <div className="agent-tool-header">
          <span className="agent-tool-icon">✓</span>
          <span className="agent-tool-name">
            {msg.action.type === 'create' ? `created ${msg.action.nodeType} node` : `deleted node ${msg.action.id}`}
          </span>
        </div>
      </div>
    );
  }

  if (msg.kind === 'error') {
    return <div className="agent-msg agent-msg--error">Error: {msg.message}</div>;
  }

  return null;
}
