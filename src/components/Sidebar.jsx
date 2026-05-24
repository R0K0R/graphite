import { useState } from 'react';

const EXT_COLOR = {
  py: '#3572A5', js: '#f1e05a', jsx: '#61dafb', ts: '#3178c6', tsx: '#3178c6',
  rs: '#dea584', go: '#00ADD8', css: '#563d7c', html: '#e34c26',
  json: '#cbcb41', md: '#083fa1', sh: '#89e051', toml: '#9c4121',
  rb: '#701516', java: '#b07219', c: '#555555', cpp: '#6f5c62ff',
};

function fileColor(name) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return EXT_COLOR[ext] || '#4a5568';
}

function TreeItem({ entry, depth, onFocusNode, openDirs, toggleDir }) {
  if (entry.type === 'file') {
    return (
      <div
        className="sidebar-item sidebar-file"
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={() => onFocusNode(`file:${entry.path}`)}
      >
        <span className="sidebar-dot" style={{ background: fileColor(entry.name) }} />
        <span className="sidebar-name">{entry.name}</span>
      </div>
    );
  }

  const isOpen = openDirs.has(entry.path);
  return (
    <>
      <div
        className="sidebar-item sidebar-dir"
        style={{ paddingLeft: 12 + depth * 14 }}
      >
        <span className="sidebar-arrow" onClick={() => toggleDir(entry.path)}>{isOpen ? '▾' : '▸'}</span>
        <span className="sidebar-name" onClick={() => onFocusNode(`dir:${entry.path}`)}>{entry.name}</span>
      </div>
      {isOpen && (entry.children ?? []).map(child => (
        <TreeItem
          key={child.path}
          entry={child}
          depth={depth + 1}
          onFocusNode={onFocusNode}
          openDirs={openDirs}
          toggleDir={toggleDir}
        />
      ))}
    </>
  );
}

export default function Sidebar({ tree, rootPath, onFocusNode }) {
  const [openDirs, setOpenDirs] = useState(() => new Set());

  function toggleDir(path) {
    setOpenDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="ide-sidebar">
      <div className="sidebar-section-title">EXPLORER</div>
      {!tree ? (
        <div className="sidebar-empty">No folder open</div>
      ) : (
        <>
          <div className="sidebar-root-label">
            {rootPath ? rootPath.split('/').pop() : ''}
          </div>
          {(tree.children ?? []).map(child => (
            <TreeItem
              key={child.path}
              entry={child}
              depth={0}
              onFocusNode={onFocusNode}
              openDirs={openDirs}
              toggleDir={toggleDir}
            />
          ))}
        </>
      )}
    </div>
  );
}
