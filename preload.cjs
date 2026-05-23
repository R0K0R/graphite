const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFilePicker: () => ipcRenderer.invoke('file:open-picker'),
  readFile:       (p) => ipcRenderer.invoke('file:read', p),
  writeFile:      (p, c) => ipcRenderer.invoke('file:write', p, c),
  watchFile:      (p) => ipcRenderer.invoke('file:watch', p),
  unwatchFile:    (p) => ipcRenderer.invoke('file:unwatch', p),

  openDirPicker:  () => ipcRenderer.invoke('dir:open-picker'),
  readTree:       (d) => ipcRenderer.invoke('dir:read-tree', d),
  readMetadata:   (d) => ipcRenderer.invoke('dir:read-metadata', d),
  writeMetadata:  (d, m) => ipcRenderer.invoke('dir:write-metadata', d, m),

  onFileChanged: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('file-changed', handler);
    return () => ipcRenderer.removeListener('file-changed', handler);
  },
});
