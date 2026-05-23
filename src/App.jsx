import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from 'reactflow';

import ChaperonNode from './components/ChaperonNode.jsx';
import RegionNode from './components/RegionNode.jsx';
import FileNode from './components/FileNode.jsx';
import Sidebar from './components/Sidebar.jsx';
import TabBar from './components/TabBar.jsx';
import StatusBar from './components/StatusBar.jsx';
import { MODULES, CATEGORIES } from './data/modules.js';
import { annularBinPack } from './utils/layout.js';

const NODE_TYPES = {
  chaperonin: ChaperonNode,
  region: RegionNode,
  file: FileNode,
};

// ---- Layout constants ----
const T_PAD = 20;
const T_HDR = 40;
const T_FW  = 380;
const T_FH  = 380;

// ---- Derived region bounds (pure, module-level) ----

function computeAllRegionBounds(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const memo = new Map();

  function process(region) {
    if (memo.has(region.id)) return memo.get(region.id);

    // Collapsed: use saved bounds at header height only
    if (region.data?.collapsed) {
      const saved = region.data?.savedBounds;
      if (saved) {
        const b = { position: saved.position, width: saved.width, height: T_HDR };
        memo.set(region.id, b);
        return b;
      }
    }

    const childIds = region.data?.children ?? [];
    const children = childIds.map(id => byId.get(id)).filter(Boolean);

    if (!children.length) {
      const b = {
        position: region.position,
        width: Math.max(region.style?.width ?? 220, 220),
        height: Math.max(region.style?.height ?? 100, 100),
      };
      memo.set(region.id, b);
      return b;
    }

    const rects = children.map(child => {
      if (child.type === 'region') {
        const b = process(child);
        return b ? { x: b.position.x, y: b.position.y, w: b.width, h: b.height } : null;
      }
      return { x: child.position.x, y: child.position.y, w: T_FW, h: T_FH };
    }).filter(Boolean);

    if (!rects.length) { memo.set(region.id, null); return null; }

    const minX = Math.min(...rects.map(r => r.x)) - T_PAD;
    const minY = Math.min(...rects.map(r => r.y)) - T_HDR - T_PAD;
    const maxX = Math.max(...rects.map(r => r.x + r.w)) + T_PAD;
    const maxY = Math.max(...rects.map(r => r.y + r.h)) + T_PAD;

    const b = {
      position: { x: minX, y: minY },
      width: Math.max(maxX - minX, 220),
      height: Math.max(maxY - minY, 80),
    };
    memo.set(region.id, b);
    return b;
  }

  nodes.filter(n => n.type === 'region').forEach(process);
  return memo;
}

// ---- Tree → nodes (recursive, bottom-up) ----
//
// layoutSubtree returns { nodes, w, h } where every node's position is
// relative to this subtree's own origin (0, 0).  The caller offsets them
// after packing its own children.

function layoutSubtree(entry) {
  if (entry.type === 'file') {
    return {
      nodes: [{
        id: `file:${entry.path}`,
        type: 'file',
        position: { x: 0, y: 0 },
        data: { filePath: entry.path, content: '', externalChange: false },
      }],
      w: T_FW,
      h: T_FH,
    };
  }

  const children = entry.children ?? [];

  if (!children.length) {
    return {
      nodes: [{
        id: `dir:${entry.path}`,
        type: 'region',
        position: { x: 0, y: 0 },
        style: { width: 220, height: 100 },
        data: { label: entry.name, dirPath: entry.path, children: [] },
        draggable: false,
      }],
      w: 220,
      h: 100,
    };
  }

  // Recurse: each child layout has nodes at relative (0,0)
  const childResults = children.map(child => {
    const id = child.type === 'file' ? `file:${child.path}` : `dir:${child.path}`;
    return { id, child, ...layoutSubtree(child) };
  });

  // Pack children by their bounding boxes
  const packed = annularBinPack(childResults.map(cr => ({ id: cr.id, w: cr.w, h: cr.h })));
  const posMap = new Map(packed.map(p => [p.id, p]));

  const childIds = [];
  const allChildNodes = [];

  for (const cr of childResults) {
    childIds.push(cr.id);
    const pos = posMap.get(cr.id);
    // Shift into this dir's content area: (T_PAD, T_HDR + T_PAD) + packed offset
    const ox = T_PAD + pos.x;
    const oy = T_HDR + T_PAD + pos.y;
    allChildNodes.push(...cr.nodes.map(n => ({
      ...n,
      position: { x: n.position.x + ox, y: n.position.y + oy },
    })));
  }

  // Bounding box: widest/tallest packed child determines this dir's size
  const maxX = Math.max(...childResults.map(cr => posMap.get(cr.id).x + cr.w));
  const maxY = Math.max(...childResults.map(cr => posMap.get(cr.id).y + cr.h));
  const w = Math.max(maxX + T_PAD * 2, 220);
  const h = Math.max(maxY + T_HDR + T_PAD * 2, 80);

  return {
    nodes: [
      {
        id: `dir:${entry.path}`,
        type: 'region',
        position: { x: 0, y: 0 },
        style: { width: w, height: h },
        data: { label: entry.name, dirPath: entry.path, children: childIds },
        draggable: false,
      },
      ...allChildNodes,
    ],
    w,
    h,
  };
}

function buildNodesFromTree(root) {
  const children = root.children ?? [];
  if (!children.length) return [];

  const childResults = children.map(child => {
    const id = child.type === 'file' ? `file:${child.path}` : `dir:${child.path}`;
    return { id, ...layoutSubtree(child) };
  });

  const packed = annularBinPack(childResults.map(cr => ({ id: cr.id, w: cr.w, h: cr.h })));
  const posMap = new Map(packed.map(p => [p.id, p]));

  const allNodes = [];
  for (const cr of childResults) {
    const pos = posMap.get(cr.id);
    allNodes.push(...cr.nodes.map(n => ({
      ...n,
      position: { x: n.position.x + pos.x + 100, y: n.position.y + pos.y + 100 },
    })));
  }
  return allNodes;
}

// ---- Manual node factories ----

function mkScriptNode(id, position) {
  const mod = MODULES['SCRIPT'];
  const defaultParams = Object.fromEntries(mod.params.map(p => [p.id, p.default]));
  return {
    id, type: 'chaperonin', position,
    data: { module: mod, varName: id, params: defaultParams, status: 'idle', progress: null },
  };
}

function mkRegion(id, label, position) {
  return {
    id, type: 'region', position,
    draggable: false,
    style: { width: 300, height: 200 },
    data: { label, dirPath: null, children: [] },
  };
}

function mkFileNode(id, position) {
  return {
    id, type: 'file', position,
    data: { filePath: null, content: '', externalChange: false },
  };
}

// ---- Main canvas component ----

function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [fileTree, setFileTree] = useState(null);
  const [rootPath, setRootPath] = useState(null);
  const [activeFileId, setActiveFileId] = useState(null);
  const nodesRef = useRef(nodes);
  const metaTimer = useRef(null);
  const { fitView } = useReactFlow();

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // Global file-changed listener
  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onFileChanged(({ filePath, content }) => {
      setNodes(nds => nds.map(n =>
        n.type === 'file' && n.data.filePath === filePath
          ? { ...n, data: { ...n.data, externalChange: true, _diskContent: content } }
          : n
      ));
    });
  }, [setNodes]);

  // Child→parent map for collapse visibility (rebuilt when node list changes)
  const childParentMap = useMemo(() => {
    const map = new Map();
    nodes.filter(n => n.type === 'region').forEach(r => {
      (r.data?.children ?? []).forEach(cid => map.set(cid, r.id));
    });
    return map;
  }, [nodes]);

  function isHiddenByCollapse(nodeId) {
    let cur = nodeId;
    const visited = new Set();
    while (childParentMap.has(cur)) {
      if (visited.has(cur)) break;
      visited.add(cur);
      const parentId = childParentMap.get(cur);
      const parent = nodesRef.current.find(n => n.id === parentId);
      if (parent?.data?.collapsed) return true;
      cur = parentId;
    }
    return false;
  }

  // ---- Callbacks ----

  const onChangeParam = useCallback((nodeId, paramId, value) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, [paramId]: value } } } : n
    ));
  }, [setNodes]);

  const onContentChange = useCallback((nodeId, content) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, content, externalChange: false, _diskContent: undefined } }
        : n
    ));
  }, [setNodes]);

  const onFilePicked = useCallback((nodeId) => {
    if (!window.electronAPI) return;
    window.electronAPI.openFilePicker().then(filePath => {
      if (!filePath) return;
      window.electronAPI.readFile(filePath).then(content => {
        setNodes(nds => nds.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, filePath, content, externalChange: false } } : n
        ));
        window.electronAPI.watchFile(filePath);
      });
    });
  }, [setNodes]);

  const toggleRegionCollapse = useCallback((regionId) => {
    setNodes(nds => {
      const bounds = computeAllRegionBounds(nds);
      return nds.map(n => {
        if (n.id !== regionId || n.type !== 'region') return n;
        const collapsed = !(n.data?.collapsed ?? false);
        if (collapsed) {
          const b = bounds.get(regionId);
          return { ...n, data: { ...n.data, collapsed, savedBounds: b ?? null } };
        }
        return { ...n, data: { ...n.data, collapsed } };
      });
    });
  }, []);

  const onLinkDir = useCallback((regionId) => {
    if (!window.electronAPI) return;
    window.electronAPI.openDirPicker().then(dirPath => {
      if (!dirPath) return;
      setNodes(nds => nds.map(n =>
        n.id === regionId ? { ...n, data: { ...n.data, dirPath } } : n
      ));
    });
  }, [setNodes]);

  const focusNode = useCallback((nodeId) => {
    setActiveFileId(nodeId);
    requestAnimationFrame(() => {
      fitView({ nodes: [{ id: nodeId }], duration: 400, padding: 0.4 });
    });
  }, [fitView]);

  const removeNode = useCallback((nodeId) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node?.type === 'file' && node.data.filePath && window.electronAPI) {
      window.electronAPI.unwatchFile(node.data.filePath);
    }
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setActiveFileId(prev => prev === nodeId ? null : prev);
  }, [setNodes]);

  // ---- Open root folder ----

  const openRootFolder = useCallback(() => {
    if (!window.electronAPI) return;
    nodesRef.current.forEach(n => {
      if (n.type === 'file' && n.data.filePath) window.electronAPI.unwatchFile(n.data.filePath);
    });
    window.electronAPI.openDirPicker().then(dirPath => {
      if (!dirPath) return;
      setRootPath(dirPath);
      window.electronAPI.readTree(dirPath).then(tree => {
        if (!tree) return;
        setFileTree(tree);
        setNodes(buildNodesFromTree(tree));
      });
    });
  }, [setNodes]);

  // ---- Add node actions ----

  const addScriptNode = useCallback(() => {
    const id = `script_${Date.now()}`;
    setNodes(nds => [...nds, mkScriptNode(id, { x: 200, y: 200 })]);
  }, [setNodes]);

  const addRegionNode = useCallback(() => {
    const id = `region_${Date.now()}`;
    const count = nodes.filter(n => n.type === 'region').length + 1;
    setNodes(nds => [...nds, mkRegion(id, `Region ${count}`, { x: 200, y: 200 })]);
  }, [nodes, setNodes]);

  const addFileNode = useCallback(() => {
    const id = `file_${Date.now()}`;
    setNodes(nds => [...nds, mkFileNode(id, { x: 200, y: 200 })]);
  }, [setNodes]);

  // ---- onNodesChange: deletion cleanup + metadata debounce ----

  const handleNodesChange = useCallback((changes) => {
    changes.forEach(c => {
      if (c.type === 'remove') {
        const node = nodesRef.current.find(n => n.id === c.id);
        if (node?.type === 'file' && node.data.filePath && window.electronAPI) {
          window.electronAPI.unwatchFile(node.data.filePath);
        }
      }
    });
    onNodesChange(changes);

    clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(() => {
      const nds = nodesRef.current;
      const bounds = computeAllRegionBounds(nds);
      nds.filter(n => n.type === 'region' && n.data?.dirPath).forEach(region => {
        const childIds = region.data?.children ?? [];
        const b = bounds.get(region.id);
        const metadata = {
          version: 1,
          regionId: region.id,
          dirPath: region.data.dirPath,
          position: b?.position,
          width: b?.width,
          height: b?.height,
          nodes: childIds.map(cid => {
            const n = nds.find(nd => nd.id === cid);
            if (!n) return null;
            const nb = n.type === 'region' ? bounds.get(cid) : null;
            return {
              id: cid,
              x: nb ? nb.position.x : n.position.x,
              y: nb ? nb.position.y : n.position.y,
            };
          }).filter(Boolean),
        };
        window.electronAPI?.writeMetadata(region.data.dirPath, metadata);
      });
    }, 800);
  }, [onNodesChange]);

  // ---- Render ----

  const visibleNodes = nodes.filter(n => !isHiddenByCollapse(n.id));

  const regionBounds = computeAllRegionBounds(nodes);

  const nodesWithCallbacks = visibleNodes.map(node => {
    const bounds = regionBounds.get(node.id);
    return {
      ...node,
      ...(bounds ? {
        position: bounds.position,
        style: { ...node.style, width: bounds.width, height: bounds.height },
      } : {}),
      draggable: node.type !== 'region',
      data: {
        ...node.data,
        ...(node.type === 'chaperonin' ? { onChangeParam } : {}),
        ...(node.type === 'region' ? { onToggleCollapse: toggleRegionCollapse, onLinkDir } : {}),
        ...(node.type === 'file' ? { onContentChange, onFilePicked } : {}),
      },
    };
  });

  const openFiles = nodes
    .filter(n => n.type === 'file' && n.data.filePath)
    .map(n => ({
      id: n.id,
      label: n.data.filePath.slice(n.data.filePath.lastIndexOf('/') + 1),
      filePath: n.data.filePath,
    }));

  return (
    <div className="ide-shell">
      {/* Title bar */}
      <div className="ide-titlebar">
        <button className="titlebar-btn" onClick={openRootFolder} title="Open Folder">
          🗂
        </button>
        <div className="titlebar-sep" />
        <button className="titlebar-btn" onClick={addFileNode} title="New File Node">📄</button>
        <button className="titlebar-btn" onClick={addScriptNode} title="New Script Node">⚡</button>
        <button className="titlebar-btn" onClick={addRegionNode} title="New Region">📁</button>
        {rootPath && <span className="titlebar-path">{rootPath}</span>}
      </div>

      {/* Sidebar */}
      <Sidebar tree={fileTree} rootPath={rootPath} onFocusNode={focusNode} />

      {/* Tab bar */}
      <TabBar
        tabs={openFiles}
        activeId={activeFileId}
        onSelect={focusNode}
        onClose={removeNode}
      />

      {/* Canvas */}
      <div className="ide-canvas">
        <ReactFlow
          nodes={nodesWithCallbacks}
          onNodesChange={handleNodesChange}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode={['Delete', 'Backspace']}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            if (node.type === 'file') setActiveFileId(node.id);
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a2235" />
          <Controls />
          <MiniMap
            nodeColor={n => {
              if (n.type === 'region') return '#1e2535';
              if (n.type === 'file') return '#3b82f6';
              const cat = n.data?.module?.category;
              return cat ? (CATEGORIES[cat]?.color || '#334155') : '#334155';
            }}
            maskColor="rgba(13,17,23,0.75)"
          />
        </ReactFlow>
      </div>

      <StatusBar rootPath={rootPath} nodeCount={nodes.length} />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
