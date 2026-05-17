import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Built assets are bundled into Flutter at assets/monaco_lsp/ */
export default defineConfig({
  base: './',
  plugins: [importMetaUrlPlugin],
  resolve: {
    dedupe: ['vscode', 'monaco-editor']
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [importMetaUrlPlugin]
    }
  },
  build: {
    target: 'es2022',
    outDir: path.resolve(__dirname, '../../assets/monaco_lsp'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    },
    chunkSizeWarningLimit: 8000
  }
});
