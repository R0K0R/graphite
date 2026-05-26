import { Panel } from 'reactflow';

export default function MergePanel({ mergeMode, onFinalize, onAbort }) {
  if (!mergeMode) return null;

  const { sourceBranch, conflicts, theirAdded, theirRemoved, fileConflicts, resolutions, isTwoWay } = mergeMode;

  const unresolvedConflicts = [...conflicts.keys()].filter(id => !resolutions.has(id));
  const pendingAdditions    = theirAdded.filter(n => !resolutions.has(n.id));
  const canFinalize         = unresolvedConflicts.length === 0 && pendingAdditions.length === 0;

  return (
    <Panel position="top-right" className="merge-panel">
      <div className="merge-panel-title">
        Merging <span className="merge-panel-branch">{sourceBranch}</span>
      </div>

      {isTwoWay && (
        <div className="merge-panel-notice">
          No shared canvas snapshot — showing additive differences only
        </div>
      )}

      <div className="merge-panel-stats">
        {unresolvedConflicts.length > 0 && (
          <span className="merge-stat merge-stat--conflict">
            ⚡ {unresolvedConflicts.length} conflict{unresolvedConflicts.length !== 1 ? 's' : ''}
          </span>
        )}
        {pendingAdditions.length > 0 && (
          <span className="merge-stat merge-stat--added">
            + {pendingAdditions.length} addition{pendingAdditions.length !== 1 ? 's' : ''}
          </span>
        )}
        {theirRemoved.length > 0 && (
          <span className="merge-stat merge-stat--removed">
            − {theirRemoved.length} they deleted
          </span>
        )}
        {canFinalize && conflicts.size === 0 && theirAdded.length === 0 && (
          <span className="merge-stat" style={{ opacity: 0.5 }}>no canvas changes</span>
        )}
      </div>

      {fileConflicts.length > 0 && (
        <div className="merge-file-conflicts">
          <div className="merge-file-conflicts-label">File conflicts — resolve in editor:</div>
          {fileConflicts.map(f => (
            <div key={f} className="merge-file-conflict-item">⚡ {f}</div>
          ))}
        </div>
      )}

      <div className="merge-panel-actions">
        <button
          className="branch-action-btn primary"
          onClick={onFinalize}
          disabled={!canFinalize}
          title={canFinalize ? 'Create merge commit' : 'Resolve all canvas conflicts first'}
        >
          ↑ Finalize merge
        </button>
        <button className="branch-action-btn" onClick={onAbort}>
          Abort
        </button>
      </div>
    </Panel>
  );
}
