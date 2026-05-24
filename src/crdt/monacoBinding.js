import { MonacoBinding } from 'y-monaco';
import { getYText, getAwareness } from './doc.js';

export function bindMonaco(filePath, editor, initialContent) {
  const yText = getYText(filePath);

  // Seed only if empty — first peer to open this file seeds from disk
  if (yText.length === 0 && initialContent) {
    yText.insert(0, initialContent);
  }

  const binding = new MonacoBinding(
    yText,
    editor.getModel(),
    new Set([editor]),
    getAwareness()
  );

  return () => binding.destroy();
}
