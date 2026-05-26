import DiffMatchPatch from 'diff-match-patch';
import { getYText, getDoc } from '../crdt/doc.js';
import { getDraft, clearDraft } from './agentBridge.js';

export function acceptDraft(filePath) {
  const draft = getDraft(filePath);
  if (!draft) return;

  const yText = getYText(filePath);
  const current = yText.toString();
  const { newContent } = draft;

  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(current, newContent);
  dmp.diff_cleanupSemantic(diffs);

  getDoc().transact(() => {
    let offset = 0;
    for (const [op, text] of diffs) {
      if (op === 0) {        // equal
        offset += text.length;
      } else if (op === -1) { // delete
        yText.delete(offset, text.length);
      } else {               // insert
        yText.insert(offset, text);
        offset += text.length;
      }
    }
  });

  clearDraft(filePath);
}

export function rejectDraft(filePath) {
  clearDraft(filePath);
}
