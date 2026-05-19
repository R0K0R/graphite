import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

type WorkerCtor = new () => Worker;

const editors = {
  json: JsonWorker as unknown as WorkerCtor,
  css: CssWorker as unknown as WorkerCtor,
  scss: CssWorker as unknown as WorkerCtor,
  less: CssWorker as unknown as WorkerCtor,
  html: HtmlWorker as unknown as WorkerCtor,
  handlebars: HtmlWorker as unknown as WorkerCtor,
  razor: HtmlWorker as unknown as WorkerCtor,
  typescript: TsWorker as unknown as WorkerCtor,
  javascript: TsWorker as unknown as WorkerCtor,
  jsx: TsWorker as unknown as WorkerCtor,
  tsx: TsWorker as unknown as WorkerCtor,
};

const EditorWorkerCtor = EditorWorker as unknown as WorkerCtor;

const globalForMonaco = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker(_moduleId: string, label: string): Worker;
  };
};

globalForMonaco.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    const ctor = editors[label as keyof typeof editors];
    if (ctor) {
      return new ctor();
    }
    return new EditorWorkerCtor();
  },
};
