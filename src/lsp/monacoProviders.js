import { getCompletion, getHover } from './LspClient.js';

const registered = new Set();

// LSP CompletionItemKind → Monaco CompletionItemKind
const COMPLETION_KIND = {
  1: 17, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5,
  8: 7, 9: 8, 10: 9, 11: 10, 12: 11, 13: 12,
  14: 13, 15: 14, 16: 15, 17: 16, 18: 17,
};

// LSP DiagnosticSeverity → Monaco MarkerSeverity
const DIAG_SEVERITY = { 1: 8, 2: 4, 3: 2, 4: 1 };

export function registerProviders(monaco, languageId) {
  if (registered.has(languageId)) return;
  registered.add(languageId);

  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.', ':', '"', "'", '/', '@', '<'],
    provideCompletionItems: async (model, position) => {
      const uri = model.uri.toString();
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: position.column,
      };

      const result = await getCompletion(uri, {
        line: position.lineNumber - 1,
        character: position.column - 1,
      });
      if (!result) return { suggestions: [] };

      const items = Array.isArray(result) ? result : (result.items ?? []);
      return {
        incomplete: result.isIncomplete ?? false,
        suggestions: items.map(item => ({
          label: item.label,
          kind: COMPLETION_KIND[item.kind] ?? 17,
          detail: item.detail ?? '',
          documentation: item.documentation
            ? { value: typeof item.documentation === 'object' ? (item.documentation.value ?? '') : item.documentation, isTrusted: false }
            : undefined,
          insertText: item.textEdit?.newText ?? item.insertText ?? item.label,
          insertTextRules: item.insertTextFormat === 2
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          range,
          sortText: item.sortText,
          filterText: item.filterText,
          preselect: item.preselect ?? false,
          commitCharacters: item.commitCharacters,
          tags: item.deprecated ? [1] : undefined,
        })),
      };
    },
  });

  monaco.languages.registerHoverProvider(languageId, {
    provideHover: async (model, position) => {
      const uri = model.uri.toString();
      const result = await getHover(uri, {
        line: position.lineNumber - 1,
        character: position.column - 1,
      });
      if (!result?.contents) return null;

      const raw = Array.isArray(result.contents) ? result.contents : [result.contents];
      const contents = raw
        .map(c => ({ value: typeof c === 'string' ? c : (c.value ?? '') }))
        .filter(c => c.value);

      return contents.length ? { contents } : null;
    },
  });
}

export function applyDiagnostics(monaco, model, diagnostics) {
  monaco.editor.setModelMarkers(model, 'lsp', diagnostics.map(d => ({
    severity: DIAG_SEVERITY[d.severity] ?? 8,
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    message: d.message,
    source: d.source,
    code: d.code != null ? String(d.code) : undefined,
  })));
}
import { getCompletion, getHover } from './LspClient.js';

const registered = new Set();

// LSP CompletionItemKind → Monaco CompletionItemKind
const COMPLETION_KIND = {
  1: 17, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5,
  8: 7, 9: 8, 10: 9, 11: 10, 12: 11, 13: 12,
  14: 13, 15: 14, 16: 15, 17: 16, 18: 17,
};

// LSP DiagnosticSeverity → Monaco MarkerSeverity
const DIAG_SEVERITY = { 1: 8, 2: 4, 3: 2, 4: 1 };

export function registerProviders(monaco, languageId) {
  if (registered.has(languageId)) return;
  registered.add(languageId);

  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.', ':', '"', "'", '/', '@', '<'],
    provideCompletionItems: async (model, position) => {
      const uri = model.uri.toString();
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: position.column,
      };

      const result = await getCompletion(uri, {
        line: position.lineNumber - 1,
        character: position.column - 1,
      });
      if (!result) return { suggestions: [] };

      const items = Array.isArray(result) ? result : (result.items ?? []);
      return {
        incomplete: result.isIncomplete ?? false,
        suggestions: items.map(item => ({
          label: item.label,
          kind: COMPLETION_KIND[item.kind] ?? 17,
          detail: item.detail ?? '',
          documentation: item.documentation
            ? { value: typeof item.documentation === 'object' ? (item.documentation.value ?? '') : item.documentation, isTrusted: false }
            : undefined,
          insertText: item.textEdit?.newText ?? item.insertText ?? item.label,
          insertTextRules: item.insertTextFormat === 2
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          range,
          sortText: item.sortText,
          filterText: item.filterText,
          preselect: item.preselect ?? false,
          commitCharacters: item.commitCharacters,
          tags: item.deprecated ? [1] : undefined,
        })),
      };
    },
  });

  monaco.languages.registerHoverProvider(languageId, {
    provideHover: async (model, position) => {
      const uri = model.uri.toString();
      const result = await getHover(uri, {
        line: position.lineNumber - 1,
        character: position.column - 1,
      });
      if (!result?.contents) return null;

      const raw = Array.isArray(result.contents) ? result.contents : [result.contents];
      const contents = raw
        .map(c => ({ value: typeof c === 'string' ? c : (c.value ?? '') }))
        .filter(c => c.value);

      return contents.length ? { contents } : null;
    },
  });
}

export function applyDiagnostics(monaco, model, diagnostics) {
  monaco.editor.setModelMarkers(model, 'lsp', diagnostics.map(d => ({
    severity: DIAG_SEVERITY[d.severity] ?? 8,
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    message: d.message,
    source: d.source,
    code: d.code != null ? String(d.code) : undefined,
  })));
}
