import Editor from "@monaco-editor/react";
import { Html } from "react-konva-utils";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CanvasNode } from "../types";
import { basename, useGraphiteStore } from "../store/useGraphiteStore";

function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "json":
      return "json";
    case "css":
    case "scss":
      return "scss";
    case "html":
      return "html";
    case "md":
      return "markdown";
    case "rs":
      return "rust";
    case "yaml":
    case "yml":
      return "yaml";
    default:
      return "plaintext";
  }
}

const pendingSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSave(path: string, contents: string) {
  const prev = pendingSaveTimers.get(path);
  if (prev) clearTimeout(prev);
  pendingSaveTimers.set(
    path,
    setTimeout(() => {
      pendingSaveTimers.delete(path);
      invoke("write_project_file", { path, contents }).catch((e) =>
        console.error("write_project_file", e),
      );
    }, 400),
  );
}

export function NodeEditorOverlay({ node }: { node: CanvasNode }) {
  const [content, setContent] = useState("");
  const lang = useMemo(() => languageFromPath(node.path), [node.path]);
  const patchNode = useGraphiteStore((s) => s.patchNode);
  const loadedPath = useRef<string | null>(null);

  useEffect(() => {
    loadedPath.current = node.path;
    setContent("");
    invoke<string>("read_project_file", { path: node.path })
      .then((text) => {
        if (loadedPath.current === node.path) setContent(text);
      })
      .catch((e) => console.error(e));
  }, [node.path]);

  const headerHeight = 28;

  return (
    <Html
      transform
      divProps={{
        style: {
          width: node.width,
          height: node.height,
          pointerEvents: "auto",
          boxSizing: "border-box",
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid #374151",
          background: "#111827",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <div
        style={{
          height: headerHeight,
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          color: "#e5e7eb",
          background: "#1f2937",
          cursor: "grab",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {basename(node.path)}
        </span>
        <button
          type="button"
          onClick={() => patchNode(node.id, { expanded: false })}
          style={{
            border: "none",
            background: "transparent",
            color: "#9ca3af",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          height={Math.max(node.height - headerHeight, 140)}
          theme="vs-dark"
          language={lang}
          path={node.path}
          value={content}
          onChange={(value) => {
            const next = value ?? "";
            setContent(next);
            scheduleSave(node.path, next);
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: "on",
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </Html>
  );
}
