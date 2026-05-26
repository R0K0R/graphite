import DiffMatchPatch from 'diff-match-patch';

// Renders a unified line-level diff between oldText and newText.
export default function UnifiedDiff({ oldText, newText, maxLines = 200 }) {
  const lines = buildDiffLines(oldText ?? '', newText ?? '');
  const shown = lines.slice(0, maxLines);
  const clipped = lines.length > maxLines;

  return (
    <div className="unified-diff">
      {shown.map((line, i) => (
        <div key={i} className={`udiff-line udiff-line--${line.type}`}>
          <span className="udiff-gutter">{line.type === 'equal' ? ' ' : line.type === 'insert' ? '+' : '−'}</span>
          <span className="udiff-text">{line.text}</span>
        </div>
      ))}
      {clipped && (
        <div className="udiff-line udiff-line--clipped">… {lines.length - maxLines} more lines</div>
      )}
    </div>
  );
}

function buildDiffLines(oldText, newText) {
  const dmp = new DiffMatchPatch();
  const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(oldText, newText);
  const diffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_charsToLines_(diffs, lineArray);

  const lines = [];
  for (const [op, text] of diffs) {
    const type = op === 0 ? 'equal' : op === 1 ? 'insert' : 'delete';
    for (const raw of text.split('\n')) {
      if (raw === '' && text.endsWith('\n') && raw === text.split('\n').at(-1)) continue;
      lines.push({ type, text: raw });
    }
  }
  // Collapse long equal runs to context lines (±3 around changes)
  return collapseContext(lines, 3);
}

function collapseContext(lines, ctx) {
  // Find which lines are non-equal
  const changed = new Set();
  lines.forEach((l, i) => { if (l.type !== 'equal') changed.add(i); });
  if (changed.size === 0) return [];

  const visible = new Set();
  for (const i of changed) {
    for (let j = Math.max(0, i - ctx); j <= Math.min(lines.length - 1, i + ctx); j++) visible.add(j);
  }

  const result = [];
  let lastVisible = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!visible.has(i)) continue;
    if (lastVisible !== -1 && i > lastVisible + 1) {
      result.push({ type: 'separator', text: `@@ ${i - lastVisible - 1} lines hidden @@` });
    }
    result.push(lines[i]);
    lastVisible = i;
  }
  return result;
}
