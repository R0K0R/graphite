import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PrefsContext } from './ThemeContext.js';
import ReactFlow, {
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
import StatusBar from './components/StatusBar.jsx';
import PrefsPopup from './components/PrefsPopup.jsx';
import { CATEGORIES } from './data/modules.js';
import { computeAllRegionBounds } from './utils/regionBounds.js';
import { useLiveRef, centerViewport, isRectFullyVisible } from './utils/viewport.js';
import { buildNodesFromTree } from './utils/treeLayout.js';
import { mkScriptNode, mkRegion, mkFileNode } from './utils/nodeFactories.js';
import { usePrefsState } from './hooks/usePrefsState.js';
import { T_FW, T_FH, FOCUS_FILL } from './utils/canvasConstants.js';

const NODE_TYPES = {
  chaperonin: ChaperonNode,
  region: RegionNode,
  file: FileNode,
};

export default function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [fileTree, setFileTree] = useState(null);
  const [rootPath, setRootPath] = useState(null);
  const [showPrefs, setShowPrefs]           = useState(false);
  const [hoveredNodeId, setHoveredNodeId]   = useState(null);
  const [focusedNodeId, setFocusedNodeId]   = useState(null);

  const {
    theme, setTheme,
    regionAlpha, setRegionAlpha,
    hoverScale, setHoverScale,
    dimScale, setDimScale,
    hoverDelay, setHoverDelay,
    focusZoom, setFocusZoom,
  } = usePrefsState();

  const nodesRef        = useRef(nodes);
  const metaTimer       = useRef(null);
  const hoverTimer      = useRef(null);
  const regionBoundsRef = useRef(new Map());
  const { fitView, getViewport, setViewport } = useReactFlow();

  const hoveredNodeRef = useLiveRef(hoveredNodeId);
  const focusedNodeRef = useLiveRef(focusedNodeId);
  const focusZoomRef   = useLiveRef(focusZoom);
  const fitViewRef     = useLiveRef(fitView);
  const setViewportRef = useLiveRef(setViewport);

  // Alt+F: expand node to fill viewport; toggle restores
  useEffect(() => {
    function onKeyDown(e) {
      if (!e.altKey || e.key.toLowerCase() !== 'f') return;
      e.preventDefault();
      e.stopPropagation();
      const fid = focusedNodeRef.current;
      const hid = hoveredNodeRef.current;
      if (fid) {
        setNodes(nds => nds.map(n => {
          if (n.id !== fid) return n;
          const { _savedStyle, expanded: _, ...cleanData } = n.data;
          return { ...n, style: _savedStyle ?? undefined, data: cleanData };
        }));
        setFocusedNodeId(null);
        setTimeout(() => fitViewRef.current({ padding: 0.3, duration: 350 }), 80);
      } else if (hid) {
        const node = nodesRef.current.find(n => n.id === hid);
        if (!node) return;
        setHoveredNodeId(null);
        setFocusedNodeId(hid);

        const canvas = document.querySelector('.ide-canvas');
        const { width: cw, height: ch } = canvas?.getBoundingClientRect() ?? { width: 1200, height: 800 };
        const targetZoom = focusZoomRef.current / 100;

        if (node.type !== 'region') {
          const nodeW = Math.round(cw * FOCUS_FILL / targetZoom);
          const nodeH = Math.round(ch * FOCUS_FILL / targetZoom);
          setNodes(nds => nds.map(n => {
            if (n.id !== hid) return n;
            return {
              ...n,
              style: { ...n.style, width: nodeW, height: nodeH },
              data: { ...n.data, expanded: true, _savedStyle: n.style ?? null },
            };
          }));
          setTimeout(() => {
            const fresh = nodesRef.current.find(n => n.id === hid);
            if (!fresh) return;
            centerViewport(setViewportRef.current, fresh.position.x + nodeW / 2, fresh.position.y + nodeH / 2, targetZoom, cw, ch);
          }, 80);
        } else {
          const b = regionBoundsRef.current.get(hid);
          if (!b) return;
          centerViewport(setViewportRef.current, b.position.x + b.width / 2, b.position.y + b.height / 2, targetZoom, cw, ch);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

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

  const { childParentMap, nodeById } = useMemo(() => {
    const childParentMap = new Map();
    const nodeById = new Map();
    for (const n of nodes) {
      nodeById.set(n.id, n);
      if (n.type === 'region') {
        for (const cid of n.data?.children ?? []) childParentMap.set(cid, n.id);
      }
    }
    return { childParentMap, nodeById };
  }, [nodes]);

  function isHiddenByCollapse(nodeId) {
    let cur = nodeId;
    const visited = new Set();
    while (childParentMap.has(cur)) {
      if (visited.has(cur)) break;
      visited.add(cur);
      const parentId = childParentMap.get(cur);
      if (nodeById.get(parentId)?.data?.collapsed) return true;
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
    const isRegion = nodesRef.current.find(n => n.id === nodeId)?.type === 'region';
    requestAnimationFrame(() => {
      fitView({ nodes: [{ id: nodeId }], duration: 350, padding: isRegion ? 0.05 : 0.15 });
    });
  }, [fitView]);

  const removeNode = useCallback((nodeId) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node?.type === 'file' && node.data.filePath && window.electronAPI) {
      window.electronAPI.unwatchFile(node.data.filePath);
    }
    setNodes(nds => nds.filter(n => n.id !== nodeId));
  }, [setNodes]);

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
  regionBoundsRef.current = regionBounds;

  const activeId = focusedNodeId ?? hoveredNodeId;
  const magnifiedIds = new Set();
  if (activeId) {
    magnifiedIds.add(activeId);
    const queue = [activeId];
    while (queue.length > 0) {
      const id = queue.shift();
      for (const cid of nodeById.get(id)?.data?.children ?? []) {
        magnifiedIds.add(cid);
        queue.push(cid);
      }
    }
  }

  const scaledPositions = new Map();
  if (!focusedNodeId && hoveredNodeId && magnifiedIds.size > 0) {
    const leaves = visibleNodes.filter(n => magnifiedIds.has(n.id) && n.type !== 'region');
    if (leaves.length > 0) {
      const cx = leaves.reduce((s, n) => s + n.position.x + T_FW / 2, 0) / leaves.length;
      const cy = leaves.reduce((s, n) => s + n.position.y + T_FH / 2, 0) / leaves.length;
      for (const n of leaves) {
        scaledPositions.set(n.id, {
          x: cx + (n.position.x + T_FW / 2 - cx) * hoverScale - T_FW / 2,
          y: cy + (n.position.y + T_FH / 2 - cy) * hoverScale - T_FH / 2,
        });
      }
    }
  }

  const activeRegionBounds = scaledPositions.size > 0
    ? computeAllRegionBounds(nodes.map(n => { const sp = scaledPositions.get(n.id); return sp ? { ...n, position: sp } : n; }))
    : regionBounds;

  const nodesWithCallbacks = visibleNodes.map(node => {
    const isMagnified = magnifiedIds.has(node.id);
    const isRegion = node.type === 'region';

    const bounds = isRegion
      ? (isMagnified ? activeRegionBounds.get(node.id) : regionBounds.get(node.id)) ?? regionBounds.get(node.id)
      : null;
    const position = isRegion
      ? (bounds?.position ?? node.position)
      : (scaledPositions.get(node.id) ?? node.position);
    const style = bounds
      ? { ...node.style, width: bounds.width, height: bounds.height }
      : node.style;

    return {
      ...node,
      position,
      style,
      draggable: !isRegion,
      className: isMagnified ? (focusedNodeId ? 'node-state-focused' : 'node-state-hovered') : '',
      zIndex: isRegion ? 0 : (isMagnified ? 200 : 10),
      data: {
        ...node.data,
        ...(node.type === 'chaperonin' ? { onChangeParam } : {}),
        ...(isRegion                   ? { onToggleCollapse: toggleRegionCollapse, onLinkDir } : {}),
        ...(node.type === 'file'       ? { onContentChange, onFilePicked } : {}),
      },
    };
  });

  return (
    <PrefsContext.Provider value={{ theme, regionAlpha, hoverScale, dimScale, hoverDelay, focusZoom }}>
    <div className="ide-shell">
      <div className="ide-titlebar">
        <button className="titlebar-btn" onClick={openRootFolder} title="Open Folder">Open</button>
        <div className="titlebar-sep" />
        <button className="titlebar-btn" onClick={addFileNode}   title="New File Node">File</button>
        <button className="titlebar-btn" onClick={addScriptNode} title="New Script Node">Script</button>
        <button className="titlebar-btn" onClick={addRegionNode} title="New Region">Region</button>
        <div className="titlebar-sep" />
        <button className="titlebar-btn titlebar-theme-btn" onClick={() => setShowPrefs(true)} title="Preferences">Prefs</button>
        {rootPath && <span className="titlebar-path">{rootPath}</span>}
      </div>

      <Sidebar tree={fileTree} rootPath={rootPath} onFocusNode={focusNode} />

      <div className="ide-canvas">
        <ReactFlow
          nodes={nodesWithCallbacks}
          onNodesChange={handleNodesChange}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode={['Delete', 'Backspace']}
          proOptions={{ hideAttribution: true }}
          onNodeMouseEnter={(_, node) => {
            clearTimeout(hoverTimer.current);
            hoverTimer.current = setTimeout(() => {
              if (node.type === 'region') {
                const b = regionBoundsRef.current.get(node.id);
                if (!b) return;
                const { x: vpX, y: vpY, zoom } = getViewport();
                const canvas = document.querySelector('.ide-canvas');
                if (!canvas) return;
                const { width: cw, height: ch } = canvas.getBoundingClientRect();
                if (isRectFullyVisible(b, vpX, vpY, zoom, cw, ch)) setHoveredNodeId(node.id);
              } else {
                setHoveredNodeId(node.id);
              }
            }, hoverDelay);
          }}
          onNodeMouseLeave={() => { clearTimeout(hoverTimer.current); setHoveredNodeId(null); }}
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

      <PrefsPopup
        open={showPrefs}
        onClose={() => setShowPrefs(false)}
        theme={theme}        onTheme={setTheme}
        regionAlpha={regionAlpha} onAlpha={setRegionAlpha}
        hoverScale={hoverScale}   onHoverScale={setHoverScale}
        dimScale={dimScale}       onDimScale={setDimScale}
        hoverDelay={hoverDelay}   onHoverDelay={setHoverDelay}
        focusZoom={focusZoom}     onFocusZoom={setFocusZoom}
      />
    </div>
    </PrefsContext.Provider>
  );
}
