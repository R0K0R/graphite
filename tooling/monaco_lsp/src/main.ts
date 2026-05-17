// Import ordering matters for monaco-vscode-api initialization.
import '@codingame/monaco-vscode-standalone-languages';
import '@codingame/monaco-vscode-standalone-typescript-language-features';

import { LogLevel } from '@codingame/monaco-vscode-api';
import {
  RegisteredMemoryFile,
  RegisteredFileSystemProvider,
  registerFileSystemOverlay,
} from '@codingame/monaco-vscode-files-service-override';

import type { LanguageClientConfig } from 'monaco-languageclient/lcwrapper';
import { LanguageClientWrapper } from 'monaco-languageclient/lcwrapper';
import type { EditorAppConfig } from 'monaco-languageclient/editorApp';
import { EditorApp } from 'monaco-languageclient/editorApp';
import { configureDefaultWorkerFactory } from 'monaco-languageclient/workerFactory';
import type { MonacoVscodeApiConfig } from 'monaco-languageclient/vscodeApiWrapper';
import { MonacoVscodeApiWrapper } from 'monaco-languageclient/vscodeApiWrapper';

import * as vscode from 'vscode';

type FlutterBridge = {
  postMessage(message: string): void;
};

interface BootPayload {
  workspaceFs: string;
  documentFs: string;
  languageId: string;
  text: string;
  enableLsp: boolean;
  serverId: string | null;
  initializationOptions?: Record<string, unknown>;
}

declare global {
  interface Window {
    FlutterBridge?: FlutterBridge;
    /** Injected via Flutter `runJavaScript` once `index.html` has loaded. */
    __GRAPHITE_BOOT_B64?: string;
  }
}

function decodeUtf8Base64(value: string): string {
  const binaryString = globalThis.atob(value);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function tryReadBootFromFragment(): BootPayload | null {
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : '';
  if (!raw) {
    return null;
  }
  const decoded = decodeURIComponent(raw.replace(/\+/g, ' '));
  return JSON.parse(decoded) as BootPayload;
}

function acquireBootPayload(): Promise<BootPayload> {
  const cached = tryReadBootFromFragment();
  if (cached) {
    // #region agent log
    fetch('http://127.0.0.1:7685/ingest/e0d2c76d-d3c6-4f5e-8e93-3fc52be02b99', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'b350c7',
      },
      body: JSON.stringify({
        sessionId: 'b350c7',
        location: 'main.ts:acquireBootPayload',
        message: 'boot_from_fragment',
        data: { languageId: cached.languageId, enableLsp: cached.enableLsp },
        timestamp: Date.now(),
        hypothesisId: 'H2_BOOT',
        runId: 'pre-fix',
      }),
    }).catch(() => {});
    // #endregion
    return Promise.resolve(cached);
  }

  return new Promise<BootPayload>((resolve, reject) => {
    let settled = false;
    const deadline = Date.now() + 60_000;
    let stallTicks = 0;

    const tick = (): void => {
      if (settled) {
        return;
      }
      const encoded = window.__GRAPHITE_BOOT_B64;
      if (encoded !== undefined && encoded.length > 0) {
        try {
          settled = true;
          const jsonBody = decodeUtf8Base64(encoded);
          const boot = JSON.parse(jsonBody) as BootPayload;
          // #region agent log
          fetch('http://127.0.0.1:7685/ingest/e0d2c76d-d3c6-4f5e-8e93-3fc52be02b99', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Debug-Session-Id': 'b350c7',
            },
            body: JSON.stringify({
              sessionId: 'b350c7',
              location: 'main.ts:acquireBootPayload',
              message: 'boot_poll_resolved',
              data: {
                languageId: boot.languageId,
                enableLsp: boot.enableLsp,
                textChars: boot.text.length,
                b64Chars: encoded.length,
              },
              timestamp: Date.now(),
              hypothesisId: 'H2_BOOT',
              runId: 'pre-fix',
            }),
          }).catch(() => {});
          // #endregion
          resolve(boot);
        } catch (err) {
          settled = false;
          reject(err);
        }
        return;
      }

      stallTicks += 1;
      if (stallTicks === 200) {
        // #region agent log
        fetch('http://127.0.0.1:7685/ingest/e0d2c76d-d3c6-4f5e-8e93-3fc52be02b99', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': 'b350c7',
          },
          body: JSON.stringify({
            sessionId: 'b350c7',
            location: 'main.ts:acquireBootPayload',
            message: 'boot_still_waiting',
            data: {
              hasB64: typeof window.__GRAPHITE_BOOT_B64 !== 'undefined',
              b64Chars: window.__GRAPHITE_BOOT_B64?.length ?? -1,
            },
            timestamp: Date.now(),
            hypothesisId: 'H2_BOOT',
            runId: 'pre-fix',
          }),
        }).catch(() => {});
        // #endregion
      }

      if (Date.now() >= deadline) {
        // #region agent log
        fetch('http://127.0.0.1:7685/ingest/e0d2c76d-d3c6-4f5e-8e93-3fc52be02b99', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': 'b350c7',
          },
          body: JSON.stringify({
            sessionId: 'b350c7',
            location: 'main.ts:acquireBootPayload',
            message: 'boot_poll_timeout',
            data: {},
            timestamp: Date.now(),
            hypothesisId: 'H2_BOOT',
            runId: 'pre-fix',
          }),
        }).catch(() => {});
        // #endregion
        reject(new Error('Timed out waiting for Flutter boot injection'));
        return;
      }
      window.setTimeout(tick, 16);
    };
    tick();
  });
}

async function bootstrap(): Promise<void> {
  const boot = await acquireBootPayload();
  // #region agent log
  fetch('http://127.0.0.1:7685/ingest/e0d2c76d-d3c6-4f5e-8e93-3fc52be02b99', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'b350c7',
    },
    body: JSON.stringify({
      sessionId: 'b350c7',
      location: 'main.ts:bootstrap',
      message: 'bootstrap_after_acquire',
      data: { languageId: boot.languageId, rootEl: !!document.getElementById('monaco-editor-root') },
      timestamp: Date.now(),
      hypothesisId: 'H3_BOOTSTRAP',
      runId: 'pre-fix',
    }),
  }).catch(() => {});
  // #endregion
  const documentUri = vscode.Uri.file(boot.documentFs);
  const workspaceFolderUri = vscode.Uri.file(boot.workspaceFs);

  const fileSystemProvider = new RegisteredFileSystemProvider(false);
  fileSystemProvider.registerFile(new RegisteredMemoryFile(documentUri, boot.text));
  registerFileSystemOverlay(1, fileSystemProvider);

  const vscodeApiConfig: MonacoVscodeApiConfig = {
    $type: 'extended',
    viewsConfig: {
      $type: 'EditorService',
      htmlContainer: document.getElementById('monaco-editor-root')!,
    },
    logLevel: LogLevel.Warning,
    userConfiguration: {
      json: JSON.stringify({
        'workbench.colorTheme': 'vs',
        'editor.wordBasedSuggestions': 'off',
        'editor.experimental.asyncTokenization': true,
      }),
    },
    monacoWorkerFactory: configureDefaultWorkerFactory,
  };

  const editorAppConfig: EditorAppConfig = {
    codeResources: {
      modified: {
        text: boot.text,
        uri: documentUri.path,
        enforceLanguageId: boot.languageId,
      },
    },
  };

  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let languageClientConfig: LanguageClientConfig | undefined;
  if (boot.enableLsp && boot.serverId && boot.languageId !== 'plaintext') {
    languageClientConfig = {
      languageId: boot.languageId,
      connection: {
        options: {
          $type: 'WebSocketUrl',
          url: `${wsProto}//${location.host}/lsp/${encodeURIComponent(boot.serverId)}`,
        },
      },
      clientOptions: {
        documentSelector: [boot.languageId],
        initializationOptions: boot.initializationOptions ?? {},
        workspaceFolder: {
          index: 0,
          name: 'workspace',
          uri: workspaceFolderUri,
        },
      },
    };
  }

  const apiWrapper = new MonacoVscodeApiWrapper(vscodeApiConfig);
  await apiWrapper.start();

  let lcWrapper: LanguageClientWrapper | undefined;
  if (languageClientConfig) {
    lcWrapper = new LanguageClientWrapper(languageClientConfig);
    try {
      await lcWrapper.start();
    } catch (err) {
      console.warn('[graphite-monaco-lsp] language client offline', err);
      lcWrapper = undefined;
    }
  }

  const editorApp = new EditorApp(editorAppConfig);
  await editorApp.start(document.getElementById('monaco-editor-root')!);
  // #region agent log
  fetch('http://127.0.0.1:7685/ingest/e0d2c76d-d3c6-4f5e-8e93-3fc52be02b99', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'b350c7',
    },
    body: JSON.stringify({
      sessionId: 'b350c7',
      location: 'main.ts:bootstrap',
      message: 'editor_app_started',
      data: {},
      timestamp: Date.now(),
      hypothesisId: 'H3_BOOTSTRAP',
      runId: 'pre-fix',
    }),
  }).catch(() => {});
  // #endregion

  const flutter = window.FlutterBridge;
  if (flutter) {
    const push = (): void => {
      const editor = vscode.window.activeTextEditor;
      const body = editor?.document.getText() ?? '';
      flutter.postMessage(body);
    };
    setTimeout(push, 0);
    vscode.workspace.onDidChangeTextDocument(() => {
      push();
    });
  }

  window.addEventListener(
    'pagehide',
    () => {
      void lcWrapper?.dispose();
      void editorApp.dispose?.();
      void apiWrapper.dispose?.();
    },
    { once: true },
  );
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  // #region agent log
  fetch('http://127.0.0.1:7685/ingest/e0d2c76d-d3c6-4f5e-8e93-3fc52be02b99', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'b350c7',
    },
    body: JSON.stringify({
      sessionId: 'b350c7',
      location: 'main.ts:bootstrap',
      message: 'bootstrap_failed',
      data: { error: `${err}`, rootEl: !!document.getElementById('monaco-editor-root') },
      timestamp: Date.now(),
      hypothesisId: 'H3_BOOTSTRAP',
      runId: 'pre-fix',
    }),
  }).catch(() => {});
  // #endregion
});
