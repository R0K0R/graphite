const _deps = new Map(); // 'file://...' → Set<'file://...'>
const _listeners = new Set();
const _refCounts = new Map(); // `${srcUri}::${tgtUri}` → number

export function setDeps(uri, depUris) {
  _deps.set(uri, new Set(depUris));
  _listeners.forEach(fn => fn());
}
export function getDeps(uri)   { return _deps.get(uri) ?? new Set(); }
export function getAllDeps()   { return _deps; }
export function clearDeps(uri) {
  _deps.delete(uri);
  clearRefCounts(uri);
  _listeners.forEach(fn => fn());
}
export function clearAllDeps() {
  _deps.clear();
  _refCounts.clear();
  _listeners.forEach(fn => fn());
}
export function onDepsChanged(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }

export function setRefCount(src, tgt, n) { _refCounts.set(`${src}::${tgt}`, n); _listeners.forEach(fn => fn()); }
export function getRefCount(src, tgt)   { return _refCounts.get(`${src}::${tgt}`) ?? 0; }
export function clearRefCounts(uri) {
  for (const k of _refCounts.keys()) { if (k.startsWith(uri)) _refCounts.delete(k); }
}

// Static parsers — only relative imports map to canvas file nodes
const IMPORT_RE = {
  javascript: /(?:^|\n)\s*import\s+[^'"]*['"](\.[^'"]+)['"]/g,
  typescript: /(?:^|\n)\s*import\s+[^'"]*['"](\.[^'"]+)['"]/g,
  python:     /(?:^|\n)\s*from\s+(\.[\w./]+)\s+import/g,
  // go/rust: package paths, not relative — skip static; LSP documentLink handles them
};

export function parseDeps(filePath, content, lang) {
  const re = IMPORT_RE[lang];
  if (!re) { console.log('[depGraph] no regex for lang', lang); return []; }
  re.lastIndex = 0;
  const dir = filePath.slice(0, filePath.lastIndexOf('/'));
  const results = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    const imp = lang === 'python' ? pythonImportToRelPath(m[1]) : m[1];
    results.push(resolveRelative(dir, imp));
  }
  const out = [...new Set(results)];
  console.log('[depGraph] parseDeps', filePath, lang, '→', out);
  return out;
}

// Python: `.logger` → `logger`, `..errors` → `../errors`, `.utils.db` → `utils/db`
function pythonImportToRelPath(imp) {
  let dots = 0;
  while (dots < imp.length && imp[dots] === '.') dots++;
  const prefix = '../'.repeat(Math.max(0, dots - 1));
  const rest = imp.slice(dots).replace(/\./g, '/');
  return prefix + rest;
}

function resolveRelative(dir, imp) {
  const parts = (dir + '/' + imp).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '.')  continue;
    if (p === '..') { out.pop(); continue; }
    out.push(p);
  }
  return out.join('/');
}
