const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFilePicker: () => ipcRenderer.invoke('file:open-picker'),
  readFile:       (p) => ipcRenderer.invoke('file:read', p),
  readFileBinary: (p) => ipcRenderer.invoke('file:read-binary', p),
  writeFile:      (p, c) => ipcRenderer.invoke('file:write', p, c),
  createFile:     (p) => ipcRenderer.invoke('file:create', p),
  moveFile:       (src, dest) => ipcRenderer.invoke('file:move', src, dest),
  watchFile:      (p) => ipcRenderer.invoke('file:watch', p),
  unwatchFile:    (p) => ipcRenderer.invoke('file:unwatch', p),

  openDirPicker:  () => ipcRenderer.invoke('dir:open-picker'),
  createDir:      (p) => ipcRenderer.invoke('dir:create', p),
  readTree:       (d) => ipcRenderer.invoke('dir:read-tree', d),
  readMetadata:   (rootPath, dirPath) => ipcRenderer.invoke('dir:read-metadata', rootPath, dirPath),
  writeMetadata:  (rootPath, dirPath, m) => ipcRenderer.invoke('dir:write-metadata', rootPath, dirPath, m),

  graphiteInitRoom:  (rootPath)         => ipcRenderer.invoke('graphite:init-room',   rootPath),
  graphiteSaveRoom:  (rootPath, code)   => ipcRenderer.invoke('graphite:save-room',   rootPath, code),
  graphiteReadConfig: (rootPath)        => ipcRenderer.invoke('graphite:read-config', rootPath),
  graphiteWriteConfig: (rootPath, cfg)  => ipcRenderer.invoke('graphite:write-config', rootPath, cfg),

  signalingStart:   ()  => ipcRenderer.invoke('signaling:start'),
  signalingStop:    ()  => ipcRenderer.invoke('signaling:stop'),
  signalingStatus:  ()  => ipcRenderer.invoke('signaling:status'),
  signalingLocalIps: () => ipcRenderer.invoke('signaling:local-ips'),

  onFileChanged: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('file-changed', handler);
    return () => ipcRenderer.removeListener('file-changed', handler);
  },

  lspStart:     (rootPath, lang) => ipcRenderer.invoke('lsp:start', rootPath, lang),
  lspStop:      (key) => ipcRenderer.invoke('lsp:stop', key),
  lspSend:      (key, msg) => ipcRenderer.send('lsp:send', key, msg),
  onLspMessage: (cb) => {
    const handler = (_e, key, msg) => cb(key, msg);
    ipcRenderer.on('lsp:message', handler);
    return () => ipcRenderer.removeListener('lsp:message', handler);
  },
  onLspStderr: (cb) => {
    const handler = (_e, lang, line) => cb(lang, line);
    ipcRenderer.on('lsp:stderr', handler);
    return () => ipcRenderer.removeListener('lsp:stderr', handler);
  },

  // VCS
  vcsInit:         (rootPath)               => ipcRenderer.invoke('vcs:init',         rootPath),
  vcsCommit:       (rootPath, update, msg)  => ipcRenderer.invoke('vcs:commit',       rootPath, update, msg),
  vcsCreateBranch: (rootPath, name, update) => ipcRenderer.invoke('vcs:create-branch',rootPath, name, update),
  vcsCheckout:     (rootPath, branch)       => ipcRenderer.invoke('vcs:checkout',     rootPath, branch),
  vcsDiff:         (rootPath, hash, update) => ipcRenderer.invoke('vcs:diff',         rootPath, hash, update),
  vcsFileAtCommit: (rootPath, filePath, hash) => ipcRenderer.invoke('vcs:file-at-commit', rootPath, filePath, hash),
  vcsLoadBlame:    (rootPath)               => ipcRenderer.invoke('vcs:load-blame',   rootPath),
  vcsGitLog:       (rootPath, n)            => ipcRenderer.invoke('vcs:git-log',      rootPath, n),
  vcsGitBranches:  (rootPath)               => ipcRenderer.invoke('vcs:git-branches', rootPath),
  vcsGitBlameFile: (rootPath, filePath)     => ipcRenderer.invoke('vcs:git-blame-file', rootPath, filePath),
  vcsMergePreview: (rootPath, srcBranch)    => ipcRenderer.invoke('vcs:merge-preview',  rootPath, srcBranch),
  vcsMergeFinalize:(rootPath, updateB64)    => ipcRenderer.invoke('vcs:merge-finalize', rootPath, updateB64),
  vcsMergeAbort:   (rootPath)               => ipcRenderer.invoke('vcs:merge-abort',    rootPath),
  onGitBranchChanged: (cb) => {
    const handler = (_e, branch) => cb(branch);
    ipcRenderer.on('vcs:git-branch-changed', handler);
    return () => ipcRenderer.removeListener('vcs:git-branch-changed', handler);
  },

  // Agent
  agentRun:        (payload) => ipcRenderer.send('agent:run', payload),
  agentStop:       ()        => ipcRenderer.invoke('agent:stop'),
  agentListModels: (cfg)     => ipcRenderer.invoke('agent:list-models', cfg),
  agentRepair:     (payload) => ipcRenderer.invoke('agent:repair', payload),
  onAgentEvent: (cb) => {
    const handler = (_e, event) => cb(event);
    ipcRenderer.on('agent:event', handler);
    return () => ipcRenderer.removeListener('agent:event', handler);
  },
});
