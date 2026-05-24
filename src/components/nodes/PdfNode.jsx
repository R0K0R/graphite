import { useState, useEffect } from 'react';
import Node from './Node.jsx';
import { basename } from './CodeNode.jsx';

export default function PdfNode({ id, data, selected }) {
  const { filePath } = data;
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    if (!filePath || !window.electronAPI) return;
    window.electronAPI.readFileBinary(filePath).then(b64 => {
      setDataUrl(`data:application/pdf;base64,${b64}`);
    });
  }, [filePath]);

  return (
    <Node selected={selected} accentColor="#ef4444">
      <div className="file-node-header">
        <span className="file-node-filename">{basename(filePath) || 'PDF'}</span>
        <span className="file-node-lang">pdf</span>
      </div>
      {filePath && <div className="file-node-path">{filePath}</div>}
      <div className="pdf-node-body nodrag nowheel">
        {dataUrl
          ? <embed src={dataUrl} type="application/pdf" className="pdf-node-embed" />
          : <div className="image-node-loading">Loading…</div>
        }
      </div>
    </Node>
  );
}
import { useState, useEffect } from 'react';
import Node from './Node.jsx';
import { basename } from './CodeNode.jsx';

export default function PdfNode({ id, data, selected }) {
  const { filePath } = data;
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    if (!filePath || !window.electronAPI) return;
    window.electronAPI.readFileBinary(filePath).then(b64 => {
      setDataUrl(`data:application/pdf;base64,${b64}`);
    });
  }, [filePath]);

  return (
    <Node selected={selected} accentColor="#ef4444">
      <div className="file-node-header">
        <span className="file-node-filename">{basename(filePath) || 'PDF'}</span>
        <span className="file-node-lang">pdf</span>
      </div>
      {filePath && <div className="file-node-path">{filePath}</div>}
      <div className="pdf-node-body nodrag nowheel">
        {dataUrl
          ? <embed src={dataUrl} type="application/pdf" className="pdf-node-embed" />
          : <div className="image-node-loading">Loading…</div>
        }
      </div>
    </Node>
  );
}
