import { useState, useRef } from 'react';

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function BranchBar({
  hasGit, branches, currentBranch, isDirty, gitLog,
  onCommit, onCreateBranch, onCheckout, onShowDiff,
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCommitInput, setShowCommitInput] = useState(false);
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [hoveredCommit, setHoveredCommit] = useState(null);
  const commitInputRef = useRef(null);
  const newBranchRef  = useRef(null);

  if (!hasGit) return null;

  async function handleCommit(e) {
    e.preventDefault();
    if (!commitMsg.trim()) return;
    await onCommit(commitMsg.trim());
    setCommitMsg('');
    setShowCommitInput(false);
  }

  async function handleCreateBranch(e) {
    e.preventDefault();
    const name = newBranchName.trim();
    if (!name) return;
    await onCreateBranch(name);
    setNewBranchName('');
    setShowNewBranch(false);
  }

  const recentCommits = gitLog.slice(0, 5);

  return (
    <div className="branch-bar">

      {/* Branch selector */}
      <div className="branch-selector" onClick={() => setShowDropdown(s => !s)}>
        <div className="branch-dot" />
        <span className="branch-name">{currentBranch ?? '—'}</span>
        <span className="branch-caret">▾</span>
      </div>

      {showDropdown && (
        <div className="branch-dropdown" onClick={e => e.stopPropagation()}>
          {branches.map(b => (
            <div
              key={b}
              className={`branch-dropdown-item${b === currentBranch ? ' active' : ''}`}
              onClick={() => { onCheckout(b); setShowDropdown(false); }}
            >
              <div className="branch-dot" style={{ opacity: b === currentBranch ? 1 : 0.4 }} />
              {b}
            </div>
          ))}
          {showNewBranch ? (
            <form className="branch-new-form" onSubmit={handleCreateBranch}>
              <input
                ref={newBranchRef}
                className="branch-input"
                value={newBranchName}
                onChange={e => setNewBranchName(e.target.value)}
                placeholder="branch name…"
                autoFocus
                onBlur={() => { if (!newBranchName) setShowNewBranch(false); }}
              />
              <button type="submit" className="branch-btn" disabled={!newBranchName.trim()}>create</button>
            </form>
          ) : (
            <div className="branch-dropdown-item" style={{ opacity: 0.6 }} onClick={() => setShowNewBranch(true)}>
              + new branch
            </div>
          )}
        </div>
      )}

      <div className="branch-bar-sep" />

      {/* Dirty indicator */}
      {isDirty && (
        <div className="branch-dirty-badge" title="Uncommitted changes">
          ● uncommitted
        </div>
      )}

      {/* Commit history dots */}
      {recentCommits.length > 0 && (
        <div className="branch-history-dots">
          {recentCommits.map(c => (
            <div
              key={c.hash}
              className={`branch-history-dot${hoveredCommit === c.hash ? ' hovered' : ''}`}
              title={`${c.shortHash} · ${c.author} · ${c.message} · ${timeAgo(c.timestamp)}`}
              onMouseEnter={() => setHoveredCommit(c.hash)}
              onMouseLeave={() => setHoveredCommit(null)}
            />
          ))}
        </div>
      )}

      <div className="branch-bar-spacer" />

      {/* Actions */}
      {!showCommitInput ? (
        <>
          <button
            className="branch-action-btn"
            onClick={() => onShowDiff(gitLog[0]?.hash ?? null)}
            disabled={!gitLog.length}
            title="Diff current canvas vs. last commit"
          >
            diff
          </button>
          <button
            className={`branch-action-btn${isDirty ? ' primary' : ''}`}
            onClick={() => { setShowCommitInput(true); setTimeout(() => commitInputRef.current?.focus(), 50); }}
          >
            commit…
          </button>
        </>
      ) : (
        <form className="branch-commit-form" onSubmit={handleCommit}>
          <input
            ref={commitInputRef}
            className="branch-input"
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            placeholder="commit message…"
            onKeyDown={e => { if (e.key === 'Escape') { setShowCommitInput(false); setCommitMsg(''); } }}
          />
          <button type="submit" className="branch-btn branch-btn--primary" disabled={!commitMsg.trim()}>
            ↑ commit
          </button>
          <button type="button" className="branch-btn" onClick={() => { setShowCommitInput(false); setCommitMsg(''); }}>
            ✕
          </button>
        </form>
      )}
    </div>
  );
}
