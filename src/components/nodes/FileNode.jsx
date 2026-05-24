import { fileExt } from './CodeNode.jsx';
import CodeNode from './CodeNode.jsx';
import ImageNode from './ImageNode.jsx';
import PdfNode from './PdfNode.jsx';
import MarkdownNode from './MarkdownNode.jsx';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']);
const PDF_EXTS   = new Set(['pdf']);
const MD_EXTS    = new Set(['md', 'mdx']);

export default function FileNode(props) {
  const ext = props.data?.filePath ? fileExt(props.data.filePath) : '';
  if (!props.data?.filePath) return <CodeNode {...props} />;
  if (IMAGE_EXTS.has(ext)) return <ImageNode {...props} />;
  if (PDF_EXTS.has(ext))   return <PdfNode   {...props} />;
  if (MD_EXTS.has(ext))    return <MarkdownNode {...props} />;
  return <CodeNode {...props} />;
}
import { fileExt } from './CodeNode.jsx';
import CodeNode from './CodeNode.jsx';
import ImageNode from './ImageNode.jsx';
import PdfNode from './PdfNode.jsx';
import MarkdownNode from './MarkdownNode.jsx';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']);
const PDF_EXTS   = new Set(['pdf']);
const MD_EXTS    = new Set(['md', 'mdx']);

export default function FileNode(props) {
  const ext = props.data?.filePath ? fileExt(props.data.filePath) : '';
  if (!props.data?.filePath) return <CodeNode {...props} />;
  if (IMAGE_EXTS.has(ext)) return <ImageNode {...props} />;
  if (PDF_EXTS.has(ext))   return <PdfNode   {...props} />;
  if (MD_EXTS.has(ext))    return <MarkdownNode {...props} />;
  return <CodeNode {...props} />;
}
