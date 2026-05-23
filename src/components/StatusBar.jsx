export default function StatusBar({ rootPath, nodeCount }) {
  const folder = rootPath ? rootPath.split('/').pop() : null;
  return (
    <div className="ide-statusbar">
      <span className="statusbar-left">
        {folder ? `📂 ${folder}` : 'No folder open'}
      </span>
      <span className="statusbar-right">
        {nodeCount} node{nodeCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
