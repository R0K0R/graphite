const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

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
  if (fs.existsSync(distIndex)) {
    win.loadFile(distIndex);
    return;
  }
  win.loadURL('http://localhost:5173');
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

// --- IPC: directory tree scanner ---

const IGNORED = new Set([
  '.git', '.svn', '.hg', 'node_modules', '__pycache__', '.cache',
  'dist', 'build', '.next', '.nuxt', 'target', 'venv', '.venv',
  '.mypy_cache', '.pytest_cache', '.tox', 'coverage', '.graphite.json',
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
      children.push({ name: entry.name, path: fullPath, type: 'file' });
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

ipcMain.handle('dir:read-metadata', async (_e, dirPath) => {
  try {
    const raw = await fs.promises.readFile(path.join(dirPath, '.graphite.json'), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
});

ipcMain.handle('dir:write-metadata', (_e, dirPath, metadata) =>
  fs.promises.writeFile(
    path.join(dirPath, '.graphite.json'),
    JSON.stringify(metadata, null, 2),
    'utf8'
  )
);

// --- App lifecycle ---

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
