// Singleton LSP client — lives in the renderer process.
// Routes JSON-RPC messages between Monaco and language servers via Electron IPC.

const pending      = new Map();   // id → { resolve, reject }
const diagHandlers = new Map();   // uri → Set<fn>
const openDocs     = new Map();   // uri → { key, version }
const shadows      = new Map();   // uri → shadowContent

export function setShadow(uri, content) { shadows.set(uri, content); }
export function clearShadow(uri) { shadows.delete(uri); }
const initialized  = new Set();   // keys with completed handshake
const starting     = new Map();   // key → Promise (dedup concurrent starts)

let nextId = 1;
let removeListener = null;

function ensureListener() {
  if (removeListener || !window.electronAPI?.onLspMessage) return;
  removeListener = window.electronAPI.onLspMessage((key, msg) => {
    if (msg.method === 'textDocument/publishDiagnostics') {
      const { uri, diagnostics } = msg.params;
      diagHandlers.get(uri)?.forEach(h => h(diagnostics));
    } else if (msg.id != null) {
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); }
    }
  });

  window.electronAPI.onLspStderr?.(() => {});
}

function request(key, method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    window.electronAPI.lspSend(key, { jsonrpc: '2.0', id, method, params });
  });
}

function notify(key, method, params) {
  window.electronAPI.lspSend(key, { jsonrpc: '2.0', method, params });
}

export async function startServer(rootPath, languageId) {
  if (!window.electronAPI?.lspStart) {
    console.warn('[LSP] electronAPI.lspStart not available');
    return null;
  }
  ensureListener();

  const key = `${rootPath}|${languageId}`;
  if (initialized.has(key)) return key;
  if (starting.has(key)) return starting.get(key);

  const promise = (async () => {
    const result = await window.electronAPI.lspStart(rootPath, languageId);
    if (!result.ok) { starting.delete(key); return null; }

    try {
      const caps = await request(key, 'initialize', {
        processId: null,
        rootUri: 'file://' + rootPath,
        capabilities: {
          textDocument: {
            synchronization: { willSave: false, didSave: false, willSaveWaitUntil: false },
            completion: {
              completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'] },
              contextSupport: true,
            },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            publishDiagnostics: { relatedInformation: false },
          },
          workspace: { workspaceFolders: false, configuration: false },
        },
        workspaceFolders: null,
      });
      void caps;
      notify(key, 'initialized', {});
      initialized.add(key);
    } catch (e) {
      console.error('[LSP] initialize failed for', key, e);
      starting.delete(key);
      return null;
    }
    starting.delete(key);
    return key;
  })();

  starting.set(key, promise);
  return promise;
}

export function openDocument(key, uri, languageId, text) {
  if (!initialized.has(key) || openDocs.has(uri)) return;
  openDocs.set(uri, { key, version: 1 });
  notify(key, 'textDocument/didOpen', {
    textDocument: { uri, languageId, version: 1, text },
  });
}

export function changeDocument(uri, text) {
  const doc = openDocs.get(uri);
  if (!doc) return;
  doc.version++;
  notify(doc.key, 'textDocument/didChange', {
    textDocument: { uri, version: doc.version },
    contentChanges: [{ text: shadows.get(uri) ?? text }],
  });
}

export function closeDocument(uri) {
  const doc = openDocs.get(uri);
  if (!doc) return;
  notify(doc.key, 'textDocument/didClose', { textDocument: { uri } });
  openDocs.delete(uri);
}

export async function getCompletion(uri, position) {
  const doc = openDocs.get(uri);
  if (!doc) return null;
  try {
    return await request(doc.key, 'textDocument/completion', {
      textDocument: { uri },
      position,
      context: { triggerKind: 1 },
    });
  } catch { return null; }
}

export async function getHover(uri, position) {
  const doc = openDocs.get(uri);
  if (!doc) return null;
  try {
    return await request(doc.key, 'textDocument/hover', {
      textDocument: { uri },
      position,
    });
  } catch { return null; }
}

export async function getDocumentLinks(uri) {
  const doc = openDocs.get(uri);
  if (!doc) return null;
  try {
    return await request(doc.key, 'textDocument/documentLink', { textDocument: { uri } });
  } catch { return null; }
}

export async function getDocumentSymbols(uri) {
  const doc = openDocs.get(uri);
  if (!doc) return null;
  try {
    return await request(doc.key, 'textDocument/documentSymbol', { textDocument: { uri } });
  } catch { return null; }
}

export function onDiagnostics(uri, handler) {
  if (!diagHandlers.has(uri)) diagHandlers.set(uri, new Set());
  diagHandlers.get(uri).add(handler);
  return () => diagHandlers.get(uri)?.delete(handler);
}
