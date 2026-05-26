const { app, BrowserWindow, ipcMain, dialog, protocol, net, session } = require('electron');
const fs = require('fs');
const path = require('path');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);
const { spawn, execFileSync } = require('child_process');

const distIndex = path.join(__dirname, 'dist', 'index.html');

// filePath → FSWatcher
const watchers = new Map();
// filePath → last content written by renderer (echo-loop prevention)
const lastWritten = new Map();

let mainWin = null;

function loadWindow(win) {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
    return;
  }
  win.loadURL('app://graphite/');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      partition: 'persist:graphite',
    },
  });
  mainWin = win;
  loadWindow(win);
}

// --- IPC: file operations ---

ipcMain.handle('file:open-picker', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('file:read', (_e, filePath) =>
  fs.promises.readFile(filePath, 'utf8')
);

ipcMain.handle('file:write', async (_e, filePath, content) => {
  lastWritten.set(filePath, content);
  await fs.promises.writeFile(filePath, content, 'utf8');
});

ipcMain.handle('file:watch', (_e, filePath) => {
  if (watchers.has(filePath)) return;
  let debounceTimer = null;
  const watcher = fs.watch(filePath, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        if (content === lastWritten.get(filePath)) return; // echo from our own write
        lastWritten.set(filePath, content);
        mainWin?.webContents.send('file-changed', { filePath, content });
      } catch (_) { /* file may be temporarily unavailable */ }
    }, 200);
  });
  watchers.set(filePath, watcher);
});

ipcMain.handle('file:unwatch', (_e, filePath) => {
  const watcher = watchers.get(filePath);
  if (watcher) {
    watcher.close();
    watchers.delete(filePath);
    lastWritten.delete(filePath);
  }
});

ipcMain.handle('file:read-binary', (_e, filePath) =>
  fs.promises.readFile(filePath).then(buf => buf.toString('base64'))
);

// --- IPC: directory tree scanner ---

const IGNORED = new Set([
  '.git', '.svn', '.hg', 'node_modules', '__pycache__', '.cache',
  'dist', 'build', '.next', '.nuxt', 'target', 'venv', '.venv',
  '.mypy_cache', '.pytest_cache', '.tox', 'coverage', '.graphite.json',
]);

const SKIP_EXTS = new Set([
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
  'exe', 'dll', 'so', 'dylib', 'bin',
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'ogg', 'flac',
  'pyc', 'pyo', 'class', 'o', 'a',
  'woff', 'woff2', 'ttf', 'eot',
  'db', 'sqlite', 'sqlite3',
  'lock',
]);
const MAX_DEPTH = 4;

async function readTree(dirPath, depth = 0) {
  if (depth > MAX_DEPTH) return null;
  let entries;
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (_) {
    return null;
  }
  const children = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const sub = await readTree(fullPath, depth + 1);
      if (sub) children.push(sub);
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf('.') + 1).toLowerCase();
      if (!SKIP_EXTS.has(ext)) children.push({ name: entry.name, path: fullPath, type: 'file' });
    }
  }
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { name: path.basename(dirPath), path: dirPath, type: 'directory', children };
}

ipcMain.handle('dir:read-tree', (_e, dirPath) => readTree(dirPath));

// --- IPC: directory / metadata operations ---

ipcMain.handle('dir:open-picker', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return canceled ? null : filePaths[0];
});

// --- IPC: .graphite/ root store ---

ipcMain.handle('graphite:init-room', async (_e, rootPath) => {
  const dir = path.join(rootPath, '.graphite');
  await fs.promises.mkdir(dir, { recursive: true });
  const roomFile = path.join(dir, 'room');
  try {
    return (await fs.promises.readFile(roomFile, 'utf8')).trim();
  } catch {
    return null; // renderer generates the code and calls graphite:save-room
  }
});

ipcMain.handle('graphite:save-room', async (_e, rootPath, roomCode) => {
  const dir = path.join(rootPath, '.graphite');
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, 'room'), roomCode, 'utf8');
});

// Region metadata stored centrally at <root>/.graphite/regions.json
async function readRegions(rootPath) {
  try {
    const raw = await fs.promises.readFile(path.join(rootPath, '.graphite', 'regions.json'), 'utf8');
    return JSON.parse(raw);
  } catch { return {}; }
}

ipcMain.handle('dir:read-metadata', async (_e, rootPath, dirPath) => {
  const regions = await readRegions(rootPath);
  return regions[dirPath] ?? null;
});

ipcMain.handle('dir:write-metadata', async (_e, rootPath, dirPath, metadata) => {
  const dir = path.join(rootPath, '.graphite');
  await fs.promises.mkdir(dir, { recursive: true });
  const regions = await readRegions(rootPath);
  regions[dirPath] = metadata;
  await fs.promises.writeFile(
    path.join(dir, 'regions.json'),
    JSON.stringify(regions, null, 2),
    'utf8'
  );
});

// --- IPC: LSP server management ---

// Each language lists candidate binaries in preference order; first one found in PATH wins.
const LSP_SERVERS = {
  python:     [['basedpyright-langserver', ['--stdio']], ['pyright-langserver', ['--stdio']]],
  typescript: [['typescript-language-server', ['--stdio']]],
  javascript: [['typescript-language-server', ['--stdio']]],
  rust:       [['rust-analyzer', []]],
  go:         [['gopls', []]],
};

function findServer(languageId) {
  for (const [cmd, args] of (LSP_SERVERS[languageId] ?? [])) {
    try { execFileSync('which', [cmd], { stdio: 'ignore' }); return [cmd, args]; } catch (_) {}
  }
  return null;
}

// key (`rootPath|languageId`) → { proc }
const lspProcesses = new Map();

function writeLsp(proc, msg) {
  const body = JSON.stringify(msg);
  proc.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

ipcMain.handle('lsp:start', (_e, rootPath, languageId) => {
  const key = `${rootPath}|${languageId}`;
  if (lspProcesses.has(key)) return { ok: true, key };

  const def = findServer(languageId);
  if (!def) return { ok: false, key, reason: 'no-server' };
  const [cmd, args] = def;

  let proc;
  try {
    proc = spawn(cmd, args, { cwd: rootPath, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return { ok: false, key, reason: 'spawn-failed', error: e.message };
  }

  let buf = '';
  proc.stdout.on('data', chunk => {
    buf += chunk.toString('utf8');
    while (true) {
      const sep = buf.indexOf('\r\n\r\n');
      if (sep === -1) break;
      const m = buf.slice(0, sep).match(/Content-Length:\s*(\d+)/i);
      if (!m) { buf = buf.slice(sep + 4); continue; }
      const len = parseInt(m[1], 10);
      if (buf.length < sep + 4 + len) break;
      const body = buf.slice(sep + 4, sep + 4 + len);
      buf = buf.slice(sep + 4 + len);
      try { mainWin?.webContents.send('lsp:message', key, JSON.parse(body)); } catch (_) {}
    }
  });

  proc.stderr.on('data', d => {
    d.toString().split('\n').filter(Boolean).forEach(line => {
      console.log(`[LSP:${languageId}]`, line);
      mainWin?.webContents.send('lsp:stderr', languageId, line);
    });
  });
  proc.on('error', err => mainWin?.webContents.send('lsp:error', key, err.message));
  proc.on('exit', () => { lspProcesses.delete(key); mainWin?.webContents.send('lsp:exit', key); });

  lspProcesses.set(key, { proc });
  return { ok: true, key };
});

ipcMain.on('lsp:send', (_e, key, msg) => {
  const entry = lspProcesses.get(key);
  if (entry) writeLsp(entry.proc, msg);
});

ipcMain.handle('lsp:stop', (_e, key) => {
  const entry = lspProcesses.get(key);
  if (entry) { entry.proc.kill(); lspProcesses.delete(key); }
});

// --- IPC: VCS (git + canvas snapshots) ---

const { createHash } = require('crypto');

function gitExec(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

function gitExecSafe(args, cwd) {
  try { return gitExec(args, cwd); } catch (_) { return null; }
}

function sha1hex(str) {
  return createHash('sha1').update(str).digest('hex');
}

function roomCodeForBranch(rootPath, branchName) {
  return 'branch:' + sha1hex(rootPath + ':' + branchName).slice(0, 8);
}

function graphiteDir(rootPath) {
  return path.join(rootPath, '.graphite');
}

function snapshotPath(rootPath, gitHash) {
  return path.join(graphiteDir(rootPath), 'snapshots', gitHash + '.bin');
}

function vcsJsonPath(rootPath) {
  return path.join(graphiteDir(rootPath), 'vcs.json');
}

function blamePath(rootPath) {
  return path.join(graphiteDir(rootPath), 'blame.json');
}

function readVcsJson(rootPath) {
  try {
    return JSON.parse(fs.readFileSync(vcsJsonPath(rootPath), 'utf8'));
  } catch (_) {
    return { version: 1, branches: {} };
  }
}

function writeVcsJson(rootPath, data) {
  fs.mkdirSync(graphiteDir(rootPath), { recursive: true });
  fs.writeFileSync(vcsJsonPath(rootPath), JSON.stringify(data, null, 2), 'utf8');
}

function readBlameJson(rootPath) {
  try {
    return JSON.parse(fs.readFileSync(blamePath(rootPath), 'utf8'));
  } catch (_) {
    return {};
  }
}

function writeBlameJson(rootPath, data) {
  fs.mkdirSync(graphiteDir(rootPath), { recursive: true });
  fs.writeFileSync(blamePath(rootPath), JSON.stringify(data, null, 2), 'utf8');
}

// Decode base64 update → Buffer
function decodeUpdate(b64) {
  return Buffer.from(b64, 'base64');
}

// Inline Y.Doc manipulation in main process using yjs (CommonJS)
let Y = null;
function getY() {
  if (!Y) Y = require('yjs');
  return Y;
}

function decodeNodes(updateBuf) {
  const yjs = getY();
  const doc = new yjs.Doc();
  yjs.applyUpdate(doc, updateBuf);
  const yMap = doc.getMap('nodes');
  return Array.from(yMap.values());
}

function computeNodeDiffMain(baseNodes, currentNodes) {
  const POS_THRESHOLD = 8;
  const baseMap    = new Map(baseNodes.map(n => [n.id, n]));
  const currentMap = new Map(currentNodes.map(n => [n.id, n]));
  const added = [], removed = [], moved = [], modified = [];

  for (const [id, base] of baseMap) {
    const cur = currentMap.get(id);
    if (!cur) { removed.push(id); continue; }
    const dx = Math.abs((base.position?.x ?? 0) - (cur.position?.x ?? 0));
    const dy = Math.abs((base.position?.y ?? 0) - (cur.position?.y ?? 0));
    const isMoved = dx > POS_THRESHOLD || dy > POS_THRESHOLD;
    if (isMoved) moved.push(id);
    else {
      const SKIP = new Set(['peerColors', 'blameInfo', 'diffState', 'mergeConflict',
        'onContentChange', 'onFilePicked', 'onEditorFocus', 'onEditorBlur',
        'onChangeParam', 'onToggleCollapse', 'onLinkDir', 'expanded', 'rootPath']);
      const a = Object.fromEntries(Object.entries(base.data ?? {}).filter(([k]) => !SKIP.has(k)));
      const b = Object.fromEntries(Object.entries(cur.data  ?? {}).filter(([k]) => !SKIP.has(k)));
      if (JSON.stringify(a) !== JSON.stringify(b)) modified.push(id);
    }
  }
  for (const [id] of currentMap) {
    if (!baseMap.has(id)) added.push(id);
  }
  return { added, removed, moved, modified };
}

// HEAD watcher — fires vcs:git-branch-changed when .git/HEAD changes
let headWatcher = null;

function watchGitHead(rootPath) {
  if (headWatcher) { try { headWatcher.close(); } catch (_) {} headWatcher = null; }
  const headFile = path.join(rootPath, '.git', 'HEAD');
  if (!fs.existsSync(headFile)) return;
  let last = null;
  try { last = fs.readFileSync(headFile, 'utf8').trim(); } catch (_) {}
  headWatcher = fs.watch(headFile, () => {
    try {
      const content = fs.readFileSync(headFile, 'utf8').trim();
      if (content === last) return;
      last = content;
      const branch = content.startsWith('ref: refs/heads/')
        ? content.slice('ref: refs/heads/'.length)
        : content.slice(0, 7); // detached HEAD
      mainWin?.webContents.send('vcs:git-branch-changed', branch);
    } catch (_) {}
  });
}

ipcMain.handle('vcs:init', (_e, rootPath) => {
  try {
    const hasGit = fs.existsSync(path.join(rootPath, '.git'));
    if (!hasGit) return { hasGit: false, branches: [], currentBranch: null };

    watchGitHead(rootPath);

    const branchesRaw = gitExecSafe(['branch', '--format=%(refname:short)'], rootPath) ?? '';
    const branches    = branchesRaw.split('\n').map(s => s.trim()).filter(Boolean);
    const currentBranch = gitExecSafe(['rev-parse', '--abbrev-ref', 'HEAD'], rootPath) ?? null;

    // Ensure .graphite dir and vcs.json exist
    fs.mkdirSync(path.join(graphiteDir(rootPath), 'snapshots'), { recursive: true });
    const vcs = readVcsJson(rootPath);
    if (currentBranch && !vcs.branches[currentBranch]) {
      vcs.branches[currentBranch] = { roomCode: roomCodeForBranch(rootPath, currentBranch) };
      writeVcsJson(rootPath, vcs);
    }

    // Try to load last snapshot for current branch
    let snapshotUpdate = null;
    const branchMeta = vcs.branches[currentBranch];
    if (branchMeta?.snapshotHash) {
      const sp = snapshotPath(rootPath, branchMeta.snapshotHash);
      if (fs.existsSync(sp)) snapshotUpdate = fs.readFileSync(sp).toString('base64');
    }

    return { hasGit: true, branches, currentBranch, snapshotUpdate };
  } catch (e) {
    console.error('[VCS] init error', e);
    return { hasGit: false, branches: [], currentBranch: null };
  }
});

ipcMain.handle('vcs:commit', async (_e, rootPath, updateB64, message) => {
  try {
    const updateBuf    = decodeUpdate(updateB64);
    const vcs          = readVcsJson(rootPath);
    const currentBranch = gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], rootPath);
    const author       = gitExecSafe(['config', 'user.name'], rootPath) ?? 'unknown';
    const now          = Date.now();

    // Compute which nodes changed vs. last snapshot
    const currentNodes = decodeNodes(updateBuf);
    const branchMeta   = vcs.branches[currentBranch] ?? {};
    let baseNodes = [];
    if (branchMeta.snapshotHash) {
      const sp = snapshotPath(rootPath, branchMeta.snapshotHash);
      if (fs.existsSync(sp)) baseNodes = decodeNodes(fs.readFileSync(sp));
    }
    const diff       = computeNodeDiffMain(baseNodes, currentNodes);
    const changedIds = [...diff.added, ...diff.modified, ...diff.moved, ...diff.removed];

    // Write snapshot under a temp name until we have the real commit hash
    const pendingPath = path.join(graphiteDir(rootPath), 'snapshots', 'PENDING.bin');
    fs.writeFileSync(pendingPath, updateBuf);

    // Initial commit (snapshot only, blame/vcs still have placeholder hash)
    gitExec(['add', '.graphite/snapshots/PENDING.bin'], rootPath);
    gitExec(['commit', '-m', message, '--allow-empty'], rootPath);
    const firstHash = gitExec(['rev-parse', 'HEAD'], rootPath);

    // Rename snapshot to the real hash
    const snapshotFile = snapshotPath(rootPath, firstHash);
    fs.renameSync(pendingPath, snapshotFile);

    // Update blame.json and vcs.json with real hash, then amend once
    const blame = readBlameJson(rootPath);
    for (const id of changedIds) {
      blame[id] = {
        author, authorColor: '#60a5fa',
        timestamp: now, message,
        commitHash: firstHash, shortHash: firstHash.slice(0, 7),
      };
    }
    writeBlameJson(rootPath, blame);

    vcs.branches[currentBranch] = {
      ...(vcs.branches[currentBranch] ?? {}),
      roomCode:     roomCodeForBranch(rootPath, currentBranch),
      snapshotHash: firstHash,
    };
    writeVcsJson(rootPath, vcs);

    gitExec(['add', '.graphite/'], rootPath);
    gitExec(['commit', '--amend', '--no-edit'], rootPath);
    const finalHash = gitExec(['rev-parse', 'HEAD'], rootPath);

    // If amend changed the hash, rename the snapshot file to match
    if (finalHash !== firstHash) {
      const finalSnapshotFile = snapshotPath(rootPath, finalHash);
      try { fs.renameSync(snapshotFile, finalSnapshotFile); } catch (_) {}
      vcs.branches[currentBranch].snapshotHash = finalHash;
      writeVcsJson(rootPath, vcs);
    }

    return { ok: true, gitHash: finalHash };
  } catch (e) {
    console.error('[VCS] commit error', e);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vcs:create-branch', async (_e, rootPath, name, updateB64) => {
  try {
    // Create git branch from current HEAD
    gitExec(['checkout', '-b', name], rootPath);
    const roomCode = roomCodeForBranch(rootPath, name);
    const vcs = readVcsJson(rootPath);
    vcs.branches[name] = { roomCode };
    writeVcsJson(rootPath, vcs);
    return { ok: true, roomCode };
  } catch (e) {
    console.error('[VCS] create-branch error', e);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vcs:checkout', async (_e, rootPath, branchName) => {
  try {
    gitExec(['checkout', branchName], rootPath);
    const roomCode = roomCodeForBranch(rootPath, branchName);
    const vcs = readVcsJson(rootPath);
    const branchMeta = vcs.branches[branchName] ?? {};
    let snapshotUpdate = null;
    if (branchMeta.snapshotHash) {
      const sp = snapshotPath(rootPath, branchMeta.snapshotHash);
      if (fs.existsSync(sp)) snapshotUpdate = fs.readFileSync(sp).toString('base64');
    }
    return { ok: true, roomCode, snapshotUpdate };
  } catch (e) {
    console.error('[VCS] checkout error', e);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vcs:diff', async (_e, rootPath, fromHash, toUpdateB64) => {
  try {
    const toUpdate  = decodeUpdate(toUpdateB64);
    const curNodes  = decodeNodes(toUpdate);
    let baseNodes   = [];
    let resolvedHash = fromHash;

    if (fromHash) {
      const sp = snapshotPath(rootPath, fromHash);
      if (fs.existsSync(sp)) {
        baseNodes = decodeNodes(fs.readFileSync(sp));
      } else {
        // No snapshot for this commit — synthesize base from git tree at that commit.
        // Nodes whose files existed at fromHash = base nodes; added files = not in base.
        // Modified files get a marker so computeNodeDiff sees them as 'modified'.
        baseNodes = buildBaseNodesFromGit(rootPath, fromHash, curNodes);
      }
    } else {
      // Use last committed snapshot for current branch
      const vcsData = readVcsJson(rootPath);
      const branch  = gitExecSafe(['rev-parse', '--abbrev-ref', 'HEAD'], rootPath);
      const meta    = vcsData.branches[branch] ?? {};
      if (meta.snapshotHash) {
        const sp = snapshotPath(rootPath, meta.snapshotHash);
        if (fs.existsSync(sp)) {
          baseNodes = decodeNodes(fs.readFileSync(sp));
          resolvedHash = meta.snapshotHash;
        } else {
          baseNodes = buildBaseNodesFromGit(rootPath, meta.snapshotHash, curNodes);
          resolvedHash = meta.snapshotHash;
        }
      }
    }
    return { baseNodes, currentNodes: curNodes };
  } catch (e) {
    console.error('[VCS] diff error', e);
    return { baseNodes: [], currentNodes: [] };
  }
});

// Build synthetic base nodes from the git tree at a given commit, for use when no
// canvas snapshot exists. Nodes whose files were added since that commit are omitted
// (they'll appear as 'added'). Nodes whose files were modified carry a marker so
// computeNodeDiff can detect them as 'modified'. Deleted files get stub nodes so
// they appear as 'removed' ghosts.
function buildBaseNodesFromGit(rootPath, commitHash, curNodes) {
  // Files changed between commitHash and HEAD (relative paths)
  const addedRaw    = gitExecSafe(['diff', '--name-only', '--diff-filter=A', commitHash, 'HEAD'], rootPath) ?? '';
  const deletedRaw  = gitExecSafe(['diff', '--name-only', '--diff-filter=D', commitHash, 'HEAD'], rootPath) ?? '';
  const modifiedRaw = gitExecSafe(['diff', '--name-only', '--diff-filter=M', commitHash, 'HEAD'], rootPath) ?? '';

  const toAbs = rel => path.resolve(rootPath, rel);
  const addedAbs    = new Set(addedRaw.split('\n').filter(Boolean).map(toAbs));
  const deletedAbs  = new Set(deletedRaw.split('\n').filter(Boolean).map(toAbs));
  const modifiedAbs = new Set(modifiedRaw.split('\n').filter(Boolean).map(toAbs));

  const curByPath = new Map(
    curNodes.filter(n => n.data?.filePath).map(n => [n.data.filePath, n])
  );

  const base = [];

  // Current nodes that existed at commitHash
  for (const [filePath, node] of curByPath) {
    if (addedAbs.has(filePath)) continue; // Added since commitHash → 'added' in diff
    if (modifiedAbs.has(filePath)) {
      // Modified: inject a marker so dataEqual returns false → 'modified'
      base.push({ ...node, data: { ...node.data, __gitModified: commitHash } });
    } else {
      base.push(node); // Unchanged: same id/data/position → no diff entry
    }
  }

  // Files deleted since commitHash: create stub base nodes so they appear as 'removed'
  let stubX = -500, stubY = 0;
  for (const filePath of deletedAbs) {
    const relPath = path.relative(rootPath, filePath);
    base.push({
      id: 'git-del:' + relPath,
      type: 'file',
      position: { x: stubX, y: stubY },
      width: 280, height: 80,
      data: { filePath, label: path.basename(filePath) },
    });
    stubY += 100;
  }

  return base;
}

ipcMain.handle('vcs:load-blame', (_e, rootPath) => {
  try { return readBlameJson(rootPath); } catch (_) { return {}; }
});

ipcMain.handle('vcs:git-log', (_e, rootPath, n) => {
  try {
    const hasGit = fs.existsSync(path.join(rootPath, '.git'));
    if (!hasGit) return [];
    const raw = gitExecSafe(
      ['log', `--max-count=${n ?? 10}`, '--format=%H\t%h\t%an\t%ct\t%s'],
      rootPath
    ) ?? '';
    return raw.split('\n').filter(Boolean).map(line => {
      const [hash, shortHash, author, ts, ...msgParts] = line.split('\t');
      return { hash, shortHash, author, timestamp: parseInt(ts, 10) * 1000, message: msgParts.join('\t') };
    });
  } catch (_) { return []; }
});

ipcMain.handle('vcs:git-branches', (_e, rootPath) => {
  try {
    const branches = (gitExecSafe(['branch', '--format=%(refname:short)'], rootPath) ?? '')
      .split('\n').map(s => s.trim()).filter(Boolean);
    const current  = gitExecSafe(['rev-parse', '--abbrev-ref', 'HEAD'], rootPath);
    return { branches, current };
  } catch (_) { return { branches: [], current: null }; }
});

// --- App lifecycle ---

function registerAppProtocol(ses) {
  ses.protocol.handle('app', async (request) => {
    let urlPath = request.url.slice('app://graphite/'.length);
    urlPath = urlPath.split('?')[0].split('#')[0];
    if (!urlPath) urlPath = 'index.html';
    const filePath = path.join(__dirname, 'dist', ...urlPath.split('/'));
    try {
      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime = {
        html: 'text/html', js: 'application/javascript', mjs: 'application/javascript',
        css: 'text/css', json: 'application/json', svg: 'image/svg+xml',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
        ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
      };
      return new Response(data, { headers: { 'Content-Type': mime[ext] || 'application/octet-stream' } });
    } catch (_) {
      return new Response('Not Found', { status: 404 });
    }
  });
}

function clearStaleLocks() {
  const idbDir = path.join(app.getPath('userData'), 'Partitions', 'graphite', 'IndexedDB');
  try {
    for (const entry of fs.readdirSync(idbDir)) {
      const lockFile = path.join(idbDir, entry, 'LOCK');
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log('[main] cleared stale LevelDB lock:', lockFile);
      }
    }
  } catch (_) {}
}

app.whenReady().then(() => {
  clearStaleLocks();
  registerAppProtocol(session.fromPartition('persist:graphite'));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  for (const { proc } of lspProcesses.values()) proc.kill();
});
