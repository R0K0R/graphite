import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PrefsContext } from './ThemeContext.js';
import ReactFlow, {
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from 'reactflow';
import { useYNodes } from './crdt/useYNodes.js';
import { initRoom, destroyProviders, getDoc, getYText, getAwareness } from './crdt/doc.js';

import ChaperonNode from './components/nodes/ScriptNode.jsx';
import RegionNode from './components/nodes/RegionNode.jsx';
import FileNode from './components/nodes/FileNode.jsx';
import Sidebar from './components/Sidebar.jsx';
import StatusBar from './components/StatusBar.jsx';
import PrefsPopup from './components/PrefsPopup.jsx';
import SessionPanel from './components/SessionPanel.jsx';
import { usePeers } from './crdt/usePeers.js';
import { CATEGORIES } from './data/modules.js';
import { computeAllRegionBounds } from './utils/regionBounds.js';
import { useLiveRef, centerViewport } from './utils/viewport.js';
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
  const [nodes, setNodes, onNodesChange] = useYNodes();
  const [fileTree, setFileTree] = useState(null);
  const [rootPath, setRootPath] = useState(null);
  const [showPrefs, setShowPrefs]           = useState(false);
  const [showSession, setShowSession]       = useState(false);
  const peers = usePeers();
  const [hoveredNodeId, setHoveredNodeId]   = useState(null);
  const [focusedNodeId, setFocusedNodeId]   = useState(null);
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [editMode, setEditMode]             = useState(false);
  const [accessStack, setAccessStack]       = useState([]); // nodeIds, most recently accessed last → highest z-index

  const {
    theme, setTheme,
    regionAlpha, setRegionAlpha,
    hoverScale, setHoverScale,
    dimScale, setDimScale,
    hoverDelay, setHoverDelay,
    focusZoom, setFocusZoom,
  } = usePrefsState();

  const [expandedNodeId, setExpandedNodeId] = useState(null);
  const [expandedDims, setExpandedDims]     = useState(null); // { width, height } — state so resize triggers re-render
  const expandSavedRef      = useRef(null);  // { style, width, height } saved before expand
  const expandedNodeIdRef   = useLiveRef(expandedNodeId); // stable ref for callbacks
  const shrinkingNodeIdRef  = useRef(null);  // blocks stale dimension events after Alt+F shrink
  const shrinkTimerRef      = useRef(null);

  // Two-phase layout: phase 1 = estimated, phase 2 = measured actual sizes
  const treeRef           = useRef(null);
  const layoutPhaseRef    = useRef(0); // 0=idle, 1=measuring, 2=done

  const nodesRef        = useRef(nodes);
  const metaTimer       = useRef(null);
  const hoverTimer      = useRef(null);
  const editBlurTimer   = useRef(null);
  const regionBoundsRef = useRef(new Map());
  const { fitView, getViewport, setViewport } = useReactFlow();

  const hoveredNodeRef = useLiveRef(hoveredNodeId);
  const focusedNodeRef = useLiveRef(focusedNodeId);
  const focusZoomRef   = useLiveRef(focusZoom);
  const fitViewRef     = useLiveRef(fitView);
  const setViewportRef = useLiveRef(setViewport);
  const editModeRef    = useLiveRef(editMode);

  const markAccessed = useCallback((nodeId) => {
    if (!nodeId) return;
    setAccessStack(prev =>
      prev[prev.length - 1] === nodeId ? prev : [...prev.filter(id => id !== nodeId), nodeId]
    );
  }, []);
  const markAccessedRef = useLiveRef(markAccessed);

  // Alt+F: expand node to fill viewport; toggle restores.
  // Expand state is purely local (never in Yjs) so Yjs roundtrips can't clobber it.
  useEffect(() => {
    function calcDims() {
      const canvas = document.querySelector('.ide-canvas');
      const { width: cw, height: ch } = canvas?.getBoundingClientRect() ?? { width: window.innerWidth, height: window.innerHeight };
      const targetZoom = focusZoomRef.current / 100;
      return {
        nodeW: Math.round(cw * FOCUS_FILL / targetZoom),
        nodeH: Math.round(ch * FOCUS_FILL / targetZoom),
        cw, ch, targetZoom,
      };
    }

    function onKeyDown(e) {
      if (!e.altKey || e.key.toLowerCase() !== 'f') return;
      e.preventDefault();
      e.stopPropagation();
      const fid = focusedNodeRef.current;
      const hid = hoveredNodeRef.current;

      if (fid) {
        const saved = expandSavedRef.current;
        shrinkingNodeIdRef.current = fid;
        clearTimeout(shrinkTimerRef.current);
        shrinkTimerRef.current = setTimeout(() => { shrinkingNodeIdRef.current = null; }, 600);
        setExpandedDims(null);
        expandSavedRef.current = null;
        setExpandedNodeId(null);
        setFocusedNodeId(null);
        setEditMode(false);
        setNodes(nds => nds.map(n => {
          if (n.id !== fid) return n;
          if (saved?.width != null) {
            const next = { ...n, width: saved.width, height: saved.height };
            if (saved.style) next.style = saved.style; else delete next.style;
            return next;
          }
          const { width: _w, height: _h, style: _s, ...rest } = n;
          return rest;
        }));
        setTimeout(() => fitViewRef.current({ padding: 0.3, duration: 350 }), 80);
      } else if (hid) {
        const node = nodesRef.current.find(n => n.id === hid);
        if (!node) return;
        if (node.type === 'region') {
          const b = regionBoundsRef.current.get(hid);
          if (!b) return;
          const { cw, ch, targetZoom } = calcDims();
          centerViewport(setViewportRef.current, b.position.x + b.width / 2, b.position.y + b.height / 2, targetZoom, cw, ch);
          return;
        }

        setHoveredNodeId(null);
        setFocusedNodeId(hid);
        markAccessedRef.current(hid);

        // Measure canvas right now — fresh every time Alt+F is pressed
        const { nodeW, nodeH, cw, ch, targetZoom } = calcDims();

        // Save original state so shrink can restore it exactly
        expandSavedRef.current = { style: node.style ?? null, width: node.width, height: node.height };
        setExpandedDims({ width: nodeW, height: nodeH });
        setExpandedNodeId(hid);

        const nodePos = node.position;
        setTimeout(() => {
          centerViewport(setViewportRef.current, nodePos.x + nodeW / 2, nodePos.y + nodeH / 2, targetZoom, cw, ch);
          setTimeout(() => {
            const ta = document.querySelector(`[data-id="${hid}"] .monaco-editor textarea`);
            if (ta) { ta.focus(); setEditMode(true); }
          }, 380);
        }, 80);
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // Recalculate expanded dimensions whenever the window is resized while a node is expanded
  useEffect(() => {
    if (!expandedNodeId) return;
    function onResize() {
      const canvas = document.querySelector('.ide-canvas');
      const { width: cw, height: ch } = canvas?.getBoundingClientRect() ?? { width: window.innerWidth, height: window.innerHeight };
      const targetZoom = focusZoomRef.current / 100;
      setExpandedDims({ width: Math.round(cw * FOCUS_FILL / targetZoom), height: Math.round(ch * FOCUS_FILL / targetZoom) });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [expandedNodeId]);

  // ESC exits edit mode
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && editModeRef.current) {
        document.activeElement?.blur();
        setEditMode(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  useEffect(() => () => destroyProviders(), []);

  // Broadcast which node the local user is viewing via awareness
  useEffect(() => {
    const aw = getAwareness();
    if (!aw) return;
    aw.setLocalStateField('focusedNode', focusedNodeId ?? hoveredNodeId ?? null);
  }, [focusedNodeId, hoveredNodeId]);

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onFileChanged(({ filePath, content }) => {
      // Only replace Y.Text when content differs — if CRDT already delivered
      // this change the content will match and replacing would cause a syntax-
      // highlighting flash and clobber peer cursors.
      const yText = getYText(filePath);
      if (yText.toString() !== content) {
        getDoc().transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, content);
        });
      }
    });
  }, []);

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

  const onEditorFocus = useCallback((nodeId) => {
    clearTimeout(editBlurTimer.current);
    setEditMode(true);
    markAccessed(nodeId);
  }, [markAccessed]);

  const onEditorBlur = useCallback(() => {
    // Debounce so clicking between two Monaco editors doesn't flash out of edit mode
    editBlurTimer.current = setTimeout(() => setEditMode(false), 100);
  }, []);

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

  // Phase 2: once ReactFlow has measured all file nodes, re-layout with actual sizes
  useEffect(() => {
    if (layoutPhaseRef.current !== 1) return;
    const tree = treeRef.current;
    if (!tree) return;
    const fileNodes = nodes.filter(n => n.type === 'file');
    if (fileNodes.length === 0) return;
    if (!fileNodes.every(n => n.width != null && n.width > 0)) return;

    layoutPhaseRef.current = 2;
    const sizeMap = new Map(fileNodes.map(n => [n.id, { w: n.width, h: n.height }]));
    setNodes(buildNodesFromTree(tree, sizeMap));
  }, [nodes, setNodes]);

  const openRootFolder = useCallback(() => {
    if (!window.electronAPI) return;
    nodesRef.current.forEach(n => {
      if (n.type === 'file' && n.data.filePath) window.electronAPI.unwatchFile(n.data.filePath);
    });
    window.electronAPI.openDirPicker().then(dirPath => {
      if (!dirPath) return;
      setRootPath(dirPath);
      initRoom(dirPath);
      window.electronAPI.readTree(dirPath).then(tree => {
        if (!tree) return;
        setFileTree(tree);
        treeRef.current = tree;
        layoutPhaseRef.current = 1;
        setNodes(buildNodesFromTree(tree)); // phase 1: estimated sizes
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
    // Don't let ReactFlow's measurement of the expanded node overwrite its real
    // stored dimensions in Yjs — that would make the node stay wide after shrink.
    const expandedId = expandedNodeIdRef.current;
    const shrinkingId = shrinkingNodeIdRef.current;
    const filtered = changes.filter(c =>
      !(c.type === 'dimensions' && (
        (expandedId  && c.id === expandedId) ||
        (shrinkingId && c.id === shrinkingId)
      ))
    );

    filtered.forEach(c => {
      if (c.type === 'remove') {
        const node = nodesRef.current.find(n => n.id === c.id);
        if (node?.type === 'file' && node.data.filePath && window.electronAPI) {
          window.electronAPI.unwatchFile(node.data.filePath);
        }
      }
    });
    onNodesChange(filtered);

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

  // Dragging and hover both trigger magnification; only hover spreads positions.
  const hoverActiveId = hoveredNodeId ?? draggingNodeId;
  const activeId = focusedNodeId ?? hoverActiveId;
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
  if (!focusedNodeId && hoveredNodeId && !draggingNodeId && magnifiedIds.size > 0) {
    const leaves = visibleNodes.filter(n => magnifiedIds.has(n.id) && n.type !== 'region');
    if (leaves.length > 0) {
      const cx = leaves.reduce((s, n) => s + n.position.x + (n.width ?? T_FW) / 2, 0) / leaves.length;
      const cy = leaves.reduce((s, n) => s + n.position.y + (n.height ?? T_FH) / 2, 0) / leaves.length;
      for (const n of leaves) {
        const nw = n.width ?? T_FW;
        const nh = n.height ?? T_FH;
        scaledPositions.set(n.id, {
          x: cx + (n.position.x + nw / 2 - cx) * hoverScale - nw / 2,
          y: cy + (n.position.y + nh / 2 - cy) * hoverScale - nh / 2,
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
    const isExpanded = node.id === expandedNodeId;

    const bounds = isRegion
      ? (isMagnified ? activeRegionBounds.get(node.id) : regionBounds.get(node.id)) ?? regionBounds.get(node.id)
      : null;
    const position = isRegion
      ? (bounds?.position ?? node.position)
      : (scaledPositions.get(node.id) ?? node.position);

    // Expand style is local — never stored in Yjs
    const style = isExpanded
      ? expandedDims
      : bounds
        ? { ...node.style, width: bounds.width, height: bounds.height }
        : node.style;

    return {
      ...node,
      position,
      style,
      draggable: !isRegion,
      className: isMagnified ? (focusedNodeId ? 'node-state-focused' : 'node-state-hovered') : '',
      zIndex: isRegion ? 0 : 10 + (accessStack.indexOf(node.id) + 1),
      data: {
        ...node.data,
        ...(node.type === 'chaperonin' ? { onChangeParam } : {}),
        ...(isRegion                   ? { onToggleCollapse: toggleRegionCollapse, onLinkDir } : {}),
        ...(node.type === 'file'       ? {
          onContentChange, onFilePicked, rootPath, onEditorFocus, onEditorBlur,
          expanded: isExpanded,
          peerColors: peers.filter(p => !p.isLocal && p.focusedNode === node.id).map(p => p.color),
        } : {}),
      },
    };
  });

  return (
    <PrefsContext.Provider value={{ theme, regionAlpha, hoverScale, dimScale, hoverDelay, focusZoom }}>
    <div className="ide-shell">
      <div className="ide-titlebar">
        {/* Logo */}
        <div className="titlebar-logo">
          <div className="titlebar-logo-mark" />
          <span className="titlebar-logo-name">graphite</span>
        </div>

        <div className="titlebar-sep" />

        <button className="titlebar-btn" onClick={openRootFolder}>open</button>

        <div className="titlebar-sep" />

        <button className="titlebar-btn" onClick={addFileNode}>file</button>
        <button className="titlebar-btn" onClick={addScriptNode}>script</button>
        <button className="titlebar-btn" onClick={addRegionNode}>region</button>

        <div className="titlebar-sep" />

        <button className="titlebar-btn" onClick={() => setShowPrefs(true)}>prefs</button>

        {rootPath && <span className="titlebar-path">{rootPath}</span>}

        <div className="titlebar-spacer" />

        {/* Peer cluster */}
        {peers.filter(p => !p.isLocal).length > 0 && (
          <div className="titlebar-peers">
            {peers.filter(p => !p.isLocal).slice(0, 4).map(p => (
              <div
                key={p.id}
                className="titlebar-peer-dot"
                style={{ background: p.color }}
                title={p.focusedNode ? `${p.name} — click to follow` : p.name}
                onClick={() => {
                  if (!p.focusedNode) return;
                  const node = nodesRef.current.find(n => n.id === p.focusedNode);
                  if (!node) return;
                  const { width: cw, height: ch } = document.querySelector('.ide-canvas')?.getBoundingClientRect()
                    ?? { width: window.innerWidth, height: window.innerHeight };
                  const zoom = focusZoomRef.current / 100;
                  const nw = node.width ?? 380;
                  const nh = node.height ?? 355;
                  centerViewport(setViewportRef.current, node.position.x + nw / 2, node.position.y + nh / 2, zoom, cw, ch);
                }}
              >
                {p.name.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>
        )}

        {/* Session button */}
        <button
          className={`titlebar-sync-btn${peers.length > 1 ? ' is-active' : ''}`}
          onClick={() => setShowSession(s => !s)}
        >
          <div className={`sync-dot${peers.length > 1 ? ' is-live' : ''}`} />
          {peers.length > 1 ? `sync · ${peers.length - 1}` : 'sync'}
        </button>
      </div>

      <Sidebar tree={fileTree} rootPath={rootPath} onFocusNode={focusNode} />

      <div className="ide-canvas">
        <ReactFlow
          nodes={nodesWithCallbacks}
          onNodesChange={handleNodesChange}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode={editMode ? null : ['Delete', 'Backspace']}
          panActivationKeyCode={editMode ? null : ' '}
          panOnDrag={!focusedNodeId}
          panOnScroll={!focusedNodeId}
          zoomOnScroll={!focusedNodeId}
          zoomOnPinch={!focusedNodeId}
          zoomOnDoubleClick={!focusedNodeId}
          proOptions={{ hideAttribution: true }}
          onNodeMouseEnter={(_, node) => {
            if (node.type === 'region') return;
            clearTimeout(hoverTimer.current);
            hoverTimer.current = setTimeout(() => {
              setHoveredNodeId(node.id);
              markAccessed(node.id);
            }, hoverDelay);
          }}
          onNodeDragStart={(_, node) => { setDraggingNodeId(node.id); markAccessed(node.id); }}
          onNodeDragStop={() => setDraggingNodeId(null)}
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

      <StatusBar rootPath={rootPath} nodeCount={nodes.length} peers={peers} />

      <SessionPanel
        open={showSession}
        onClose={() => setShowSession(false)}
        rootPath={rootPath}
      />

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
