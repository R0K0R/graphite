import { useState, useEffect } from 'react';
import Node from './Node.jsx';
import { basename } from './CodeNode.jsx';

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  ico: 'image/x-icon', bmp: 'image/bmp', avif: 'image/avif',
};

export default function ImageNode({ id, data, selected }) {
  const { filePath } = data;
  const [dataUrl, setDataUrl] = useState(null);
  const [dims, setDims] = useState(null);

  useEffect(() => {
    if (!filePath || !window.electronAPI) return;
    const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
    const mime = MIME[ext] ?? 'image/png';
    window.electronAPI.readFileBinary(filePath).then(b64 => {
      setDataUrl(`data:${mime};base64,${b64}`);
    });
  }, [filePath]);

  return (
    <Node selected={selected} accentColor="#ec4899">
      <div className="file-node-header">
        <span className="file-node-filename">{basename(filePath) || 'Image'}</span>
        <span className="file-node-lang">image</span>
        {dims && <span className="file-node-lang" style={{ color: 'var(--muted)' }}>{dims}</span>}
      </div>
      {filePath && <div className="file-node-path">{filePath}</div>}
      <div className="image-node-body nodrag nowheel">
        {dataUrl
          ? <img
              src={dataUrl}
              className="image-node-img"
              onLoad={e => setDims(`${e.target.naturalWidth}×${e.target.naturalHeight}`)}
              alt={basename(filePath)}
            />
          : <div className="image-node-loading">Loading…</div>
        }
      </div>
    </Node>
  );
}
