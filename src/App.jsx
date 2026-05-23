import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PrefsContext, THEMES } from './ThemeContext.js';
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
import StatusBar from './components/StatusBar.jsx';
import { MODULES, CATEGORIES } from './data/modules.js';
import { annularBinPack } from './utils/layout.js';
import { assignColorIndices } from './utils/colors.js';
import PrefsPopup from './components/PrefsPopup.jsx';

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

function layoutSubtree(entry, colorIndices) {
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
  const colorIndex = colorIndices.get(entry.path) ?? 0;

  if (!children.length) {
    return {
      nodes: [{
        id: `dir:${entry.path}`,
        type: 'region',
        position: { x: 0, y: 0 },
        style: { width: 220, height: 100 },
        data: { label: entry.name, dirPath: entry.path, children: [], colorIndex },
        draggable: false,
      }],
      w: 220,
      h: 100,
    };
  }

  const childResults = children.map(child => {
    const id = child.type === 'file' ? `file:${child.path}` : `dir:${child.path}`;
    return { id, child, ...layoutSubtree(child, colorIndices) };
  });

  const packed = annularBinPack(childResults.map(cr => ({ id: cr.id, w: cr.w, h: cr.h })));
  const posMap = new Map(packed.map(p => [p.id, p]));

  const childIds = [];
  const allChildNodes = [];

  for (const cr of childResults) {
    childIds.push(cr.id);
    const pos = posMap.get(cr.id);
    const ox = T_PAD + pos.x;
    const oy = T_HDR + T_PAD + pos.y;
    allChildNodes.push(...cr.nodes.map(n => ({
      ...n,
      position: { x: n.position.x + ox, y: n.position.y + oy },
    })));
  }

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
        data: { label: entry.name, dirPath: entry.path, children: childIds, colorIndex },
        draggable: false,
      },
      ...allChildNodes,
    ],
    w,
    h,
  };
}

function buildNodesFromTree(root) {
  const colorIndices = assignColorIndices(root);
  const children = root.children ?? [];
  if (!children.length) return [];

  const childResults = children.map(child => {
    const id = child.type === 'file' ? `file:${child.path}` : `dir:${child.path}`;
    return { id, ...layoutSubtree(child, colorIndices) };
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
  const [theme, setTheme]             = useState(() => localStorage.getItem('theme') || 'dark');
  const [regionAlpha, setRegionAlpha] = useState(() => parseFloat(localStorage.getItem('regionAlpha') ?? '0.05'));
  const [hoverScale, setHoverScale]   = useState(() => parseFloat(localStorage.getItem('hoverScale')   ?? '1.2'));
  const [dimScale, setDimScale]       = useState(() => parseFloat(localStorage.getItem('dimScale')     ?? '0.8'));
  const [showPrefs, setShowPrefs]     = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [hoverDelay, setHoverDelay]       = useState(() => parseInt(localStorage.getItem('hoverDelay')  ?? '200', 10));
  const [focusZoom,   setFocusZoom]       = useState(() => parseFloat(localStorage.getItem('focusZoom') ?? '100'));

  const nodesRef        = useRef(nodes);
  const metaTimer       = useRef(null);
  const hoverTimer      = useRef(null);
  const hoveredNodeRef  = useRef(null);
  const focusedNodeRef  = useRef(null);
  const focusZoomRef    = useRef(focusZoom);
  const regionBoundsRef = useRef(new Map());
  const { fitView, getViewport, setViewport } = useReactFlow();
  const fitViewRef       = useRef(fitView);
  const setViewportRef   = useRef(setViewport);

  useEffect(() => { hoveredNodeRef.current  = hoveredNodeId; },  [hoveredNodeId]);
  useEffect(() => { focusedNodeRef.current  = focusedNodeId; },  [focusedNodeId]);
  useEffect(() => { focusZoomRef.current    = focusZoom; },      [focusZoom]);
  useEffect(() => { fitViewRef.current      = fitView; },        [fitView]);
  useEffect(() => { setViewportRef.current  = setViewport; },    [setViewport]);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem('regionAlpha', regionAlpha); }, [regionAlpha]);
  useEffect(() => { localStorage.setItem('hoverScale',  hoverScale);  }, [hoverScale]);
  useEffect(() => { localStorage.setItem('dimScale',    dimScale);    }, [dimScale]);
  useEffect(() => { localStorage.setItem('hoverDelay',  hoverDelay);  }, [hoverDelay]);
  useEffect(() => { localStorage.setItem('focusZoom',   focusZoom);   }, [focusZoom]);

  useEffect(() => {
    document.body.style.setProperty('--hover-scale', hoverScale);
    document.body.style.setProperty('--dim-scale',   dimScale);
  }, [hoverScale, dimScale]);

  // Alt+F: zoom viewport to hovered node at focusZoom level; toggle returns to overview
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
        focusedNodeRef.current = null;
        setTimeout(() => fitViewRef.current({ padding: 0.3, duration: 350 }), 80);
      } else if (hid) {
        const node = nodesRef.current.find(n => n.id === hid);
        if (!node) return;
        setHoveredNodeId(null);
        hoveredNodeRef.current = null;
        setFocusedNodeId(hid);
        focusedNodeRef.current = hid;

        const canvas = document.querySelector('.ide-canvas');
        const { width: cw, height: ch } = canvas?.getBoundingClientRect() ?? { width: 1200, height: 800 };
        const targetZoom = focusZoomRef.current / 100; // 100% → zoom 1.0
        const fill = 0.9;

        const isRegion = node.type === 'region';
        if (!isRegion) {
          // Expand node to fill the screen at targetZoom
          const nodeW = Math.round(cw * fill / targetZoom);
          const nodeH = Math.round(ch * fill / targetZoom);
          setNodes(nds => nds.map(n => {
            if (n.id !== hid) return n;
            return {
              ...n,
              style: { ...n.style, width: nodeW, height: nodeH },
              data: { ...n.data, expanded: true, _savedStyle: n.style ?? null },
            };
          }));
          // Pan to center after node has committed its new size
          setTimeout(() => {
            const fresh = nodesRef.current.find(n => n.id === hid);
            if (!fresh) return;
            const cx = fresh.position.x + nodeW / 2;
            const cy = fresh.position.y + nodeH / 2;
            setViewportRef.current(
              { x: cw / 2 - cx * targetZoom, y: ch / 2 - cy * targetZoom, zoom: targetZoom },
              { duration: 350 },
            );
          }, 80);
        } else {
          // Regions: just zoom-fit at targetZoom
          const b = regionBoundsRef.current.get(hid);
          if (!b) return;
          const cx = b.position.x + b.width / 2;
          const cy = b.position.y + b.height / 2;
          setViewportRef.current(
            { x: cw / 2 - cx * targetZoom, y: ch / 2 - cy * targetZoom, zoom: targetZoom },
            { duration: 350 },
          );
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

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
  regionBoundsRef.current = regionBounds;

  // Build magnified set: active node + its descendants + fully-visible ancestor regions
  const activeId = focusedNodeId ?? hoveredNodeId;
  const magnifiedIds = new Set();
  if (activeId) {
    magnifiedIds.add(activeId);

    // Descendants (region children propagate magnification inward)
    const byId = new Map(nodes.map(n => [n.id, n]));
    const queue = [activeId];
    while (queue.length > 0) {
      const id = queue.shift();
      for (const cid of byId.get(id)?.data?.children ?? []) {
        magnifiedIds.add(cid);
        queue.push(cid);
      }
    }

  }

  // Spread magnified leaf positions outward during hover only (CSS-scale causes visual overlap)
  // Skip spread when a node is expanded (physically large, no CSS scale applied)
  const magnifiedLeaves = (!focusedNodeId && hoveredNodeId)
    ? visibleNodes.filter(n => magnifiedIds.has(n.id) && n.type !== 'region')
    : [];
  const scaledPositions = new Map();
  if (magnifiedLeaves.length > 0 && activeId) {
    const cx = magnifiedLeaves.reduce((s, n) => s + n.position.x + T_FW / 2, 0) / magnifiedLeaves.length;
    const cy = magnifiedLeaves.reduce((s, n) => s + n.position.y + T_FH / 2, 0) / magnifiedLeaves.length;
    for (const n of magnifiedLeaves) {
      scaledPositions.set(n.id, {
        x: cx + (n.position.x + T_FW / 2 - cx) * hoverScale - T_FW / 2,
        y: cy + (n.position.y + T_FH / 2 - cy) * hoverScale - T_FH / 2,
      });
    }
  }

  // Re-derive region bounds from scaled leaf positions so parent regions expand too
  const scaledRegionBounds = scaledPositions.size > 0
    ? computeAllRegionBounds(nodes.map(n => { const sp = scaledPositions.get(n.id); return sp ? { ...n, position: sp } : n; }))
    : regionBounds;

  const nodesWithCallbacks = visibleNodes.map(node => {
    const isMagnified = magnifiedIds.has(node.id);

    const effectiveBounds = isMagnified
      ? (scaledRegionBounds.get(node.id) ?? regionBounds.get(node.id))
      : regionBounds.get(node.id);
    const scaledPos = (isMagnified && node.type !== 'region') ? scaledPositions.get(node.id) : null;

    let nodeClass = '';
    if (isMagnified) {
      nodeClass = focusedNodeId ? 'node-state-focused' : 'node-state-hovered';
    }

    return {
      ...node,
      ...(scaledPos ? { position: scaledPos } : {}),
      ...(effectiveBounds ? {
        position: effectiveBounds.position,
        style: { ...node.style, width: effectiveBounds.width, height: effectiveBounds.height },
      } : {}),
      draggable: node.type !== 'region',
      className: nodeClass,
      zIndex: node.type === 'region' ? 0 : (isMagnified ? 200 : 10),
      data: {
        ...node.data,
        ...(node.type === 'chaperonin' ? { onChangeParam } : {}),
        ...(node.type === 'region'     ? { onToggleCollapse: toggleRegionCollapse, onLinkDir } : {}),
        ...(node.type === 'file'       ? { onContentChange, onFilePicked } : {}),
      },
    };
  });

  return (
    <PrefsContext.Provider value={{ theme, regionAlpha, hoverScale, dimScale, hoverDelay, focusZoom }}>
    <div className="ide-shell">
      {/* Title bar */}
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

      {/* Sidebar */}
      <Sidebar tree={fileTree} rootPath={rootPath} onFocusNode={focusNode} />

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
                const left   = b.position.x * zoom + vpX;
                const top    = b.position.y * zoom + vpY;
                const right  = (b.position.x + b.width)  * zoom + vpX;
                const bottom = (b.position.y + b.height) * zoom + vpY;
                if (left >= 0 && top >= 0 && right <= cw && bottom <= ch) {
                  setHoveredNodeId(node.id);
                }
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

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
