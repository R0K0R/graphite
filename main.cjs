const { app, BrowserWindow, ipcMain, dialog, protocol, net, session } = require('electron');
const fs = require('fs');
const path = require('path');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);
const { spawn, execFileSync } = require('child_process');
const os = require('os');

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

ipcMain.handle('file:create', async (_e, filePath) => {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, '', { flag: 'wx' }); // fail if exists
});

ipcMain.handle('file:move', async (_e, srcPath, destPath) => {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.rename(srcPath, destPath);
});

ipcMain.handle('dir:create', async (_e, dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
});

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

ipcMain.handle('graphite:read-config', async (_e, rootPath) => {
  try {
    const raw = await fs.promises.readFile(path.join(rootPath, '.graphite', 'config.json'), 'utf8');
    return JSON.parse(raw);
  } catch { return {}; }
});

ipcMain.handle('graphite:write-config', async (_e, rootPath, config) => {
  const dir = path.join(rootPath, '.graphite');
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
});

// --- Signaling server (y-webrtc) ---

let signalingProc = null;
const SIGNALING_PORT = 4444;

ipcMain.handle('signaling:start', () => {
  if (signalingProc) return { already: true };
  const serverScript = path.join(__dirname, 'node_modules', 'y-webrtc', 'bin', 'server.js');
  signalingProc = spawn(process.execPath, [serverScript], {
    env: { ...process.env, HOST: '0.0.0.0', PORT: String(SIGNALING_PORT) },
    stdio: 'ignore',
  });
  signalingProc.on('exit', () => { signalingProc = null; });
  return { port: SIGNALING_PORT };
});

ipcMain.handle('signaling:stop', () => {
  signalingProc?.kill();
  signalingProc = null;
});

ipcMain.handle('signaling:status', () => ({ running: !!signalingProc, port: SIGNALING_PORT }));

ipcMain.handle('signaling:local-ips', () => {
  const ips = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  return ips;
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
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
  } catch (e) {
    // Attach stderr to the error message so callers get actionable output
    const stderr = e.stderr?.toString?.()?.trim();
    if (stderr) e.message = `${e.message}\n${stderr}`;
    throw e;
  }
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
  let stashed = false;
  try {
    // If a merge is in progress, abort it before switching branches.
    // This happens when merge-preview left a MERGE_HEAD and the user navigates away.
    if (fs.existsSync(path.join(rootPath, '.git', 'MERGE_HEAD'))) {
      gitExecSafe(['merge', '--abort'], rootPath);
    }

    // If the working tree still has tracked changes, stash them so checkout doesn't fail.
    // Only stash when there are no unmerged entries — stash cannot handle those.
    const statusOut = gitExecSafe(['status', '--porcelain'], rootPath) ?? '';
    const hasUnmerged = statusOut.split('\n').some(l => l.startsWith('UU') || l.startsWith('AA') || l.startsWith('DD'));
    if (statusOut.trim() && !hasUnmerged) {
      gitExec(['stash', '--include-untracked', '-m', 'graphite-auto-stash'], rootPath);
      stashed = true;
    }

    gitExec(['checkout', branchName], rootPath);

    if (stashed) {
      // Restore stashed changes on the new branch (best-effort)
      gitExecSafe(['stash', 'pop'], rootPath);
    }

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
    // If we stashed but checkout failed, pop the stash back
    if (stashed) gitExecSafe(['stash', 'pop'], rootPath);
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

ipcMain.handle('vcs:file-at-commit', (_e, rootPath, filePath, commitHash) => {
  try {
    const rel = path.relative(rootPath, filePath);
    return gitExecSafe(['show', `${commitHash}:${rel}`], rootPath) ?? null;
  } catch (_) { return null; }
});

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

ipcMain.handle('vcs:git-blame-file', (_e, rootPath, filePath) => {
  try {
    const hasGit = fs.existsSync(path.join(rootPath, '.git'));
    if (!hasGit) return null;
    const rel = path.relative(rootPath, filePath);
    const raw = gitExecSafe(['blame', '--porcelain', rel], rootPath);
    if (!raw) return null;
    // Parse porcelain format into BlameLineInfo[]
    const lines = [];
    let cur = null;
    for (const line of raw.split('\n')) {
      if (/^[0-9a-f]{40} /.test(line)) {
        const parts = line.split(' ');
        const finalLine = parseInt(parts[2], 10);
        cur = { line: finalLine, hash: parts[0], author: '', authorTime: 0, summary: '' };
      } else if (line.startsWith('author ') && cur) {
        cur.author = line.slice(7);
      } else if (line.startsWith('author-time ') && cur) {
        cur.authorTime = parseInt(line.slice(12), 10);
      } else if (line.startsWith('summary ') && cur) {
        cur.summary = line.slice(8);
      } else if (line.startsWith('\t') && cur) {
        lines[cur.line - 1] = cur;
        cur = null;
      }
    }
    return lines;
  } catch (_) { return null; }
});

ipcMain.handle('vcs:merge-preview', async (_e, rootPath, srcBranch) => {
  try {
    const hasGit = fs.existsSync(path.join(rootPath, '.git'));
    if (!hasGit) return { ok: false, error: 'no git' };

    // Find common ancestor
    const ancestorHash = gitExecSafe(['merge-base', 'HEAD', srcBranch], rootPath)?.trim() ?? null;

    // Load base snapshot
    let baseNodes = [];
    if (ancestorHash) {
      const sp = snapshotPath(rootPath, ancestorHash);
      if (fs.existsSync(sp)) {
        baseNodes = decodeNodes(fs.readFileSync(sp));
      }
    }

    // Load their snapshot
    let theirNodes = [];
    const vcs = readVcsJson(rootPath);
    const theirMeta = vcs.branches?.[srcBranch];
    if (theirMeta?.snapshotHash) {
      const sp = snapshotPath(rootPath, theirMeta.snapshotHash);
      if (fs.existsSync(sp)) theirNodes = decodeNodes(fs.readFileSync(sp));
    }

    // Run real git merge (no-commit so we can inspect result)
    let fileConflicts = [];
    try {
      gitExec(['merge', '--no-commit', '--no-ff', srcBranch], rootPath);
    } catch (mergeErr) {
      // Extract all conflicted files
      const status = gitExecSafe(['diff', '--name-only', '--diff-filter=U'], rootPath) ?? '';
      fileConflicts = status.split('\n').map(s => s.trim()).filter(Boolean);
    }

    // .graphite/ is managed entirely by Graphite — always resolve its conflicts to "ours"
    // so that checkout, stash, and commit never get blocked by vcs.json / blame.json conflicts.
    const graphiteConflicts = fileConflicts.filter(f => f.startsWith('.graphite/'));
    if (graphiteConflicts.length) {
      gitExecSafe(['checkout', '--ours', '.graphite/'], rootPath);
      gitExecSafe(['add', '.graphite/'], rootPath);
      fileConflicts = fileConflicts.filter(f => !f.startsWith('.graphite/'));
    }

    return { ok: true, baseNodes, theirNodes, fileConflicts, isTwoWay: baseNodes.length === 0 };
  } catch (e) {
    console.error('[VCS] merge-preview error', e);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vcs:merge-finalize', async (_e, rootPath, resolvedUpdateB64) => {
  try {
    const updateBuf = decodeUpdate(resolvedUpdateB64);

    gitExec(['add', '.graphite/'], rootPath);

    // Use --no-edit if a merge is in progress (MERGE_HEAD exists), otherwise plain commit
    const hasMergeHead = fs.existsSync(path.join(rootPath, '.git', 'MERGE_HEAD'));
    if (hasMergeHead) {
      gitExec(['commit', '--no-edit'], rootPath);
    } else {
      const srcBranch = gitExecSafe(['rev-parse', '--abbrev-ref', 'MERGE_HEAD'], rootPath) ?? 'branch';
      gitExec(['commit', '-m', `Merge ${srcBranch}`, '--allow-empty'], rootPath);
    }
    const finalHash = gitExecSafe(['rev-parse', 'HEAD'], rootPath)?.trim();

    // Write snapshot under the real merge commit hash
    if (finalHash) {
      const sp = snapshotPath(rootPath, finalHash);
      fs.mkdirSync(path.dirname(sp), { recursive: true });
      fs.writeFileSync(sp, updateBuf);
      // Amend to include the snapshot file
      gitExec(['add', '.graphite/'], rootPath);
      gitExec(['commit', '--amend', '--no-edit'], rootPath);
    }

    const realHash = gitExecSafe(['rev-parse', 'HEAD'], rootPath)?.trim();
    return { ok: true, gitHash: realHash ?? finalHash };
  } catch (e) {
    console.error('[VCS] merge-finalize error', e);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vcs:merge-abort', (_e, rootPath) => {
  try {
    gitExecSafe(['merge', '--abort'], rootPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vcs:git-branches', (_e, rootPath) => {
  try {
    const branches = (gitExecSafe(['branch', '--format=%(refname:short)'], rootPath) ?? '')
      .split('\n').map(s => s.trim()).filter(Boolean);
    const current  = gitExecSafe(['rev-parse', '--abbrev-ref', 'HEAD'], rootPath);
    return { branches, current };
  } catch (_) { return { branches: [], current: null }; }
});

// --- Agent ---

const AGENT_TOOL_DEFS = [
  {
    name: 'read_file',
    description: 'Read the full contents of a file from disk.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute file path' } },
      required: ['path'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replace an exact substring in a file with new content. The edit is proposed as a diff — the user must accept it before it lands in the editor.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_str: { type: 'string', description: 'Exact string to find and replace (must exist verbatim in the file)' },
        new_str: { type: 'string', description: 'Replacement string' },
      },
      required: ['path', 'old_str', 'new_str'],
    },
  },
  {
    name: 'create_node',
    description: 'Create a new node on the canvas.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['file', 'chaperonin', 'region'], description: 'Node type' },
        filePath: { type: 'string', description: 'For file nodes, the absolute path to open' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['type'],
    },
  },
  {
    name: 'delete_node',
    description: 'Delete a node from the canvas by ID.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'run_command',
    description: 'Run a shell command in the project directory. Returns stdout+stderr (max 4000 chars).',
    input_schema: {
      type: 'object',
      properties: {
        cmd: { type: 'string' },
        cwd: { type: 'string', description: 'Working directory (defaults to project root)' },
      },
      required: ['cmd'],
    },
  },
];

async function agentExecuteTool(name, input, context) {
  if (name === 'read_file') {
    try {
      return { ok: true, content: await fs.promises.readFile(input.path, 'utf8') };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  if (name === 'edit_file') {
    try {
      const content = await fs.promises.readFile(input.path, 'utf8');
      if (!content.includes(input.old_str)) return { ok: false, error: 'old_str not found in file' };
      return { ok: true, path: input.path, oldContent: content, newContent: content.replace(input.old_str, input.new_str) };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  if (name === 'create_node') {
    return { ok: true, action: { type: 'create', nodeType: input.type, filePath: input.filePath ?? null, x: input.x ?? 200, y: input.y ?? 200 } };
  }

  if (name === 'delete_node') {
    return { ok: true, action: { type: 'delete', id: input.id } };
  }

  if (name === 'run_command') {
    return new Promise((resolve) => {
      const cwd = input.cwd ?? context.rootPath ?? process.cwd();
      const proc = spawn('sh', ['-c', input.cmd], { cwd, stdio: 'pipe' });
      let out = '';
      proc.stdout.on('data', d => { out += d; });
      proc.stderr.on('data', d => { out += d; });
      proc.on('close', code => resolve({ ok: true, output: out.slice(0, 4000), exitCode: code }));
      proc.on('error', e => resolve({ ok: false, error: e.message }));
      setTimeout(() => { proc.kill(); resolve({ ok: false, error: 'timeout after 30s' }); }, 30000);
    });
  }

  return { ok: false, error: 'unknown tool: ' + name };
}

let _agentAbort = null;

const PROVIDERS = {
  anthropic: () => require('./lib/agent/providers/anthropic.js'),
  openai:    () => require('./lib/agent/providers/openai.js'),
  gemini:    () => require('./lib/agent/providers/gemini.js'),
  ollama:    () => require('./lib/agent/providers/ollama.js'),
};

ipcMain.on('agent:run', async (_e, { prompt, context }) => {
  const agentConfig = context?.agentConfig ?? {};
  if (_agentAbort) _agentAbort.abort();
  _agentAbort = new AbortController();
  const signal = _agentAbort.signal;

  const send = (type, payload = {}) => mainWin?.webContents.send('agent:event', { type, ...payload });

  const onToolCall = async (name, input) => {
    send('tool-start', { name, input });
    const result = await agentExecuteTool(name, input, context);
    send('tool-result', { name, result });
    if (name === 'edit_file' && result.ok) send('file-draft', result);
    if ((name === 'create_node' || name === 'delete_node') && result.ok) send('canvas-action', result.action);
    return result;
  };

  try {
    const provider = PROVIDERS[agentConfig?.provider ?? 'anthropic']?.();
    if (!provider) { send('error', { message: 'Unknown provider: ' + agentConfig?.provider }); return; }
    await provider.run({ prompt, context, tools: AGENT_TOOL_DEFS, agentConfig: agentConfig ?? {}, onText: t => send('chunk', { text: t }), onToolCall, signal });
    send('done');
  } catch (e) {
    if (e.name !== 'AbortError') send('error', { message: e.message });
  }
});

ipcMain.handle('agent:stop', () => { _agentAbort?.abort(); _agentAbort = null; });

ipcMain.handle('agent:list-models', async (_e, agentConfig) => {
  const cfg = agentConfig ?? {};
  if (cfg.provider === 'ollama') {
    try {
      const base = (cfg.ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '');
      const res = await fetch(`${base}/api/tags`);
      const data = await res.json();
      return (data.models ?? []).map(m => m.name);
    } catch { return []; }
  }
  const LISTS = {
    anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'],
    gemini:    ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  };
  return LISTS[cfg.provider] ?? [];
});

ipcMain.handle('agent:repair', async (_e, { rootPath, lang, code, model }) => {
  let cfg = {};
  try { cfg = JSON.parse(await fs.promises.readFile(path.join(rootPath, '.graphite', 'config.json'), 'utf8')); } catch {}
  const agentConfig = { ...(cfg.agent ?? {}), ...(model ? { model } : {}) };
  let provider;
  try { provider = PROVIDERS[agentConfig.provider ?? 'anthropic']?.(); } catch { return null; }
  if (!provider) return null;
  let result = '';
  const prompt = `Fix the syntax errors in this ${lang} code. These are transient errors from real-time collaborative editing — another user's in-progress keystrokes created an intermediate invalid state. Preserve all developers' intent exactly. Return ONLY the fixed code with no explanation or markdown fences.\n\n${code}`;
  try {
    await provider.run({
      prompt,
      context: { agentConfig, rootPath, filePaths: [] },
      tools: [],
      agentConfig,
      onText: t => { result += t; },
      onToolCall: async () => null,
      signal: new AbortController().signal,
    });
    return result.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim() || null;
  } catch { return null; }
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
